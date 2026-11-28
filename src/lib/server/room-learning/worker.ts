import { randomUUID } from 'node:crypto';
import { createRuntime } from '@victframework/runtime';
import { mastraResourceIdForActor, mastraThreadIdForConversation, type MastraProductAgentConfig } from '@victframework/mastra';
import { neutralJsonContract } from '@victframework/sdk';
import type { HostedLease } from '@victframework/runtime';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import type { RoomLearningField } from '../../product/room-learning.js';
import { authorizedActor, ProductError } from '../domain/queries.js';
import { createDeskMethodExecutor, type DeskMethodExecutionRef } from '../desk-method-execution.js';
import { withMemoryAuthorityFence } from '../memory/authority-fence.js';
import { memoryDigest, publicConversationSources, type MemoryJob } from '../memory/jobs.js';
import { memorySources, policyIdentity } from '../memory/inspection.js';
import type { openQuellightMemory } from '../memory/native.js';
import { loadEffectiveMemorySettings, type FencedMemorySettingsClient } from '../memory/settings.js';
import { promptCatalog, renderPrompt } from '../prompts/catalog.js';
import { dimensions, fieldText, roomLearningJobs, roomMarker, roomRevision, writeRoomRevision } from './store.js';

const learningPolicy = 'quellight.room-learning@1';
const instructions = renderPrompt(promptCatalog.roomLearning, {}).text;

interface Evidence { id: string; conversationId: string; text: string; at: string }
type Source = RoomLearningField['sources'][number] & { at?: string };
type StoredField = Omit<RoomLearningField, 'sources'> & { sources: Source[] };
type OpenMemory = Awaited<ReturnType<typeof openQuellightMemory>>;
type State = 'pending' | 'prepared' | 'published' | 'no-change' | 'superseded';
interface Journal {
  actor_id: string;
  room_id: string;
  base_revision: number;
  authority_revision: string;
  source_revision: string;
  configuration_revision: string;
  pins_digest: string;
  attempt_id: string;
  state: State;
  candidate: StoredField[] | null;
  execution_ref: DeskMethodExecutionRef | null;
}
const retryAttempt = new Set(['DESK_METHOD_GENERATION_INTERRUPTED', 'DESK_METHOD_ATTEMPT_TERMINAL', 'DESK_METHOD_GENERATION_FAILED']);
const done = new Set<State>(['published', 'no-change', 'superseded']);
const invalidOutput = () => new ProductError('ROOM_GUIDANCE_SYNTHESIS_INVALID', 503);

function parseCandidate(output: string, evidence: readonly Evidence[]) {
  let parsed: unknown;
  const text = output.trim();
  const codeFence = new RegExp('^' + String.fromCharCode(96).repeat(3) + '(?:json)?\\s+([\\s\\S]*?)\\s+' + String.fromCharCode(96).repeat(3) + '$', 'i');
  try { parsed = JSON.parse(codeFence.exec(text)?.[1] ?? text); }
  catch { throw invalidOutput(); }
  if (!Array.isArray(parsed) || parsed.length > dimensions.length) throw invalidOutput();
  const used = new Set<string>();
  const findings: StoredField[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
      Object.keys(row).sort().join(',') !== 'certainty,dimension,quote,sourceId,text') throw invalidOutput();
    if (!dimensions.includes(row.dimension) || used.has(row.dimension) ||
      !['stated', 'tentative'].includes(row.certainty)) throw invalidOutput();
    const source = evidence.find(original => original.id === row.sourceId);
    if (!source || typeof row.quote !== 'string' || row.quote.trim() !== row.quote || !row.quote ||
      Buffer.byteLength(row.quote) > 650 || !source.text.includes(row.quote)) throw invalidOutput();
    used.add(row.dimension);
    const direct = fieldText(row.text);
    const claim = direct && row.quote.normalize('NFC').includes(direct) ? direct : fieldText(row.quote);
    // A valid original can supply the entire field when a proposed short excerpt cannot.
    if (!claim) continue;
    findings.push({ dimension: row.dimension, certainty: row.certainty, text: claim, origin: 'learned',
      sources: [{ id: source.id, conversationId: source.conversationId, quote: row.quote, at: source.at }] });
  }
  return findings;
}

