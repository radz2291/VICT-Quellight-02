import { createHash, randomUUID } from 'node:crypto';
import { ModelRouterLanguageModel } from '@mastra/core/llm';
import { AgentTurnService } from '@victframework/control';
import {
  composeMastraTurnExecutor,
  MastraSanitizedLogger, mastraThreadIdForConversation, type MastraProductAgentConfig,
} from '@victframework/mastra';
import {
  AgentStreamHub, assertActorScope, authenticatedActorContext, gateCapabilityInvoke,
  type AuthenticatedActorContext, type AgentTurnRecord, type HostedLease,
} from '@victframework/runtime';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import type { CapabilityContext } from '@victframework/sdk';
import { getConversation, ProductError, type Owner } from '../domain/queries.js';
import { conversationActivation, MODEL, PROVIDER_URL } from './activation.js';
import { loadEffectiveMemorySettings, type EffectiveMemorySettings } from '../memory/settings.js';
import { enqueueMemoryJob, publicConversationSources } from '../memory/jobs.js';
import { openQuellightMemory, QUELLIGHT_MEMORY_RECALL_PERMISSION } from '../memory/native.js';
import { ensureNativeSources } from '../memory/import.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE = ['queued', 'running'];
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'blocked']);
// This matches the selected Vercel Hobby platform maximum, rather than a generation budget.
const HOST_LEASE_MS = 300_000;
const TABLE = 'quellight_product_v1.conversation_turns';
const FRAGMENTS = 'quellight_product_v1.turn_fragments';

interface TurnRow {
  turn_id: string; actor_id: string; conversation_id: string; request_key: string;
  input_digest: string; input_text: string; activation_version: string;
  execution_state: string; output_text: string | null; error_code: string | null;
  published_sequence: string | number; created_at: Date; updated_at: Date;
  memory_configuration?: EffectiveMemorySettings | null;
  memory_authority_revision?: string | null;
}
export interface ConversationServiceOptions {
  openDatabase(): Promise<PostgresStoreSet>;
  readCredential(): Promise<string>;
  modelFactory?: MastraProductAgentConfig['modelFactory'];
}
function turnIds(turnId: string) {
  return { turnId: () => turnId, streamId: () => `stream:${turnId}`, invocationId: randomUUID,
    approvalId: randomUUID, idempotencyKey: randomUUID, cancelId: randomUUID };
}
function scopeFor(conversationId: string) { return `quellight:conversation:${conversationId}`; }
function validateId(id: string) {
  if (!UUID.test(id)) throw new ProductError('CONVERSATION_NOT_FOUND', 404);
}
async function currentActor(stores: PostgresStoreSet, owner: Owner, scope: 'agent.turn.start' | 'run.read') {
  const actor = authenticatedActorContext(await stores.actors.get(owner.actorId), owner.actorId);
  assertActorScope(actor, scope);
  return actor;
}
function viewTurn(row: TurnRow, turn?: AgentTurnRecord) {
  return { id: row.turn_id, status: turn?.status ?? (row.execution_state === 'interrupted' ? 'failed' : 'intent'),
    streamId: `stream:${row.turn_id}`, errorCode: turn?.errorCode ?? row.error_code ?? undefined,
    // The VICT terminal gate may finish before the public transcript snapshot.
    // Observers keep their streamed text until this independently truthful gate closes.
    projectionSettled: !ACTIVE.includes(row.execution_state) };
}

