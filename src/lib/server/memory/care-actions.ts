import { createHash, randomUUID } from 'node:crypto';
import { createRuntime, authenticatedActorContext, assertActorScope, type HostedLease } from '@victframework/runtime';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import { mastraThreadIdForConversation, mastraResourceIdForActor } from '@victframework/mastra';
import { neutralJsonContract } from '@victframework/sdk';
import { memoryCareActionBindings, type MemoryCareActionId, type MemoryCareActionInput } from '../../product/memory-contracts.js';
import { authorizedActor, getConversation, ProductError, type Owner } from '../domain/queries.js';
import { openQuellightMemory, QUELLIGHT_NATIVE_MEMORY_SCHEMA } from './native.js';
import { enqueueMemoryJob, publicConversationSources } from './jobs.js';
import { loadEffectiveMemorySettings, type EffectiveMemorySettings, type FencedMemorySettingsClient } from './settings.js';

const table = 'quellight_product_v1.memory_care_commands';
const attempts = 'quellight_product_v1.memory_care_attempts';
const leaseMs = 60_000; // Infrastructure ownership renewal; never a model duration limit.
const retryDelayMs = 30_000;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type OpenMemory = typeof openQuellightMemory;
type Memory = Awaited<ReturnType<OpenMemory>>;
type AuthorityInput = Parameters<Memory['service']['reviseAuthority']>[0];
export interface MemoryCareResult {
  authorityRevision: string; purgeQueued: number; rebuildQueued: number; retryQueued: number;
  cleanup: 'queued' | 'not-required';
}
export interface MemoryCareCommand {
  actor_id: string; command_key: string; conversation_id: string; action_id: MemoryCareActionId;
  argument_digest: string; input: MemoryCareActionInput; effective: EffectiveMemorySettings;
  authority_input: AuthorityInput | null; native_operation_id: string | null;
  expected_authority_revision: string; intended_authority_revision: string;
  state: 'pending' | 'retryable' | 'applied' | 'blocked'; attempts: number;
  claim_token: string | null; claim_expires: Date | null; wake_after: Date; failure_code: string | null;
  result: MemoryCareResult | null;
}
/** Trusted server injection only; never accepted from the action transport. */
export interface MemoryCareDependencies {
  openMemory?: OpenMemory;
}
interface CareContext { stores: PostgresStoreSet; actorId: string; lease: HostedLease; openMemory: OpenMemory }

async function sql<T>(context: CareContext, work: (client: FencedMemorySettingsClient) => Promise<T>): Promise<T> {
  let known: ProductError | undefined;
  try { return await context.stores.coordination.withFence(context.lease, async client => {
    try { return await work(client); }
    catch (error) { if (error instanceof ProductError) known = error; throw error; }
  }); } catch (error) { throw known ?? error; }
}
async function withOwnerLease<T>(stores: PostgresStoreSet, actorId: string, openMemory: OpenMemory,
  work: (context: CareContext) => Promise<T>): Promise<T> {
  const claim = await stores.coordination.acquire({ scopeId: `quellight-memory-care:${actorId}`, actorId, ownerId: randomUUID(), leaseMs });
  if (claim.status !== 'acquired') throw new ProductError('MEMORY_CARE_IN_PROGRESS', 409);
  const context = { stores, actorId, lease: claim.lease, openMemory };
  let stopped = false, renewal: Promise<void> | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const renew = () => {
    renewal = stores.coordination.renew(claim.lease, leaseMs).then(async () => {
      await sql(context, async client => { await client.query(`UPDATE ${table} SET claim_expires=$2
        WHERE actor_id=$1 AND claim_token IS NOT NULL AND state IN ('pending','retryable')`, [actorId, new Date(Date.now() + leaseMs)]); });
    }).catch(() => undefined).finally(() => { if (!stopped) timer = setTimeout(renew, leaseMs / 3); });
  };
  timer = setTimeout(renew, leaseMs / 3);
  try { return await work(context); }
  finally { stopped = true; if (timer) clearTimeout(timer); await renewal; await stores.coordination.release(claim.lease); }
}
async function command(context: CareContext, key: string) {
  return (await context.stores.coordination.pool.query<MemoryCareCommand>(`SELECT * FROM ${table} WHERE actor_id=$1 AND command_key=$2`, [context.actorId, key])).rows[0];
}
function failureCode(error: unknown) {
  if (error instanceof ProductError) return error.code;
  const own = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'code') : undefined;
  return own && 'value' in own && typeof own.value === 'string' && /^(VICT_|MEMORY_)[A-Z0-9_]+$/.test(own.value)
    ? own.value : 'MEMORY_CARE_UNCONFIRMED';
}
function blocked(code: string) {
  return /AUTHORITY_CHANGED|AUTHORITY_UNCONFIRMED|AUTHORITY_CONFLICT|ACTOR|ACCESS|PERMISSION|CONFIG|SCHEMA|OPERATION_CONFLICT/.test(code);
}
async function openFor(context: CareContext, row: Pick<MemoryCareCommand, 'conversation_id' | 'effective'>) {
  return context.openMemory({ stores: context.stores, ownerActorId: context.actorId,
    conversationId: row.conversation_id, effective: row.effective });
}

