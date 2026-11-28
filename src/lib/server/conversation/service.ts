import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ModelRouterLanguageModel } from '@mastra/core/llm';
import { AgentTurnService } from '@victframework/control';
import {
  composeMastraTurnExecutor,
  MastraSanitizedLogger, mastraThreadIdForConversation, mastraResourceIdForActor, type MastraProductAgentConfig,
} from '@victframework/mastra';
import {
  AgentStreamHub, assertActorScope, authenticatedActorContext, gateCapabilityInvoke,
  type AuthenticatedActorContext, type AgentTurnRecord, type HostedLease,
} from '@victframework/runtime';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import type { CapabilityContext } from '@victframework/sdk';
import { getConversationAccess, ProductError, type Owner } from '../domain/queries.js';
import { conversationActivation, MODEL, PROVIDER_URL } from './activation.js';
import { renderConversationExport } from './export.js';
import { loadEffectiveMemorySettings, type EffectiveMemorySettings } from '../memory/settings.js';
import { enqueueMemoryJob, publicConversationSources } from '../memory/jobs.js';
import { openQuellightMemory, QUELLIGHT_MEMORY_RECALL_PERMISSION } from '../memory/native.js';
import { MEMORY_WORK_LEASE_MS, requestMemoryYield } from '../memory/foreground.js';
import { ensureNativeSources } from '../memory/import.js';
import { bindDeskMemoryContext } from '../desk-memory-context.js';
import { createDeskCapabilities } from '../desk/capabilities.js';
import { prepareDeskContext, saveDeskContext, type DeskContextSelection } from '../desk/context.js';
import { guardDeskModel } from '../desk-model-guard.js';
import { enqueueMethodOccurrence } from '../desk/method-jobs.js';
import { readRoomGuidance } from '../room-learning/store.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE = ['queued', 'running'];
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'blocked']);
// This matches the selected Vercel Hobby platform maximum, rather than a generation budget.
const HOST_LEASE_MS = 300_000;
const TABLE = 'quellight_product_v1.conversation_turns';
const FRAGMENTS = 'quellight_product_v1.turn_fragments';
const PAGE_TURNS = 16;
const STREAM_BATCH = 48;
const RECOVERY_CHECK_MS = 2000;
const STOP_CHECK_MS = 250;
const RELEASE_GRACE_MS = 750;
const ADMISSION_CHECK_MS = 60;

interface TurnRow {
  turn_id: string; actor_id: string; conversation_id: string; request_key: string;
  input_digest: string; input_text: string; activation_version: string;
  execution_state: string; output_text: string | null; error_code: string | null;
  published_sequence: string | number; created_at: Date; updated_at: Date;
  memory_configuration?: EffectiveMemorySettings | null;
  memory_authority_revision?: string | null;
  desk_binding?: { roomId: string; authorityRevision: string; sourceMessageIds: string[] } | null;
}
type TranscriptRow = Pick<TurnRow, 'turn_id' | 'request_key' | 'created_at' | 'updated_at' | 'input_text' |
  'output_text' | 'error_code' | 'execution_state'>;
type StreamRow = Pick<TurnRow, 'turn_id' | 'conversation_id' | 'execution_state' | 'published_sequence' |
  'error_code' | 'output_text' | 'updated_at'>;
type StreamEventView = { sequence: number; kind: string; delta?: string };
type TurnView = ReturnType<typeof viewTurn>;
type NativeMemory = Awaited<ReturnType<typeof openQuellightMemory>>;
type DeskCapabilities = ReturnType<typeof createDeskCapabilities>;
interface StreamAccess { owner: Owner; sessionId: string; expiresAt: number }
interface ObservationView {
  events: StreamEventView[];
  nextCursor: number;
  turn: TurnView;
  assistantMessage?: ReturnType<typeof assistantMessage>;
  nextActiveTurn?: TurnView;
  nextUserMessage?: ReturnType<typeof userMessage>;
}
export interface ConversationServiceOptions {
  openDatabase(): Promise<PostgresStoreSet>;
  readCredential(): Promise<string>;
  modelFactory?: MastraProductAgentConfig['modelFactory'];
  roomGuidance?: boolean;
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
function viewTurn(row: Pick<TurnRow, 'turn_id' | 'execution_state' | 'error_code'>, turn?: AgentTurnRecord) {
  return { id: row.turn_id, status: turn?.status ?? (row.execution_state === 'interrupted' ? 'failed' : 'intent'),
    streamId: `stream:${row.turn_id}`, errorCode: turn?.errorCode ?? row.error_code ?? undefined,
    // The VICT terminal gate may finish before the public transcript snapshot.
    // Observers keep their streamed text until this independently truthful gate closes.
    projectionSettled: !ACTIVE.includes(row.execution_state) };
}

function userMessage(row: TranscriptRow) {
  return { id: `${row.turn_id}:user`, role: 'user' as const, text: row.input_text,
    createdAt: row.created_at.toISOString(), requestKey: row.request_key };
}
function assistantMessage(row: Pick<TurnRow, 'turn_id' | 'output_text' | 'updated_at'>, status?: string) {
  return row.output_text ? { id: `${row.turn_id}:assistant`, role: 'assistant' as const,
    text: row.output_text, createdAt: row.updated_at.toISOString(), ...(status && { status }) } : null;
}
function accepted(row: TurnRow, turn: AgentTurnRecord | undefined) {
  return { turnId: row.turn_id, conversationId: row.conversation_id,
    status: viewTurn(row, turn).status, userMessage: userMessage(row), completion: Promise.resolve() };
}
function transcriptAnchor(cursor: string) {
  if (!/^[A-Za-z0-9_-]{1,192}$/.test(cursor)) throw new ProductError('CURSOR_INVALID');
  const anchor = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!anchor || anchor.includes('\0') || Buffer.from(anchor).toString('base64url') !== cursor) throw new ProductError('CURSOR_INVALID');
  return anchor;
}
function checkStreamCursor(after: number) {
  if (!Number.isSafeInteger(after) || after < 0) throw new ProductError('CURSOR_INVALID');
}
function nextSequence(after: number, published: string | number) {
  const high = Number(published);
  if (after > high) throw new ProductError('CURSOR_INVALID');
  return Math.min(high, after + STREAM_BATCH);
}