export function createConversationService(options: ConversationServiceOptions) {
  async function getRow(stores: PostgresStoreSet, owner: Owner, turnId: string) {
    const rows = await stores.coordination.pool.query<TurnRow>(`SELECT * FROM ${TABLE} WHERE turn_id=$1 AND actor_id=$2`, [turnId, owner.actorId]);
    if (!rows.rows[0]) throw new ProductError('TURN_NOT_FOUND', 404);
    return rows.rows[0];
  }
  async function settleProjection(stores: PostgresStoreSet, lease: HostedLease, row: TurnRow, errorCode?: string) {
    await stores.coordination.withFence(lease, async (client) => {
      await client.query(`UPDATE ${TABLE} SET execution_state=$2, error_code=$3,
        output_text=(SELECT string_agg(delta,'' ORDER BY sequence) FROM ${FRAGMENTS} WHERE turn_id=$1), updated_at=now()
        WHERE turn_id=$1 AND actor_id=$4`, [row.turn_id, errorCode ? 'interrupted' : 'settled', errorCode ?? null, row.actor_id]);
      await client.query(`UPDATE quellight_product_v1.conversations SET updated_at=now() WHERE id=$1 AND actor_id=$2`, [row.conversation_id, row.actor_id]);
      // The public transcript and its durable catch-up intent commit together. A host
      // exit cannot leave a settled Phase 2 reply with no browser-independent wake path.
      if (row.memory_configuration && row.memory_authority_revision !== null && row.memory_authority_revision !== undefined) {
        const source = await publicConversationSources(client, row.actor_id, row.conversation_id);
        await enqueueMemoryJob(client, { actorId: row.actor_id, conversationId: row.conversation_id, kind: 'observe',
          sourceRevision: source.revision, configuration: row.memory_configuration, authorityRevision: row.memory_authority_revision });
      }
    });
  }
  async function reconcileOwned(stores: PostgresStoreSet, lease: HostedLease, owner: Owner, conversationId: string) {
    const rows = await stores.coordination.pool.query<TurnRow>(`SELECT * FROM ${TABLE} WHERE conversation_id=$1 AND actor_id=$2 AND execution_state=ANY($3::text[])`, [conversationId, owner.actorId, ACTIVE]);
    const fenced = stores.forLease(lease);
    for (const row of rows.rows) {
      let turn = await fenced.turns.getTurn(row.turn_id);
      if (turn && !TERMINAL.has(turn.status)) {
        const cancelled = await fenced.turns.hasCancelIntent(row.turn_id);
        turn = await fenced.turns.reconcileTurn({ turnId: row.turn_id, status: cancelled ? 'cancelled' : 'failed',
          reasonCode: cancelled ? 'VICT_TURN_CANCELLED' : 'VICT_TURN_INTERRUPTED', at: Date.now() });
      }
      await settleProjection(stores, lease, row, turn?.errorCode ?? (turn ? undefined : 'TURN_START_INTERRUPTED'));
    }
  }
  async function reconcileIfReleased(stores: PostgresStoreSet, owner: Owner, conversationId: string) {
    const claim = await stores.coordination.acquire({ scopeId: scopeFor(conversationId), actorId: owner.actorId,
      ownerId: randomUUID(), leaseMs: HOST_LEASE_MS });
    if (claim.status !== 'acquired') return;
    try { await reconcileOwned(stores, claim.lease, owner, conversationId); }
    finally { await stores.coordination.release(claim.lease); }
  }

  async function start(owner: Owner, conversationId: string, request: unknown, deadline?: Date) {
    validateId(conversationId);
    if (!request || typeof request !== 'object' || !('input' in request) || typeof request.input !== 'string' ||
        !request.input.trim() || !('idempotencyKey' in request) || typeof request.idempotencyKey !== 'string' ||
        !UUID.test(request.idempotencyKey) || Object.keys(request).some(key => !['input', 'idempotencyKey'].includes(key))) {
      throw new ProductError('TURN_INPUT_INVALID');
    }
    const input = request.input;
    const key = request.idempotencyKey;
    const digest = createHash('sha256').update(input).digest('hex');
    const stores = await options.openDatabase();
    let lease: HostedLease | undefined;
    let backgroundOwnsResources = false;
    try {
      const conversation = await getConversation(stores, owner, conversationId);
      const actor = await currentActor(stores, owner, 'agent.turn.start');
      const prior = await stores.coordination.pool.query<TurnRow>(`SELECT * FROM ${TABLE} WHERE actor_id=$1 AND conversation_id=$2 AND request_key=$3`, [owner.actorId, conversationId, key]);
      if (prior.rows[0]) {
        if (prior.rows[0].input_digest !== digest) throw new ProductError('TURN_IDEMPOTENCY_CONFLICT', 409);
        await reconcileIfReleased(stores, owner, conversationId);
        const row = await getRow(stores, owner, prior.rows[0].turn_id);
        const turn = await stores.turns.getTurn(row.turn_id);
        return { turnId: row.turn_id, conversationId, status: viewTurn(row, turn).status, completion: Promise.resolve() };
      }
      if (conversation.archivedAt || conversation.roomArchivedAt) throw new ProductError('ROOM_ARCHIVED', 409);
      const remaining = deadline ? Math.floor(deadline.getTime() - Date.now()) : HOST_LEASE_MS;
      if (remaining < 100) throw new ProductError('HOST_REQUEST_ENDING', 503);
      const claimed = await stores.coordination.acquire({ scopeId: scopeFor(conversationId), actorId: owner.actorId,
        ownerId: randomUUID(), leaseMs: Math.min(remaining, HOST_LEASE_MS) });
      if (claimed.status !== 'acquired') {
        // A concurrent retry may have passed its first lookup before admission committed.
        const duplicate = await stores.coordination.pool.query<TurnRow>(`SELECT * FROM ${TABLE} WHERE actor_id=$1 AND conversation_id=$2 AND request_key=$3`, [owner.actorId, conversationId, key]);
        if (duplicate.rows[0]) {
          if (duplicate.rows[0].input_digest !== digest) throw new ProductError('TURN_IDEMPOTENCY_CONFLICT', 409);
          return { turnId: duplicate.rows[0].turn_id, conversationId,
            status: viewTurn(duplicate.rows[0], await stores.turns.getTurn(duplicate.rows[0].turn_id)).status, completion: Promise.resolve() };
        }
        throw new ProductError('CONVERSATION_BUSY', 409);
      }
      lease = claimed.lease;
      await reconcileOwned(stores, lease, owner, conversationId);
      // A delayed duplicate can acquire the lease after the original request finished.
      // Recheck inside admission ownership before constructing or executing a model.
      const afterClaim = await stores.coordination.pool.query<TurnRow>(`SELECT * FROM ${TABLE} WHERE actor_id=$1 AND conversation_id=$2 AND request_key=$3`, [owner.actorId, conversationId, key]);
      if (afterClaim.rows[0]) {
        if (afterClaim.rows[0].input_digest !== digest) throw new ProductError('TURN_IDEMPOTENCY_CONFLICT', 409);
        return { turnId: afterClaim.rows[0].turn_id, conversationId,
          status: viewTurn(afterClaim.rows[0], await stores.turns.getTurn(afterClaim.rows[0].turn_id)).status, completion: Promise.resolve() };
      }
      const effective = await loadEffectiveMemorySettings(stores.coordination.pool, owner.actorId, conversation.roomId);
      const prepared = await openQuellightMemory({ stores, ownerActorId: owner.actorId, conversationId,
        effective, leaseMs: Math.min(remaining, HOST_LEASE_MS) });
      let authorityRevision: string;
      let profile: ReturnType<typeof conversationActivation>;
      try {
        await ensureNativeSources({ stores, lease, owner, conversation, memory: prepared });
        authorityRevision = (await prepared.service.authority(conversationId)).revision;
        profile = conversationActivation(effective.configuration.purpose, { effective,
          memory: { id: prepared.config.id, revision: prepared.service.configurationRevision },
          recall: { id: prepared.recallCapability.id, revision: prepared.recallCapability.revision } });
      } finally { await prepared.hosted.close(); }
      const fenced = stores.forLease(lease);
      const persisted = await fenced.governance.getAgentActivation(profile.activation.activationVersion);
      if (persisted && !profile.registry.restoreActivation(persisted).ok) throw new ProductError('AGENT_ACTIVATION_INVALID', 503);
      await fenced.governance.saveAgentActivation(profile.record);
      const turnId = `quellight:${randomUUID()}`;
      const admitted = await stores.coordination.withFence(lease, async (client) => {
        const locked = await client.query(`SELECT c.id FROM quellight_product_v1.conversations c
          JOIN quellight_product_v1.rooms r ON r.id=c.room_id AND r.actor_id=c.actor_id
          WHERE c.id=$1 AND c.actor_id=$2 AND c.archived_at IS NULL AND r.archived_at IS NULL FOR UPDATE OF c,r`, [conversationId, owner.actorId]);
        if (!locked.rows.length) throw new ProductError('ROOM_ARCHIVED', 409);
        const result = await client.query<TurnRow>(`INSERT INTO ${TABLE}(turn_id,actor_id,conversation_id,request_key,input_digest,input_text,activation_version,execution_state,memory_configuration,memory_authority_revision)
          VALUES($1,$2,$3,$4,$5,$6,$7,'queued',$8::jsonb,$9) RETURNING *`, [turnId, owner.actorId, conversationId, key, digest, input,
          profile.activation.activationVersion, JSON.stringify(effective), authorityRevision]);
        return result.rows[0];
      });
      let ready!: () => void;
      const admittedToVICT = new Promise<void>(resolve => { ready = resolve; });
      const completion = execute(stores, lease, actor, admitted, mastraThreadIdForConversation(conversationId), profile.activation, ready, deadline)
        .catch(() => { console.error('QUELLIGHT_TURN_CLEANUP_UNCONFIRMED'); });
      backgroundOwnsResources = true;
      // A returned turn is already durably cancellable through the public service.
      await admittedToVICT;
      return { turnId, conversationId, status: 'intent', completion };
    } finally {
      if (!backgroundOwnsResources) {
        try { if (lease) await stores.coordination.release(lease); }
        finally { await stores.close(); }
      }
    }
  }

  async function execute(stores: PostgresStoreSet, lease: HostedLease, actor: AuthenticatedActorContext,
    row: TurnRow, threadId: string, activation: ReturnType<typeof conversationActivation>['activation'], ready: () => void, deadline?: Date) {
    let memory: Awaited<ReturnType<typeof openQuellightMemory>>['hosted'] | undefined;
    let composition: ReturnType<typeof composeMastraTurnExecutor> | undefined;
    let stopPolling = false;
    let poll: Promise<void> | undefined;
    let wake: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fenced = stores.forLease(lease);
    try {
      const key = await options.readCredential();
      const remaining = deadline ? Math.floor(deadline.getTime() - Date.now()) : HOST_LEASE_MS;
      if (remaining < 100) throw new Error('HOST_REQUEST_ENDING');
      if (!row.memory_configuration) throw new Error('MEMORY_CONFIGURATION_MISSING');
      const modelFactory = options.modelFactory ?? (() => new ModelRouterLanguageModel({ id: MODEL, url: PROVIDER_URL, apiKey: key }));
      const native = await openQuellightMemory({ stores, ownerActorId: actor.actorId, conversationId: row.conversation_id,
        effective: row.memory_configuration, modelFactory, leaseMs: Math.min(remaining, HOST_LEASE_MS) });
      memory = native.hosted;
      const recall = native.recallCapability;
      const invokeRecall = gateCapabilityInvoke(recall, { grants: [QUELLIGHT_MEMORY_RECALL_PERMISSION] });
      const hub = new AgentStreamHub({ ledger: fenced.streamLedger });
      const tools = new AgentTurnService({ stores: fenced, ids: turnIds(row.turn_id) });
      composition = composeMastraTurnExecutor({ stores: fenced, activation, hub, ids: turnIds(row.turn_id),
        agentConfig: { store: memory.store, threadCoordinator: memory.coordinator, managedMemory: native.service, logger: new MastraSanitizedLogger(),
          tracing: { sampling: { type: 'never' } },
          modelFactory },
        capabilityBridge: {
          resolveCapability: (id, revision) => id === recall.id && revision === recall.revision ? recall : undefined,
          invoke: async (definition, input, context) => {
            if (definition !== recall) throw new Error('CAPABILITY_UNAVAILABLE');
            return invokeRecall(input, context as CapabilityContext);
          },
          recordInvocationIntent: input => tools.recordToolInvocationIntent(input),
          claimInvocationRun: input => fenced.invocations.claimInvocationRun(input),
          settleInvocationRun: input => fenced.invocations.settleInvocationRun(input),
          settleInvocationPending: input => fenced.invocations.settleInvocationPending(input),
          reconcileAbandonedRun: input => fenced.invocations.reconcileAbandonedRun(input),
          requestApproval: input => tools.requestApproval(input), consumeApproval: input => tools.consumeApproval(input),
          updateInvocationStatus: input => fenced.invocations.updateInvocationStatus(input),
        },
      });
      await hub.subscribe(`stream:${row.turn_id}`, { subscriberId: `projection:${row.turn_id}`, async deliver(event) {
        await stores.coordination.withFence(lease, async client => {
          const current = await client.query<{ published_sequence: string }>(`SELECT published_sequence FROM ${TABLE} WHERE turn_id=$1 AND actor_id=$2 FOR UPDATE`, [row.turn_id, actor.actorId]);
          const sequence = Number(current.rows[0]?.published_sequence);
          if (sequence >= event.seq) return;
          if (sequence + 1 !== event.seq) throw new Error('STREAM_PROJECTION_GAP');
          if (event.kind === 'text.delta') await client.query(`INSERT INTO ${FRAGMENTS}(turn_id,sequence,delta) VALUES($1,$2,$3)`, [row.turn_id, event.seq, event.delta]);
          await client.query(`UPDATE ${TABLE} SET published_sequence=$2,updated_at=now() WHERE turn_id=$1`, [row.turn_id, event.seq]);
        });
        return true;
      } });
      await stores.coordination.withFence(lease, client => client.query(`UPDATE ${TABLE} SET execution_state='running',updated_at=now() WHERE turn_id=$1`, [row.turn_id]));
      const started = await composition.turnService.startTurn(actor, { threadId, input: row.input_text });
      ready();
      const service = composition.turnService;
      poll = (async () => {
        while (!stopPolling) {
          if (await stores.turns.hasCancelIntent(row.turn_id)) {
            await service.cancelTurn(actor, { turnId: row.turn_id, reasonCode: 'USER_CANCELLED' });
            return;
          }
          await new Promise<void>(resolve => { wake = resolve; timer = setTimeout(resolve, 500); });
        }
      })();
      // A failed control observation cancels the active executor through its public service.
      void poll.catch(() => service.cancelTurn(actor, { turnId: row.turn_id, reasonCode: 'CONTROL_UNAVAILABLE' }).catch(() => undefined));
      const outcome = await started.outcomePromise;
      stopPolling = true;
      if (timer) clearTimeout(timer);
      wake?.();
      await poll;
      await settleProjection(stores, lease, row, outcome.errorCode);
    } catch {
      ready();
      try {
        const turn = await fenced.turns.getTurn(row.turn_id);
        if (turn && !TERMINAL.has(turn.status)) await fenced.turns.reconcileTurn({ turnId: row.turn_id, status: 'failed', reasonCode: 'VICT_TURN_INTERRUPTED', at: Date.now() });
        await settleProjection(stores, lease, row, turn?.errorCode ?? 'CONVERSATION_UNAVAILABLE');
      } catch { console.error('QUELLIGHT_TURN_SETTLEMENT_UNCONFIRMED'); }
    } finally {
      stopPolling = true;
      if (timer) clearTimeout(timer);
      wake?.();
      await poll?.catch(() => undefined);
      // The managed adapter settles completed chat persistence in its original
      // authority scope. A new cleanup scope must not reclassify a late reply after Forget.
      try { await memory?.close(); }
      finally {
        try { await stores.coordination.release(lease); }
        finally { await stores.close(); }
      }
    }
  }

  async function detail(owner: Owner, conversationId: string) {
    validateId(conversationId);
    const stores = await options.openDatabase();
    try {
      const conversation = await getConversation(stores, owner, conversationId);
      await currentActor(stores, owner, 'run.read');
      await reconcileIfReleased(stores, owner, conversationId);
      const rows = await stores.coordination.pool.query<TurnRow>(`SELECT * FROM ${TABLE} WHERE conversation_id=$1 AND actor_id=$2 ORDER BY created_at,turn_id`, [conversationId, owner.actorId]);
      const messages: Array<{ id: string; role: 'user' | 'assistant'; text: string; createdAt: string; status?: string }> = [];
      let activeTurn = null;
      let lastTurn = null;
      for (const row of rows.rows) {
        messages.push({ id: `${row.turn_id}:user`, role: 'user', text: row.input_text, createdAt: row.created_at.toISOString() });
        const turn = await stores.turns.getTurn(row.turn_id);
        lastTurn = viewTurn(row, turn);
        if (ACTIVE.includes(row.execution_state)) activeTurn = viewTurn(row, turn);
        else if (row.output_text) messages.push({ id: `${row.turn_id}:assistant`, role: 'assistant', text: row.output_text,
          createdAt: row.updated_at.toISOString(), status: viewTurn(row, turn).status });
      }
      return { conversation, messages, activeTurn, lastTurn };
    } finally { await stores.close(); }
  }

  async function events(owner: Owner, turnId: string, after: number) {
    if (!Number.isSafeInteger(after) || after < 0) throw new ProductError('CURSOR_INVALID');
    const stores = await options.openDatabase();
    try {
      await currentActor(stores, owner, 'run.read');
      let row = await getRow(stores, owner, turnId);
      await reconcileIfReleased(stores, owner, row.conversation_id);
      row = await getRow(stores, owner, turnId);
      const high = Number(row.published_sequence);
      const fragments = await stores.coordination.pool.query<{ sequence: string; delta: string }>(`SELECT sequence,delta FROM ${FRAGMENTS} WHERE turn_id=$1 AND sequence>$2 AND sequence<=$3 ORDER BY sequence`, [turnId, after, high]);
      const milestones = await stores.streamLedger.listEventsFrom(`stream:${turnId}`, after);
      const values: Array<{ sequence: number; kind: string; delta?: string }> = [
        ...fragments.rows.map(value => ({ sequence: Number(value.sequence), kind: 'text.delta', delta: value.delta })),
        ...milestones.filter(event => event.seq <= high).map(event => ({ sequence: event.seq, kind: event.kind })),
      ];
      values.sort((a, b) => a.sequence - b.sequence);
      return { events: values, nextCursor: Math.max(after, high), turn: viewTurn(row, await stores.turns.getTurn(turnId)) };
    } finally { await stores.close(); }
  }

  async function cancel(owner: Owner, turnId: string) {
    const stores = await options.openDatabase();
    let lease: HostedLease | undefined;
    try {
      const actor = await currentActor(stores, owner, 'run.read');
      const row = await getRow(stores, owner, turnId);
      const claim = await stores.coordination.acquire({ scopeId: `quellight:cancel:${turnId}`, actorId: owner.actorId,
        ownerId: randomUUID(), leaseMs: HOST_LEASE_MS });
      if (claim.status !== 'acquired') throw new ProductError('CANCEL_IN_PROGRESS', 409);
      lease = claim.lease;
      const fenced = stores.forLease(lease);
      const service = new AgentTurnService({ stores: fenced, ids: turnIds(turnId) });
      const turn = await fenced.turns.getTurn(turnId);
      if (!turn) throw new ProductError('TURN_STARTING', 409);
      await service.cancelTurn(actor, { turnId, reasonCode: 'USER_CANCELLED' });
      return { turnId, status: viewTurn(row, await stores.turns.getTurn(turnId)).status };
    } finally {
      try { if (lease) await stores.coordination.release(lease); }
      finally { await stores.close(); }
    }
  }

  async function exportText(owner: Owner, conversationId: string) {
    const view = await detail(owner, conversationId);
    const state = view.activeTurn ? '\n\nA reply was still in progress when this conversation was exported.'
      : view.lastTurn?.status === 'cancelled' ? '\n\nThe last reply was stopped.'
      : view.lastTurn && view.lastTurn.status !== 'completed' ? '\n\nThe last reply did not finish.' : '';
    return `# ${view.conversation.title}\n\n${view.messages.map(message => {
      const partial = message.role === 'assistant' && message.status !== 'completed' ? ' (partial reply)' : '';
      return `## ${message.role === 'user' ? 'You' : 'Quellight'}${partial}\n\n${message.text}`;
    }).join('\n\n')}${state}\n`;
  }
  return { start, detail, events, cancel, exportText };
}