async function prepare(context: CareContext, actionId: MemoryCareActionId, input: MemoryCareActionInput,
  commandKey: string, argumentDigest: string): Promise<MemoryCareCommand> {
  // No SQL transaction is held while reading native state. The owner care lease serializes admissions.
  const conversation = (await context.stores.coordination.pool.query<{ room_id: string }>(
    'SELECT room_id FROM quellight_product_v1.conversations WHERE actor_id=$1 AND id=$2', [context.actorId, input.conversationId])).rows[0];
  if (!conversation) throw new ProductError('CONVERSATION_NOT_FOUND', 404);
  const effective = await loadEffectiveMemorySettings(context.stores.coordination.pool, context.actorId, conversation.room_id);
  const memory = await openFor(context, { conversation_id: input.conversationId, effective });
  try {
    const authority = await memory.service.authority(input.conversationId);
    if (authority.revision !== input.expectedAuthorityRevision) throw new ProductError('MEMORY_AUTHORITY_CONFLICT', 409);
    const selected = JSON.parse(input.sourceMessageIds) as string[];
    if ((actionId === 'memory.resume' || actionId === 'memory.retry') && selected.length) throw new ProductError('MEMORY_CARE_INPUT_INVALID');
    if (selected.length) {
      const threadId = mastraThreadIdForConversation(input.conversationId), resourceId = mastraResourceIdForActor(context.actorId);
      const sources = await memory.hosted.store.readNativeMemory(threadId, resourceId, async () =>
        (await memory.hosted.store.getStore('memory'))!.listMessages({ threadId, resourceId, perPage: false }));
      const valid = new Set(sources.messages.filter(message => message.threadId === threadId && message.resourceId === resourceId).map(message => message.id));
      if (selected.some(id => !valid.has(id))) throw new ProductError('MEMORY_SOURCE_NOT_FOUND', 404);
    }
    const operationId = `quellight-care:${digest([context.actorId, commandKey])}`;
    const intendedRevision = actionId === 'memory.retry' ? authority.revision : `care:${digest([context.actorId, commandKey, argumentDigest])}`;
    const authorityInput: AuthorityInput | null = actionId === 'memory.retry' ? null : {
      conversationId: input.conversationId, operationId, expectedRevision: authority.revision, revision: intendedRevision,
      excludedMessageIds: [...new Set([...authority.excludedMessageIds, ...selected])].sort(),
      correctedWorkingMemory: actionId === 'memory.correct' ? input.workingMemory! : actionId === 'memory.resume' ? null : authority.correctedWorkingMemory,
    };
    return { actor_id: context.actorId, command_key: commandKey, conversation_id: input.conversationId, action_id: actionId,
      argument_digest: argumentDigest, input, effective, authority_input: authorityInput, native_operation_id: authorityInput ? operationId : null,
      expected_authority_revision: authority.revision, intended_authority_revision: intendedRevision,
      state: 'pending', attempts: 0, claim_token: null, claim_expires: null, wake_after: new Date(), failure_code: null, result: null };
  } finally { await memory.hosted.close(); }
}