function mergeFields(prior: StoredField[], proposals: StoredField[]) {
  const fields: StoredField[] = [];
  const changed: string[] = [];
  for (const dimension of dimensions) {
    const old = prior.find(field => field.dimension === dimension);
    const candidate = proposals.find(field => field.dimension === dimension);
    const newer = !old || (candidate?.sources[0]?.at ?? '') > (old.sources[0]?.at ?? '');
    if (candidate && old?.origin !== 'owner' && newer &&
      (old?.text !== candidate.text || old?.certainty !== candidate.certainty)) {
      fields.push(candidate);
      changed.push(dimension);
    } else if (old) fields.push(old);
  }
  return { fields, changed };
}

async function verifiedEvidence(stores: PostgresStoreSet, memory: OpenMemory, job: MemoryJob, operationId: string) {
  const threadId = mastraThreadIdForConversation(job.conversation_id);
  const resourceId = mastraResourceIdForActor(job.actor_id);
  const authority = await memory.service.authority(job.conversation_id);
  if (authority.revision !== job.authority_revision) return null;
  const operation = await memory.service.operation(job.conversation_id, operationId);
  const mutation = operation?.result;
  const publications = Array.isArray(operation?.events)
    ? operation.events.filter(event => event && typeof event === 'object' && event.name === 'published').length
    : 0;
  if (operation?.status !== 'completed' || operation.operation_id !== operationId || publications !== 1 ||
    operation.authority_revision !== authority.revision ||
    operation.thread_id !== threadId || !mutation || !('observed' in mutation) ||
    (!mutation.observed && !mutation.reflected) || mutation.sourceRevision !== operation.source_digest ||
    mutation.configurationRevision !== operation.configuration_revision ||
    mutation.snapshot.authorityRevision !== authority.revision || mutation.snapshot.conversationId !== job.conversation_id ||
    mutation.snapshot.resourceId !== resourceId) return null;
  const membership = mutation.sourceMembership;
  if (membership?.schema !== 'vict.mastra-observation-membership@1') return null;
  const ids = [...new Set(membership.groups.flatMap(group => group.status === 'available' ? [...group.messageIds] : []))].slice(-48);
  if (!ids.length) return null;
  const publicSources = await publicConversationSources(stores.coordination.pool, job.actor_id, job.conversation_id);
  if (publicSources.revision !== job.source_revision) return null;
  const eligibleText = new Set(publicSources.messages.filter(message => message.role === 'user').map(message => message.text.trim()));
  const listed = await memory.hosted.store.readNativeMemory(threadId, resourceId, async () => {
    const domain = await memory.hosted.store.getStore('memory');
    if (!domain) throw new ProductError('ROOM_GUIDANCE_UNAVAILABLE', 503);
    return (await domain.listMessagesById({ messageIds: ids })).messages;
  });
  if (policyIdentity(await memory.service.authority(job.conversation_id)) !== policyIdentity(authority)) return null;
  const permittedIds = new Set(ids);
  const originals = listed.filter(message => permittedIds.has(message.id) && message.threadId === threadId && message.resourceId === resourceId);
  const sources: Evidence[] = memorySources(originals, job.conversation_id, authority)
    .filter(message => message.role === 'user' && !message.excluded && message.at !== null && eligibleText.has(message.text.trim()))
    .map(message => ({ id: message.id, conversationId: job.conversation_id, text: message.text.slice(0, 2000), at: message.at! }))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).slice(-12);
  return sources.length ? { sources, nativeSource: mutation.sourceRevision, identity: policyIdentity(authority) } : null;
}

async function readJournal(client: FencedMemorySettingsClient, job: MemoryJob, lock = false) {
  return ((await client.query('SELECT actor_id,room_id,base_revision,authority_revision,source_revision,configuration_revision,' +
    'pins_digest,attempt_id,state,candidate,execution_ref FROM ' + roomLearningJobs + ' WHERE actor_id=$1 AND job_id=$2' +
    (lock ? ' FOR UPDATE' : ''), [job.actor_id, job.id])).rows[0] as unknown as Journal | undefined);
}