export function createConversationService(options: ConversationServiceOptions) {
  async function getRow(stores: PostgresStoreSet, owner: Pick<Owner, 'actorId'>, turnId: string) {
    const rows = await stores.coordination.pool.query<TurnRow>(`SELECT * FROM ${TABLE} WHERE turn_id=$1 AND actor_id=$2`, [turnId, owner.actorId]);
    if (!rows.rows[0]) throw new ProductError('TURN_NOT_FOUND', 404);
    return rows.rows[0];
  }
  async function settleProjection(stores: PostgresStoreSet, lease: HostedLease, row: TurnRow,
    settled: AgentTurnRecord | undefined, errorCode?: string, inspectCreates = true) {
    const creates = inspectCreates && !errorCode && settled?.status === 'completed' && row.desk_binding
      ? (await stores.invocations.listInvocationsForTurn(row.turn_id))
        .filter(invocation => invocation.status === 'completed' && invocation.capabilityId === 'quellight.desk.create')
        .map(invocation => invocation.invocationId) : [];
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
      if (row.desk_binding && creates.length) await enqueueMethodOccurrence(client, {
        actorId: row.actor_id, roomId: row.desk_binding.roomId, conversationId: row.conversation_id,
        turnId: row.turn_id, completedCreateInvocationIds: creates,
      });
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
      await settleProjection(stores, lease, row, turn, turn?.errorCode ?? (turn ? undefined : 'TURN_START_INTERRUPTED'));
    }
  }
  async function reconcileIfReleased(stores: PostgresStoreSet, owner: Owner, conversationId: string) {
    const claim = await stores.coordination.acquire({ scopeId: scopeFor(conversationId), actorId: owner.actorId,
      ownerId: randomUUID(), leaseMs: HOST_LEASE_MS });
    if (claim.status !== 'acquired') return;
    try { await reconcileOwned(stores, claim.lease, owner, conversationId); }
    finally { await stores.coordination.release(claim.lease); }
  }

  async function acceptReplay(stores: PostgresStoreSet, owner: Owner, row: TurnRow, deadline?: Date) {
    // The product row can commit a little before VICT admits the turn. A retry
    // must provide the same cancellation guarantee as the original HTTP 202.
    const until = Math.min(Date.now() + 2000, (deadline?.getTime() ?? Infinity) - 100);
    for (;;) {
      const turn = await stores.turns.getTurn(row.turn_id);
      if (turn || !ACTIVE.includes(row.execution_state)) return accepted(row, turn);
      if (Date.now() >= until) throw new ProductError('TURN_ADMISSION_UNCONFIRMED', 503);
      await delay(50);
      row = await getRow(stores, owner, row.turn_id);
    }
  }

  async function start(owner: Owner, conversationId: string, request: unknown, deadline?: Date, suppliedStores?: PostgresStoreSet) {
    let stores = suppliedStores;
    let prepared: NativeMemory | undefined;
    let lease: HostedLease | undefined;
    let backgroundOwnsResources = false;
    try {
      validateId(conversationId);
      if (!request || typeof request !== 'object' || !('input' in request) || typeof request.input !== 'string' ||
          !request.input.trim() || !('idempotencyKey' in request) || typeof request.idempotencyKey !== 'string' ||
          !UUID.test(request.idempotencyKey) || Object.keys(request).some(key => !['input', 'idempotencyKey'].includes(key))) {
        throw new ProductError('TURN_INPUT_INVALID');
      }
      const input = request.input;
      const key = request.idempotencyKey;
      const digest = createHash('sha256').update(input).digest('hex');
      stores ??= await options.openDatabase();
      const { conversation, actor } = await getConversationAccess(stores, owner, conversationId, 'agent.turn.start');
      const prior = await stores.coordination.pool.query<TurnRow>(`SELECT * FROM ${TABLE} WHERE actor_id=$1 AND conversation_id=$2 AND request_key=$3`, [owner.actorId, conversationId, key]);
      if (prior.rows[0]) {
        if (prior.rows[0].input_digest !== digest) throw new ProductError('TURN_IDEMPOTENCY_CONFLICT', 409);
        await reconcileIfReleased(stores, owner, conversationId);
        const row = await getRow(stores, owner, prior.rows[0].turn_id);
        return await acceptReplay(stores, owner, row, deadline);
      }
      if (conversation.archivedAt || conversation.roomArchivedAt) throw new ProductError('ROOM_ARCHIVED', 409);
      const remaining = deadline ? Math.floor(deadline.getTime() - Date.now()) : HOST_LEASE_MS;
      if (remaining < 100) throw new ProductError('HOST_REQUEST_ENDING', 503);
      const ownerId = randomUUID();
      const coordination = stores.coordination;
      const acquire = () => coordination.acquire({ scopeId: scopeFor(conversationId), actorId: owner.actorId,
        ownerId, leaseMs: Math.max(100, Math.min(remaining, (deadline?.getTime() ?? Infinity) - Date.now())) });
      let claimed = await acquire();
      let memoryYieldRequested = false;
      const busySince = Date.now();
      const hostLimit = (deadline?.getTime() ?? Infinity) - 100;
      const cleanupUntil = Math.min(busySince + RELEASE_GRACE_MS, hostLimit);
      const yieldUntil = Math.min(busySince + MEMORY_WORK_LEASE_MS + 1000, hostLimit);
      while (claimed.status === 'busy') {
        // A concurrent retry may have passed its first lookup before admission committed.
        const competing = await stores.coordination.pool.query<TurnRow>(`SELECT * FROM ${TABLE}
          WHERE actor_id=$1 AND conversation_id=$2 AND (request_key=$3 OR execution_state IN ('queued','running'))`,
        [owner.actorId, conversationId, key]);
        const duplicate = competing.rows.find(row => row.request_key === key);
        if (duplicate) {
          if (duplicate.input_digest !== digest) throw new ProductError('TURN_IDEMPOTENCY_CONFLICT', 409);
          return await acceptReplay(stores, owner, duplicate, deadline);
        }
        if (competing.rows.length) throw new ProductError('CONVERSATION_BUSY', 409);
        if (!memoryYieldRequested)
          memoryYieldRequested = await requestMemoryYield(stores.coordination.pool, owner.actorId, conversationId);
        // Projection can be committed before its worker releases the lease.
        // Recheck for a new real turn throughout the brief cleanup window.
        const waitMs = Math.min(ADMISSION_CHECK_MS, (memoryYieldRequested ? yieldUntil : cleanupUntil) - Date.now());
        if (waitMs <= 0) throw new ProductError('TURN_ADMISSION_UNCONFIRMED', 503);
        await delay(waitMs);
        claimed = await acquire();
      }
      if (claimed.status !== 'acquired') throw new ProductError('CONVERSATION_BUSY', 409);
      lease = claimed.lease;
      await reconcileOwned(stores, lease, owner, conversationId);
      // A delayed duplicate can acquire the lease after the original request finished.
      // Recheck inside admission ownership before constructing or executing a model.
      const afterClaim = await stores.coordination.pool.query<TurnRow>(`SELECT * FROM ${TABLE} WHERE actor_id=$1 AND conversation_id=$2 AND request_key=$3`, [owner.actorId, conversationId, key]);
      if (afterClaim.rows[0]) {
        if (afterClaim.rows[0].input_digest !== digest) throw new ProductError('TURN_IDEMPOTENCY_CONFLICT', 409);
        return await acceptReplay(stores, owner, afterClaim.rows[0], deadline);
      }
      const effective = await loadEffectiveMemorySettings(stores.coordination.pool, owner.actorId, conversation.roomId);
      const turnId = `quellight:${randomUUID()}`;
      const credential = await options.readCredential();
      const modelFactory = options.modelFactory ?? (() => new ModelRouterLanguageModel({ id: MODEL, url: PROVIDER_URL, apiKey: credential }));
      prepared = await openQuellightMemory({ stores, ownerActorId: owner.actorId, conversationId,
        effective, modelFactory, leaseMs: Math.min(remaining, HOST_LEASE_MS) });
      let authorityRevision: string;
      let roomGuidance: Awaited<ReturnType<typeof readRoomGuidance>> = null;
      let profile: ReturnType<typeof conversationActivation>;
      let deskSelection: DeskContextSelection;
      let deskBinding: NonNullable<TurnRow['desk_binding']>;
      let desk: DeskCapabilities;
      try {
        await ensureNativeSources({ stores, lease, owner, conversation, memory: prepared });
        // A vanished worker's native lease may still be expiring. Probe the public
        // coordinator before admitting a durable turn. The product conversation
        // lease prevents a live maintainer from starting between this and execution.
        for (;;) {
          try {
            const available = await prepared.hosted.coordinator.beginTurn(mastraThreadIdForConversation(conversationId), mastraResourceIdForActor(owner.actorId));
            await available.release();
            break;
          } catch (error) {
            if (!memoryYieldRequested || !error || typeof error !== 'object' || !('code' in error) || error.code !== 'VICT_AGENT_THREAD_BUSY') throw error;
            // The shared product and native leases renew independently. On
            // host loss, the foreground lease may be available a little first.
            if (Date.now() >= yieldUntil) throw new ProductError('TURN_ADMISSION_UNCONFIRMED', 503);
            await delay(ADMISSION_CHECK_MS);
          }
        }
        const deskMemory = bindDeskMemoryContext(stores, owner, conversation, prepared);
        const sources = await deskMemory.sourceSnapshot();
        authorityRevision = sources.authorityRevision;
        deskSelection = await prepareDeskContext(stores, owner, conversation.roomId, deskMemory.authority);
        if (deskSelection.authorityRevision !== authorityRevision) throw new ProductError('DESK_SOURCE_CHANGED', 409);
        deskBinding = { roomId: conversation.roomId, authorityRevision, sourceMessageIds: sources.messages.map(message => message.id) };
        desk = createDeskCapabilities(stores, owner, conversation.roomId, turnId,
          { ...deskBinding, conversationId, authority: deskMemory.authority, withAuthorityFence: deskMemory.withAuthorityFence });
        if (options.roomGuidance !== false) {
          roomGuidance = await readRoomGuidance(stores.coordination.pool, owner.actorId, conversationId, authorityRevision);
        }
        profile = conversationActivation(effective.configuration.purpose, { effective, roomGuidance,
          memory: { id: prepared.config.id, revision: prepared.service.configurationRevision },
          recall: { id: prepared.recallCapability.id, revision: prepared.recallCapability.revision },
          desk: { selection: deskSelection, capabilities: desk.identities } });
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'VICT_AGENT_THREAD_BUSY') throw new ProductError('CONVERSATION_BUSY', 409);
        throw error;
      }
      const fenced = stores.forLease(lease);
      const persisted = await fenced.governance.getAgentActivation(profile.activation.activationVersion);
      if (persisted && !profile.registry.restoreActivation(persisted).ok) throw new ProductError('AGENT_ACTIVATION_INVALID', 503);
      await fenced.governance.saveAgentActivation(profile.record);
      const admission = await stores.coordination.withFence(lease, async (client) => {
        const locked = await client.query<{ id: string; room_guidance_revision: number | null }>(`SELECT c.id,
          CASE WHEN r.room_guidance_available AND r.room_guidance_authority=$3 THEN r.room_guidance_revision END AS room_guidance_revision
          FROM quellight_product_v1.conversations c
          JOIN quellight_product_v1.rooms r ON r.id=c.room_id AND r.actor_id=c.actor_id
          WHERE c.id=$1 AND c.actor_id=$2 AND c.archived_at IS NULL AND r.archived_at IS NULL FOR UPDATE OF c,r`, [conversationId, owner.actorId, authorityRevision]);
        if (!locked.rows.length) return { reason: 'ROOM_ARCHIVED' as const };
        if (options.roomGuidance !== false && locked.rows[0].room_guidance_revision !== (roomGuidance?.revision ?? null)) {
          return { reason: 'ROOM_GUIDANCE_CHANGED' as const };
        }
        const result = await client.query<TurnRow>(`INSERT INTO ${TABLE}(turn_id,actor_id,conversation_id,request_key,input_digest,input_text,activation_version,execution_state,memory_configuration,memory_authority_revision,desk_binding,room_guidance_revision)
          VALUES($1,$2,$3,$4,$5,$6,$7,'queued',$8::jsonb,$9,$10::jsonb,$11) RETURNING *`, [turnId, owner.actorId, conversationId, key, digest, input,
          profile.activation.activationVersion, JSON.stringify(effective), authorityRevision, JSON.stringify(deskBinding), roomGuidance?.revision ?? null]);
        await saveDeskContext(client, owner.actorId, turnId, deskSelection);
        return { row: result.rows[0] };
      });
      if (admission.reason) throw new ProductError(admission.reason, 409);
      const admitted = admission.row;
      let ready!: (result: ReturnType<typeof accepted> | undefined) => void;
      const admittedToVICT = new Promise<ReturnType<typeof accepted> | undefined>(resolve => { ready = resolve; });
      // Composition uses the same validated native-memory handle and Desk
      // binding prepared for this activation. Their live authority readers
      // still enforce the persisted revision at each invocation.
      const completion = execute(stores, lease, actor, admitted, mastraThreadIdForConversation(conversationId),
        profile.activation, prepared, modelFactory, desk, ready, deadline)
        .catch(() => { console.error('QUELLIGHT_TURN_CLEANUP_UNCONFIRMED'); });
      backgroundOwnsResources = true;
      // A returned turn is already durably cancellable through the public service.
      const reply = await admittedToVICT;
      if (!reply) throw new ProductError('TURN_ADMISSION_UNCONFIRMED', 503);
      return { ...reply, completion };
    } finally {
      if (!backgroundOwnsResources) {
        try {
          try { await prepared?.hosted.close(); }
          finally { if (lease) await stores?.coordination.release(lease); }
        } finally { await stores?.close(); }
      }
    }
  }

  async function execute(stores: PostgresStoreSet, lease: HostedLease, actor: AuthenticatedActorContext,
    row: TurnRow, threadId: string, activation: ReturnType<typeof conversationActivation>['activation'],
    native: NativeMemory, modelFactory: MastraProductAgentConfig['modelFactory'], desk: DeskCapabilities,
    ready: (result: ReturnType<typeof accepted> | undefined) => void, deadline?: Date) {
    const memory = native.hosted;
    let stopPolling = false;
    let poll: Promise<void> | undefined;
    let wake: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fenced = stores.forLease(lease);
    try {
      if (deadline && deadline.getTime() - Date.now() < 100) throw new Error('HOST_REQUEST_ENDING');
      const recall = native.recallCapability;
      const deskBinding = row.desk_binding;
      if (!deskBinding) throw new ProductError('DESK_BINDING_MISSING', 503);
      let mayHaveCreatedDeskItem = false;
      const capabilities = [recall, ...desk.capabilities];
      const grants = [QUELLIGHT_MEMORY_RECALL_PERMISSION, ...desk.permissions];
      const invokers = new Map(capabilities.map(capability => [capability, gateCapabilityInvoke(capability, { grants })]));
      const hub = new AgentStreamHub({ ledger: fenced.streamLedger });
      const tools = new AgentTurnService({ stores: fenced, ids: turnIds(row.turn_id) });
      const composition = composeMastraTurnExecutor({ stores: fenced, activation, hub, ids: turnIds(row.turn_id),
        agentConfig: { store: memory.store, threadCoordinator: memory.coordinator, managedMemory: native.service, logger: new MastraSanitizedLogger(),
          tracing: { sampling: { type: 'never' } },
          modelFactory: profile => guardDeskModel(modelFactory(profile), native.service, {
            conversationId: row.conversation_id, turnId: row.turn_id, authorityRevision: deskBinding.authorityRevision,
          }) },
        capabilityBridge: {
          quietWriteApprovals: desk.quietWriteApprovals,
          resolveCapability: (id, revision) => capabilities.find(capability => capability.id === id && capability.revision === revision),
          invoke: async (definition, input, context) => {
            const invoke = invokers.get(definition);
            if (!invoke) throw new Error('CAPABILITY_UNAVAILABLE');
            if (definition.id === 'quellight.desk.create') mayHaveCreatedDeskItem = true;
            return invoke(input, context as CapabilityContext);
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
          const { rows: [published] } = await client.query<{ sequence: string }>(`WITH advanced AS (
            UPDATE ${TABLE} SET published_sequence=$3,updated_at=now()
              WHERE turn_id=$1 AND actor_id=$2 AND published_sequence=$3::bigint-1
              RETURNING turn_id,published_sequence
          ), fragment AS (
            INSERT INTO ${FRAGMENTS}(turn_id,sequence,delta)
              SELECT turn_id,published_sequence,$4::text FROM advanced WHERE $4::text IS NOT NULL
          )
          SELECT COALESCE((SELECT published_sequence FROM advanced),
            (SELECT published_sequence FROM ${TABLE} WHERE turn_id=$1 AND actor_id=$2)) AS sequence`,
          [row.turn_id, actor.actorId, event.seq, event.kind === 'text.delta' ? event.delta : null]);
          if (!(Number(published?.sequence) >= event.seq)) throw new Error('STREAM_PROJECTION_GAP');
        });
        return true;
      } });
      await stores.coordination.withFence(lease, client => client.query(`UPDATE ${TABLE} SET execution_state='running',updated_at=now() WHERE turn_id=$1`, [row.turn_id]));
      const started = await composition.turnService.startTurn(actor, { threadId, input: row.input_text });
      ready(accepted(row, started.turn));
      const service = composition.turnService;
      poll = (async () => {
        while (!stopPolling) {
          if (await stores.turns.hasCancelIntent(row.turn_id)) {
            await service.cancelTurn(actor, { turnId: row.turn_id, reasonCode: 'USER_CANCELLED' });
            return;
          }
          await new Promise<void>(resolve => { wake = resolve; timer = setTimeout(resolve, STOP_CHECK_MS); });
        }
      })();
      // A failed control observation cancels the active executor through its public service.
      void poll.catch(() => service.cancelTurn(actor, { turnId: row.turn_id, reasonCode: 'CONTROL_UNAVAILABLE' }).catch(() => undefined));
      const outcome = await started.outcomePromise;
      stopPolling = true;
      if (timer) clearTimeout(timer);
      wake?.();
      await poll;
      await settleProjection(stores, lease, row, outcome, outcome.errorCode, mayHaveCreatedDeskItem);
    } catch {
      try {
        let turn = await fenced.turns.getTurn(row.turn_id);
        if (turn && !TERMINAL.has(turn.status)) turn = await fenced.turns.reconcileTurn({ turnId: row.turn_id,
          status: 'failed', reasonCode: 'VICT_TURN_INTERRUPTED', at: Date.now() });
        const errorCode = turn?.status === 'completed' ? undefined : turn?.errorCode ?? 'CONVERSATION_UNAVAILABLE';
        await settleProjection(stores, lease, row, turn, errorCode);
        ready(accepted(await getRow(stores, { actorId: row.actor_id }, row.turn_id), turn));
      } catch {
        ready(undefined);
        console.error('QUELLIGHT_TURN_SETTLEMENT_UNCONFIRMED');
      }
    } finally {
      stopPolling = true;
      if (timer) clearTimeout(timer);
      wake?.();
      await poll?.catch(() => undefined);
      // The managed adapter settles completed chat persistence in its original
      // authority scope. A new cleanup scope must not reclassify a late reply after Forget.
      try { await memory.close(); }
      finally {
        try { await stores.coordination.release(lease); }
        finally { await stores.close(); }
      }
    }
  }

  async function detail(owner: Owner, conversationId: string, before?: string, suppliedStores?: PostgresStoreSet) {
    validateId(conversationId);
    const anchor = before === undefined ? undefined : transcriptAnchor(before);
    const stores = suppliedStores ?? await options.openDatabase();
    try {
      const { conversation } = await getConversationAccess(stores, owner, conversationId, 'run.read');
      const readPage = () => {
        const columns = 'turn_id, request_key, created_at, updated_at, input_text, output_text, error_code, execution_state';
        const owned = 'actor_id=$1 AND conversation_id=$2';
        const boundary = `(created_at, turn_id) < (SELECT created_at, turn_id FROM ${TABLE}
          WHERE ${owned} AND turn_id=$4)`;
        const page = `SELECT ${columns}, false AS active_row FROM ${TABLE}
          WHERE ${owned} ${anchor ? `AND ${boundary}` : ''}
          ORDER BY created_at DESC,turn_id DESC LIMIT $3`;
        const recent = `(${page}) UNION ALL (SELECT ${columns}, true AS active_row FROM ${TABLE}
          WHERE ${owned} AND execution_state IN ('queued','running'))
          ORDER BY active_row, created_at DESC,turn_id DESC`;
        return stores.coordination.pool.query<TranscriptRow & { active_row: boolean }>(anchor ? page : recent,
          anchor ? [owner.actorId, conversationId, PAGE_TURNS + 1, anchor] : [owner.actorId, conversationId, PAGE_TURNS + 1]);
      };
      let result = (await readPage()).rows;
      if (result.some(row => row.active_row)) {
        // Only unsettled conversations need the recovery lease. Settled history
        // reads require no coordination writes or historical VICT turn lookups.
        await reconcileIfReleased(stores, owner, conversationId);
        result = (await readPage()).rows;
      }
      const rows = result.filter(row => !row.active_row);
      const latest = anchor ? undefined : rows[0];
      const lastTurn = latest ? viewTurn(latest, await stores.turns.getTurn(latest.turn_id)) : null;
      const active = result.find(row => row.active_row);
      const activeTurn = active ? active.turn_id === latest?.turn_id
        ? lastTurn : viewTurn(active, await stores.turns.getTurn(active.turn_id)) : null;
      const page = rows.slice(0, PAGE_TURNS);
      const activeUserMessage = active && !page.some(row => row.turn_id === active.turn_id) ? userMessage(active) : null;
      const olderCursor = rows.length > PAGE_TURNS ? Buffer.from(page.at(-1)!.turn_id).toString('base64url') : null;
      const messages: Array<ReturnType<typeof userMessage> | NonNullable<ReturnType<typeof assistantMessage>>> = [];
      for (const row of page.reverse()) {
        messages.push(userMessage(row));
        if (ACTIVE.includes(row.execution_state)) continue;
        const response = assistantMessage(row, row.turn_id === latest?.turn_id ? lastTurn?.status : undefined);
        if (response) messages.push(response);
      }
      return { conversation, messages, activeTurn, lastTurn, olderCursor, ...(activeUserMessage && { activeUserMessage }) };
    } finally { if (!suppliedStores) await stores.close(); }
  }

  async function completeObservation(stores: PostgresStoreSet, owner: Owner, row: StreamRow, cursor: number,
    events: StreamEventView[], turn: TurnView, sessionId?: string): Promise<ObservationView> {
    if (ACTIVE.includes(row.execution_state) || cursor < Number(row.published_sequence)) {
      return { events, nextCursor: cursor, turn: { ...turn, projectionSettled: false } };
    }
    const result: ObservationView = { events, nextCursor: cursor, turn, assistantMessage: assistantMessage(row, turn.status) };
    // A separate device may have started a new reply between the old turn's
    // settlement and this read. Transfer to the current owner-scoped turn.
    const { rows: [next] } = await stores.coordination.pool.query<TranscriptRow>(`SELECT
      turn_id, request_key, created_at, updated_at, input_text, error_code, execution_state
      FROM ${TABLE} WHERE actor_id=$1 AND conversation_id=$2 AND execution_state IN ('queued','running') AND turn_id<>$3
      AND ($4::uuid IS NULL OR quellight_product_v1.owner_session_active($1::uuid,$4::uuid))`,
    [owner.actorId, row.conversation_id, row.turn_id, sessionId ?? null]);
    if (next) {
      result.nextActiveTurn = viewTurn(next, await stores.turns.getTurn(next.turn_id));
      result.nextUserMessage = userMessage(next);
    }
    return result;
  }

  async function events(owner: Owner, turnId: string, after: number, suppliedStores?: PostgresStoreSet) {
    checkStreamCursor(after);
    const stores = suppliedStores ?? await options.openDatabase();
    try {
      await currentActor(stores, owner, 'run.read');
      let row = await getRow(stores, owner, turnId);
      if (ACTIVE.includes(row.execution_state)) {
        await reconcileIfReleased(stores, owner, row.conversation_id);
        row = await getRow(stores, owner, turnId);
      }
      const cursor = nextSequence(after, row.published_sequence);
      const values: StreamEventView[] = [];
      if (cursor > after) {
        const fragments = await stores.coordination.pool.query<{ sequence: string; delta: string }>(`SELECT sequence,delta FROM ${FRAGMENTS}
          WHERE turn_id=$1 AND sequence>$2 AND sequence<=$3 ORDER BY sequence`, [turnId, after, cursor]);
        const milestones = await stores.streamLedger.listEventsFrom(`stream:${turnId}`, after, STREAM_BATCH);
        values.push(...fragments.rows.map(value => ({ sequence: Number(value.sequence), kind: 'text.delta', delta: value.delta })),
          ...milestones.filter(event => event.seq <= cursor).map(event => ({ sequence: event.seq, kind: event.kind })));
        values.sort((a, b) => a.sequence - b.sequence);
      }
      return await completeObservation(stores, owner, row, cursor, values, viewTurn(row, await stores.turns.getTurn(turnId)));
    } finally { if (!suppliedStores) await stores.close(); }
  }

  async function attachObservation(access: StreamAccess, stores: PostgresStoreSet, turnId: string, after: number) {
    checkStreamCursor(after);
    const { owner, sessionId, expiresAt } = access;
    await currentActor(stores, owner, 'run.read');
    const attached = await getRow(stores, owner, turnId);
    nextSequence(after, attached.published_sequence);
    let nextActorCheck = Date.now() + RECOVERY_CHECK_MS;
    let nextRecoveryCheck = nextActorCheck;
    let checkedState: string | undefined;
    let checkedTurn: TurnView | undefined;
    async function read(cursor: number): Promise<ObservationView> {
      if (!(expiresAt > Date.now())) throw new ProductError('STREAM_SESSION_REVOKED', 401);
      // Verify revocation in the same database statement and snapshot that
      // reads the product high watermark and fragments. No listener, open
      // transaction or session-Pooler-specific feature is required.
      const { rows: [snapshot] } = await stores.coordination.pool.query<StreamRow & {
        authorized: boolean; deltas: { sequence: number; delta: string }[];
      }>(`WITH session AS MATERIALIZED (
        SELECT quellight_product_v1.owner_session_active($2::uuid,$3::uuid) AS authorized
      ), turn AS MATERIALIZED (
        SELECT t.turn_id, t.conversation_id, t.execution_state, t.published_sequence, t.error_code,
          CASE WHEN t.execution_state NOT IN ('queued','running') AND t.published_sequence<=$4::bigint+$5::bigint
            THEN t.output_text END AS output_text, t.updated_at
        FROM ${TABLE} t JOIN session s ON s.authorized
        WHERE t.turn_id=$1 AND t.actor_id=$2
      )
      SELECT session.authorized, turn.*,
        COALESCE((SELECT json_agg(json_build_object('sequence',f.sequence,'delta',f.delta) ORDER BY f.sequence)
          FROM ${FRAGMENTS} f WHERE f.turn_id=turn.turn_id AND f.sequence>$4
            AND f.sequence<=LEAST(turn.published_sequence,$4::bigint+$5::bigint)), '[]'::json) AS deltas
      FROM session LEFT JOIN turn ON true`, [turnId, owner.actorId, sessionId, cursor, STREAM_BATCH]);
      if (!snapshot?.authorized || expiresAt <= Date.now()) throw new ProductError('STREAM_SESSION_REVOKED', 401);
      if (!snapshot.turn_id) throw new ProductError('TURN_NOT_FOUND', 404);
      const now = Date.now();
      if (now >= nextActorCheck) {
        await currentActor(stores, owner, 'run.read');
        nextActorCheck = now + RECOVERY_CHECK_MS;
      }
      const nextCursor = nextSequence(cursor, snapshot.published_sequence);
      // A stream making durable progress does not need a recovery write probe.
      if (nextCursor > cursor) nextRecoveryCheck = now + RECOVERY_CHECK_MS;
      else if (ACTIVE.includes(snapshot.execution_state) && now >= nextRecoveryCheck) {
        await reconcileIfReleased(stores, owner, attached.conversation_id);
        nextRecoveryCheck = now + RECOVERY_CHECK_MS;
      }
      if (!checkedTurn || checkedState !== snapshot.execution_state) {
        checkedState = snapshot.execution_state;
        checkedTurn = viewTurn(snapshot, await stores.turns.getTurn(turnId));
      }
      const events = snapshot.deltas.map(({ sequence, delta }) => ({ sequence, delta, kind: 'text.delta' }));
      const result = await completeObservation(stores, owner, snapshot, nextCursor, events, checkedTurn, sessionId);
      if (expiresAt <= Date.now()) throw new ProductError('STREAM_SESSION_REVOKED', 401);
      return result;
    }
    return { read };
  }

  async function cancel(owner: Owner, turnId: string, suppliedStores?: PostgresStoreSet) {
    const stores = suppliedStores ?? await options.openDatabase();
    let lease: HostedLease | undefined;
    try {
      const actor = await currentActor(stores, owner, 'run.read');
      await getRow(stores, owner, turnId);
      const claim = await stores.coordination.acquire({ scopeId: `quellight:cancel:${turnId}`, actorId: owner.actorId,
        ownerId: randomUUID(), leaseMs: HOST_LEASE_MS });
      if (claim.status !== 'acquired') throw new ProductError('CANCEL_IN_PROGRESS', 409);
      lease = claim.lease;
      const fenced = stores.forLease(lease);
      const service = new AgentTurnService({ stores: fenced, ids: turnIds(turnId) });
      const turn = await fenced.turns.getTurn(turnId);
      if (!turn) throw new ProductError('TURN_STARTING', 409);
      if (TERMINAL.has(turn.status)) return { turnId, status: turn.status };
      try {
        const result = await service.cancelTurn(actor, { turnId, reasonCode: 'USER_CANCELLED' });
        if (!result.turn) throw new ProductError('TURN_STOP_UNCONFIRMED', 503);
        return { turnId, status: result.turn.status };
      } catch (error) {
        const raced = await stores.turns.getTurn(turnId);
        if (raced && TERMINAL.has(raced.status)) return { turnId, status: raced.status };
        throw error;
      }
    } finally {
      try { if (lease) await stores.coordination.release(lease); }
      finally { if (!suppliedStores) await stores.close(); }
    }
  }

  async function reconcilePending(stores: PostgresStoreSet, deadline: Date, actorId: string) {
    const owner = { actorId, id: actorId, email: '' };
    await currentActor(stores, owner, 'run.read');
    const { rows } = await stores.coordination.pool.query<{ conversation_id: string }>(`SELECT conversation_id
      FROM quellight_product_v1.recoverable_conversation_turns WHERE actor_id=$1
      ORDER BY updated_at,conversation_id LIMIT 16`, [owner.actorId]);
    for (const row of rows) {
      if (Date.now() >= deadline.getTime()) break;
      await reconcileIfReleased(stores, owner, row.conversation_id);
    }
  }

  async function exportText(owner: Owner, conversationId: string) {
    validateId(conversationId);
    const stores = await options.openDatabase();
    try {
      const { conversation } = await getConversationAccess(stores, owner, conversationId, 'run.read');
      await reconcileIfReleased(stores, owner, conversationId);
      return await renderConversationExport(stores, owner, conversation);
    } finally { await stores.close(); }
  }
  return { start, detail, events, attachObservation, cancel, reconcilePending, exportText };
}