async function finalize(context: CareContext, row: MemoryCareCommand, attemptId: string): Promise<MemoryCareResult> {
  return sql(context, async client => {
    const current = (await client.query(`SELECT * FROM ${table} WHERE actor_id=$1 AND command_key=$2 FOR UPDATE`, [context.actorId, row.command_key])).rows[0] as MemoryCareCommand;
    if (current.state === 'applied') return current.result!;
    if (current.claim_token !== attemptId) throw new ProductError('MEMORY_CARE_IN_PROGRESS', 409);
    let retryQueued = 0, rebuildQueued = 0, purgeQueued = 0;
    if (row.action_id === 'memory.retry') {
      const reset = await client.query(`UPDATE quellight_product_v1.memory_jobs SET state='retryable',failure_code=NULL,
        wake_after=now(),updated_at=now() WHERE actor_id=$1 AND conversation_id=$2 AND authority_revision=$3
        AND state IN ('blocked','retryable') RETURNING id`, [context.actorId, row.conversation_id, row.intended_authority_revision]);
      for (const job of reset.rows) await client.query(`INSERT INTO quellight_product_v1.memory_job_events(job_id,state,code)
        VALUES($1,'retryable','OWNER_RETRY')`, [job.id]);
      retryQueued = reset.rows.length;
    } else {
      const superseded = await client.query(`UPDATE quellight_product_v1.memory_jobs SET state='superseded',claim_token=NULL,
        claim_expires=NULL,failure_code='MEMORY_AUTHORITY_CHANGED',updated_at=now() WHERE actor_id=$1 AND authority_revision<>$2
        AND state IN ('queued','running','retryable','blocked') RETURNING id`, [context.actorId, row.intended_authority_revision]);
      for (const job of superseded.rows) await client.query(`INSERT INTO quellight_product_v1.memory_job_events(job_id,state,code)
        VALUES($1,'superseded','MEMORY_AUTHORITY_CHANGED')`, [job.id]);
      const purge = await enqueueMemoryJob(client, { actorId: context.actorId, conversationId: row.conversation_id, kind: 'purge',
        sourceRevision: digest(row.authority_input), configuration: row.effective, authorityRevision: row.intended_authority_revision });
      purgeQueued = purge ? 1 : 0;
      // Untouched legacy conversations have no v2 native thread. Care never imports them
      // late or queues work that cannot run; first-chat admission owns their one-time import.
      const conversations = (await client.query(`SELECT c.id,c.room_id FROM quellight_product_v1.conversations c
        JOIN quellight_product_v1.memory_imports i ON i.actor_id=c.actor_id AND i.conversation_id=c.id
        WHERE c.actor_id=$1 AND i.schema_name=$2 ORDER BY c.created_at,c.id`,
      [context.actorId, QUELLIGHT_NATIVE_MEMORY_SCHEMA])).rows;
      for (const conversation of conversations) {
        const configuration = await loadEffectiveMemorySettings(client, context.actorId, conversation.room_id);
        const sources = await publicConversationSources(client, context.actorId, conversation.id);
        if (!sources.messages.length) continue;
        const job = await enqueueMemoryJob(client, { actorId: context.actorId, conversationId: conversation.id, kind: 'observe',
          sourceRevision: sources.revision, configuration, authorityRevision: row.intended_authority_revision });
        if (job) rebuildQueued++;
      }
    }
    const result: MemoryCareResult = { authorityRevision: row.intended_authority_revision, purgeQueued, rebuildQueued, retryQueued,
      cleanup: purgeQueued ? 'queued' : 'not-required' };
    await client.query(`UPDATE ${table} SET state='applied',result=$3::jsonb,claim_token=NULL,claim_expires=NULL,
      failure_code=NULL,updated_at=now() WHERE actor_id=$1 AND command_key=$2`, [context.actorId, row.command_key, JSON.stringify(result)]);
    return result;
  });
}

/** Every actual try has its own outer declared capability/run and native governed attempt.
 * A saved command result may replay; an interrupted original run is never rewritten as completed. */