export async function processRoomLearning(args: {
  stores: PostgresStoreSet; memory: OpenMemory; job: MemoryJob; operationId: string;
  lease: HostedLease; deadline: Date; signal: AbortSignal;
  modelFactory: () => Promise<MastraProductAgentConfig['modelFactory']>;
}) {
  const { stores, memory, job, operationId, lease, deadline, signal, modelFactory } = args;
  const client = stores.coordination.pool;
  const owner = { id: job.actor_id, actorId: job.actor_id, email: '' };
  const readAuthority = () => memory.service.authority(job.conversation_id);
  const initial = await readJournal(client, job);
  if (initial && done.has(initial.state)) return;
  const evidence = await verifiedEvidence(stores, memory, job, operationId);
  if (!evidence && !initial) return;
  const conversation = (await client.query('SELECT room_id FROM quellight_product_v1.conversations WHERE id=$1 AND actor_id=$2',
    [job.conversation_id, job.actor_id])).rows[0];
  if (!conversation) return;
  const roomId = conversation.room_id as string;

  async function stage<T>(name: string, work: (db: FencedMemorySettingsClient) => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    await authorizedActor(stores, owner, 'app.data.write');
    const id = 'quellight.room-learning.' + name;
    const runId = 'room-learning:' + job.id + ':' + name + ':' + randomUUID();
    const runtimeStores = stores.forLease(lease);
    const runtime = createRuntime({ stores: runtimeStores, ids: { runId: () => runId }, payloadRetention: 'full',
      authority: { grants: [id] } });
    let failure: unknown;
    runtime.registerCapability({ id, revision: '1', effect: 'write', permissions: [id],
      input: neutralJsonContract, output: neutralJsonContract, invoke: async () => {
        try {
          return await withMemoryAuthorityFence(stores, job.actor_id, job.authority_revision, readAuthority, async db => {
            await stores.coordination.assertInTransaction(db, lease);
            const claimed = (await db.query('SELECT 1 FROM quellight_product_v1.memory_jobs WHERE id=$1 AND actor_id=$2 ' +
              'AND claim_token=$3 AND state=$4 AND claim_expires>now() FOR UPDATE',
              [job.id, job.actor_id, job.claim_token, 'running'])).rows[0];
            if (!claimed) throw new ProductError('ROOM_GUIDANCE_CLAIM_LOST', 409);
            const output = await work(db);
            await stores.coordination.assertInTransaction(db, lease);
            return output;
          }, async () => {
            signal.throwIfAborted();
            await authorizedActor(stores, owner, 'app.data.write');
          });
        } catch (error) { failure = error; throw error; }
      } });
    const activation = await runtime.activate({ id, entry: 'write', nodes: [{ id: 'write', capability: id }], edges: [] });
    if (!activation.ok) throw new ProductError('ROOM_GUIDANCE_UNAVAILABLE', 503);
    await runtime.run({ jobId: job.id, roomId, stage: name }, { mode: 'normal' });
    const result = await runtimeStores.execution.getRun(runId);
    if (result?.status !== 'completed') throw failure ?? new ProductError('ROOM_GUIDANCE_UNAVAILABLE', 503);
    return result.output as T;
  }
  const invalidate = async (db: FencedMemorySettingsClient, code: string) => {
    await db.query('UPDATE ' + roomLearningJobs + ' SET state=$2,failure_code=$3,updated_at=now() WHERE job_id=$1 ' +
      'AND state IN ($4,$5)', [job.id, 'superseded', code, 'pending', 'prepared']);
    return null;
  };

  async function checkPins(db: FencedMemorySettingsClient) {
    const marker = await roomMarker(db, job.actor_id, roomId, true);
    const current = await readJournal(db, job, true);
    if (current && done.has(current.state)) return null;
    const freshRoom = (await db.query('SELECT room_id FROM quellight_product_v1.conversations WHERE id=$1 AND actor_id=$2',
      [job.conversation_id, job.actor_id])).rows[0]?.room_id;
    const configuration = await loadEffectiveMemorySettings(db, job.actor_id, roomId);
    if (!evidence || freshRoom !== roomId || !configuration.configuration.values.automaticLearning ||
      configuration.revision !== job.configuration_revision ||
      (await publicConversationSources(db, job.actor_id, job.conversation_id)).revision !== job.source_revision ||
      (current && (current.room_id !== roomId || current.base_revision !== marker.room_guidance_revision ||
        current.authority_revision !== job.authority_revision || current.source_revision !== job.source_revision ||
        current.configuration_revision !== job.configuration_revision))) return invalidate(db, 'ROOM_GUIDANCE_INPUT_CHANGED');
    const prior = marker.room_guidance_authority === job.authority_revision
      ? (await roomRevision(db, job.actor_id, roomId, marker.room_guidance_revision))?.fields as StoredField[] ?? [] : [];
    const input = JSON.stringify({ prior: prior.map(({ dimension, text, certainty, origin }) => ({ dimension, text, certainty, origin })),
      sources: evidence.sources.map(({ id, text }) => ({ id, text })) });
    const digest = memoryDigest([learningPolicy, instructions, marker.room_guidance_revision,
      job.authority_revision, job.source_revision, job.configuration_revision, evidence.nativeSource, evidence.identity, input]);
    if (current && current.pins_digest !== digest) return invalidate(db, 'ROOM_GUIDANCE_INPUT_CHANGED');
    return { marker, current, prior, digest, input };
  }

  const prepared = await stage('pin', async db => {
    const pins = await checkPins(db);
    if (!pins) return null;
    if (!pins.current) {
      await db.query('INSERT INTO ' + roomLearningJobs + '(job_id,actor_id,room_id,base_revision,authority_revision,' +
        'source_revision,configuration_revision,pins_digest,attempt_id,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [job.id, job.actor_id, roomId, pins.marker.room_guidance_revision, job.authority_revision,
          job.source_revision, job.configuration_revision, pins.digest, randomUUID(), 'pending']);
    }
    return { input: pins.input, digest: pins.digest, journal: await readJournal(db, job) };
  });
  if (!prepared?.journal) return;

  const journal = prepared.journal;
  if (journal.state === 'pending') {
    const generate = createDeskMethodExecutor({ modelFactory, role: 'room-learning' });
    let generated;
    try {
      generated = await generate(stores, { actorId: job.actor_id, jobId: job.id, attemptId: journal.attempt_id,
        instructions, input: prepared.input, revision: prepared.digest, deadline });
    } catch (error) {
      if (error instanceof ProductError && retryAttempt.has(error.code)) {
        await stage('retire-attempt', async db => {
          const pins = await checkPins(db);
          if (pins?.current?.state === 'pending' && pins.current.attempt_id === journal.attempt_id)
            await db.query('UPDATE ' + roomLearningJobs + ' SET attempt_id=$2,failure_code=$3,updated_at=now() WHERE job_id=$1',
              [job.id, randomUUID(), 'ROOM_GUIDANCE_GENERATION_FAILED']);
          return { retired: true };
        });
      }
      throw error;
    }
    const ref = generated.executionRef;
    if (ref.status !== 'completed' || ref.jobId !== job.id || ref.attemptId !== journal.attempt_id)
      throw new ProductError('ROOM_GUIDANCE_UNAVAILABLE', 503);
    let candidate: StoredField[];
    try { candidate = parseCandidate(generated.text, evidence?.sources ?? []); }
    catch (error) {
      await stage('reject', async db => {
        const pins = await checkPins(db);
        if (pins?.current?.state === 'pending')
          await db.query('UPDATE ' + roomLearningJobs +
            ' SET state=$2,failure_code=$3,execution_ref=$4::jsonb,updated_at=now() WHERE job_id=$1',
            [job.id, 'no-change', 'ROOM_GUIDANCE_SYNTHESIS_INVALID', JSON.stringify(ref)]);
        return { rejected: true };
      });
      if (!(error instanceof ProductError)) throw error;
      return;
    }
    await stage('prepare', async db => {
      const pins = await checkPins(db);
      if (pins?.current?.state === 'pending' && pins.current.attempt_id === journal.attempt_id)
        await db.query('UPDATE ' + roomLearningJobs +
          ' SET state=$2,candidate=$3::jsonb,execution_ref=$4::jsonb,failure_code=NULL,updated_at=now() WHERE job_id=$1',
          [job.id, 'prepared', JSON.stringify(candidate), JSON.stringify(ref)]);
      return { prepared: true };
    });
  }
  await stage('publish', async db => {
    const pins = await checkPins(db);
    const current = pins?.current;
    if (!pins || current?.state !== 'prepared' || !current.candidate || !current.execution_ref) return { published: false };
    const { fields, changed } = mergeFields(pins.prior, current.candidate);
    if (changed.length) await writeRoomRevision(db, { actorId: job.actor_id, roomId, authorityRevision: job.authority_revision,
      previousRevision: current.base_revision, kind: 'learned', fields, changed, sourceRevision: current.source_revision,
      jobId: job.id, executionRef: current.execution_ref });
    await db.query('UPDATE ' + roomLearningJobs + ' SET state=$2,updated_at=now() WHERE job_id=$1',
      [job.id, changed.length ? 'published' : 'no-change']);
    return { published: changed.length > 0 };
  });
}