async function attempt(context: CareContext, prepared: MemoryCareCommand): Promise<MemoryCareResult> {
  const attemptId = `quellight-care-attempt:${randomUUID()}`;
  const binding = memoryCareActionBindings[prepared.action_id];
  const runtime = createRuntime({ stores: context.stores.forLease(context.lease), ids: { runId: () => attemptId },
    payloadRetention: 'full', authority: { grants: [binding.permission] } });
  let originalError: unknown;
  runtime.registerCapability({ id: binding.capabilityId, revision: '1', effect: 'write', permissions: [binding.permission],
    input: binding.input, output: neutralJsonContract, invoke: async () => {
      let memory: Memory | undefined;
      try {
        const actor = authenticatedActorContext(await context.stores.actors.get(context.actorId), context.actorId);
        assertActorScope(actor, 'app.data.write');
        await sql(context, async client => {
          await client.query(`INSERT INTO ${table}(actor_id,command_key,conversation_id,action_id,argument_digest,input,effective,authority_input,
            native_operation_id,expected_authority_revision,intended_authority_revision,state)
            VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,'pending') ON CONFLICT(actor_id,command_key) DO NOTHING`,
          [context.actorId, prepared.command_key, prepared.conversation_id, prepared.action_id, prepared.argument_digest,
            JSON.stringify(prepared.input), JSON.stringify(prepared.effective), JSON.stringify(prepared.authority_input),
            prepared.native_operation_id, prepared.expected_authority_revision, prepared.intended_authority_revision]);
          const existing = (await client.query(`SELECT argument_digest,state FROM ${table} WHERE actor_id=$1 AND command_key=$2 FOR UPDATE`, [context.actorId, prepared.command_key])).rows[0];
          if (existing.argument_digest !== prepared.argument_digest) throw new ProductError('ACTION_CONFLICT', 409);
          if (existing.state === 'blocked') throw new ProductError('MEMORY_CARE_UNCONFIRMED', 409);
          await client.query(`UPDATE ${table} SET state='pending',attempts=attempts+1,claim_token=$3,claim_expires=$4,updated_at=now()
            WHERE actor_id=$1 AND command_key=$2 AND state<>'applied'`, [context.actorId, prepared.command_key, attemptId, new Date(Date.now() + leaseMs)]);
          await client.query(`INSERT INTO ${attempts}(attempt_id,actor_id,command_key,state) VALUES($1,$2,$3,'started')`, [attemptId, context.actorId, prepared.command_key]);
        });
        const stored = (await command(context, prepared.command_key))!;
        if (stored.state === 'applied') return stored.result!;
        memory = await openFor(context, stored);
        const authority = await memory.service.authority(stored.conversation_id);
        if (stored.action_id === 'memory.retry') {
          if (authority.revision !== stored.expected_authority_revision) throw new ProductError('MEMORY_AUTHORITY_CONFLICT', 409);
        } else {
          if (![stored.expected_authority_revision, stored.intended_authority_revision].includes(authority.revision))
            throw new ProductError('MEMORY_CARE_AUTHORITY_UNCONFIRMED', 409);
          await memory.service.reviseAuthority(stored.authority_input!);
        }
        return await finalize(context, stored, attemptId);
      } catch (error) {
        originalError = error;
        const code = failureCode(error);
        await sql(context, async client => {
          await client.query(`UPDATE ${table} SET state=$3,claim_token=NULL,claim_expires=NULL,failure_code=$4,wake_after=$5,updated_at=now()
            WHERE actor_id=$1 AND command_key=$2 AND state<>'applied'`,
          [context.actorId, prepared.command_key, blocked(code) ? 'blocked' : 'retryable', code, new Date(Date.now() + retryDelayMs)]);
          await client.query(`UPDATE ${attempts} SET state='failed',failure_code=$2,settled_at=now() WHERE attempt_id=$1`, [attemptId, code]);
        }).catch(() => undefined); // Lease loss leaves the admitted command for a later fenced recovery.
        throw error;
      } finally { await memory?.hosted.close(); }
    } });
  const activation = await runtime.activate({ id: `quellight.${binding.id}`, entry: 'care', nodes: [{ id: 'care', capability: binding.capabilityId }], edges: [] });
  if (!activation.ok) throw new ProductError('MEMORY_CARE_CONFIGURATION_INVALID', 503);
  await runtime.run(prepared.input, { mode: 'normal' });
  const run = await context.stores.forLease(context.lease).execution.getRun(attemptId);
  if (run?.status !== 'completed') {
    if (originalError instanceof ProductError) throw originalError;
    throw new ProductError(failureCode(originalError), 503);
  }
  await sql(context, async client => { await client.query(`UPDATE ${attempts} SET state='completed',settled_at=now() WHERE attempt_id=$1`, [attemptId]); });
  return run.output as MemoryCareResult;
}

export async function executeMemoryCareAction(stores: PostgresStoreSet, owner: Owner, actionId: string,
  input: unknown, commandKey: string, dependencies: MemoryCareDependencies = {}) {
  if (!Object.hasOwn(memoryCareActionBindings, actionId)) throw new ProductError('ACTION_UNDECLARED');
  if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(commandKey)) throw new ProductError('ACTION_KEY_INVALID');
  const binding = memoryCareActionBindings[actionId as MemoryCareActionId], parsed = binding.input.parse(input);
  if (!parsed.ok) throw new ProductError('ACTION_INPUT_INVALID');
  await authorizedActor(stores, owner, 'app.data.write');
  await getConversation(stores, owner, parsed.value.conversationId); // Archived conversations retain memory care.
  const argumentDigest = digest({ actionId: binding.id, revision: '1', input: parsed.value });
  return withOwnerLease(stores, owner.actorId, dependencies.openMemory ?? openQuellightMemory, async context => {
    const prior = await command(context, commandKey);
    if (prior && prior.argument_digest !== argumentDigest) throw new ProductError('ACTION_CONFLICT', 409);
    if (prior?.state === 'applied') return { ok: true as const, value: prior.result!, replay: true };
    const pending = (await stores.coordination.pool.query<MemoryCareCommand>(`SELECT * FROM ${table} WHERE actor_id=$1
      AND state IN ('pending','retryable','blocked') ORDER BY created_at`, [owner.actorId])).rows[0];
    if (pending?.state === 'blocked') throw new ProductError('MEMORY_CARE_UNCONFIRMED', 409);
    if (pending && pending.command_key !== commandKey) await attempt(context, pending);
    const prepared = prior ?? await prepare(context, binding.id, parsed.value, commandKey, argumentDigest);
    return { ok: true as const, value: await attempt(context, prepared), replay: false };
  });
}

/** Dispatcher recovery after browser/process loss. Deadline only controls admission of the next
 * short command; these keyless care operations make no inference calls. */
export async function processPendingMemoryCare(stores: PostgresStoreSet, deadlineEpochMs: number,
  dependencies: MemoryCareDependencies = {}) {
  const results: { actorId: string; commandKey: string; state: string; code?: string }[] = [];
  const seen = new Set<string>();
  while (Date.now() < deadlineEpochMs) {
    const due = (await stores.coordination.pool.query<MemoryCareCommand>(`SELECT * FROM ${table} WHERE state IN ('pending','retryable')
      AND wake_after<=now() AND (claim_expires IS NULL OR claim_expires<=now()) ORDER BY wake_after,created_at`)).rows
      .find(row => !seen.has(`${row.actor_id}:${row.command_key}`));
    if (!due) break;
    seen.add(`${due.actor_id}:${due.command_key}`);
    try {
      const state = await withOwnerLease(stores, due.actor_id, dependencies.openMemory ?? openQuellightMemory, async context => {
        const current = await command(context, due.command_key);
        if (!current) return 'unavailable';
        if (current.state === 'applied' || current.state === 'blocked') return current.state;
        await attempt(context, current);
        return 'applied';
      });
      results.push({ actorId: due.actor_id, commandKey: due.command_key, state });
    } catch (error) {
      const code = failureCode(error);
      results.push({ actorId: due.actor_id, commandKey: due.command_key, state: blocked(code) ? 'blocked' : 'retryable', code });
    }
  }
  return { processed: results.length, results };
}
