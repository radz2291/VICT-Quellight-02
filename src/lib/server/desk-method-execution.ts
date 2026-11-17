import { createHash, randomUUID } from 'node:crypto';
import { AgentTurnService } from '@victframework/control';
import {
  composeMastraTurnExecutor, createPostgresMastraStore, MastraConversationExportPort,
  MastraSanitizedLogger, mastraThreadIdForConversation, MASTRA_POSTGRES_ADAPTER_COMPATIBILITY,
  type MastraProductAgentConfig,
} from '@victframework/mastra';
import {
  AgentProfileRegistry, AgentStreamHub, authenticatedActorContext, assertActorScope,
  type AgentActivationRecord,
} from '@victframework/runtime';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import { MODEL, CREDENTIAL } from './conversation/activation.js';
import { MEMORY_SCHEMA } from './db/config.js';
import { ProductError } from './domain/queries.js';

export interface DeskMethodGenerationRequest {
  /** The worker commits both identities before asking for generation. */
  jobId: string;
  attemptId: string;
  actorId: string;
  instructions: string;
  input: string;
  revision: string;
  deadline: Date;
}
export interface DeskMethodExecutionRef {
  jobId: string;
  attemptId: string;
  turnId: string;
  conversationId: string;
  activationVersion: string;
  inputDigest: string;
  status: 'completed';
}
export interface DeskMethodGenerationResult { text: string; executionRef: DeskMethodExecutionRef }
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terminal = new Set(['completed', 'failed', 'cancelled', 'blocked']);

/** A dedicated governed VICT turn, with no tools and no second conversation-memory selector. */
export function deskMethodActivation(request: Omit<DeskMethodGenerationRequest, 'deadline'>) {
  const revision = hash({ schema: 'quellight.desk-method-execution@1', instructions: request.instructions,
    input: request.input, configurationRevision: request.revision, model: MODEL });
  const registry = new AgentProfileRegistry({ clock: () => 0 });
  registry.installArtifacts([
    { kind: 'instructions', id: 'quellight.desk-method.instructions', revision, text: request.instructions },
    { kind: 'memory-policy', id: 'quellight.desk-method.memory', revision: '1',
      config: { lastMessages: false, workingMemory: { enabled: false }, semanticRecall: false } },
  ]);
  registry.registerProfile({ schema: 'vict.agent-profile@1', id: 'quellight.desk-method', revision,
    instructions: { id: 'quellight.desk-method.instructions', revision },
    memoryPolicy: { id: 'quellight.desk-method.memory', revision: '1' },
    modelProfile: { id: 'quellight.glm-flash', revision: '1', provider: 'zai-coding-plan',
      routerModel: MODEL, providerCredentialVar: CREDENTIAL },
    generation: {}, turnPolicy: { schema: 'vict.agent-turn-policy@2', mode: 'until-completion-or-cancel' },
    capabilities: [], adapter: MASTRA_POSTGRES_ADAPTER_COMPATIBILITY,
  });
  const activation = registry.activateAgentProfile({ id: 'quellight.desk-method', revision });
  const record: AgentActivationRecord = { recordSchema: 'vict.agent-activation-record@1',
    activationVersion: activation.activationVersion, agentProfileVersion: activation.agentProfileVersion,
    agentId: 'quellight.desk-method', agentRevision: revision, canonicalManifest: activation.canonicalManifestJson,
    artifacts: activation.artifactList, createdAt: activation.createdAt };
  return { registry, activation, record };
}

export function createDeskMethodExecutor(options: {
  /** Resolve only after checking durable execution. Never called for completed replay. */
  modelFactory(): Promise<MastraProductAgentConfig['modelFactory']>;
}) {
  return async function generate(stores: PostgresStoreSet, request: DeskMethodGenerationRequest): Promise<DeskMethodGenerationResult> {
    if (![request.jobId, request.attemptId, request.actorId].every(value => typeof value === 'string' && /^[a-zA-Z0-9:_-]+$/.test(value)) ||
      !request.instructions?.trim() || !request.input?.trim() || !request.revision) throw new ProductError('DESK_METHOD_EXECUTION_INVALID', 503);
    const remaining = Math.floor(request.deadline.getTime() - Date.now());
    if (!Number.isFinite(remaining) || remaining <= 0) throw new ProductError('DESK_METHOD_HOST_WINDOW_ENDED', 503);
    const actor = authenticatedActorContext(await stores.actors.get(request.actorId), request.actorId);
    assertActorScope(actor, 'agent.turn.start'); assertActorScope(actor, 'app.data.read');
    const claim = await stores.coordination.acquire({ scopeId: `quellight:desk-method-execution:${request.actorId}:${request.jobId}`,
      actorId: request.actorId, ownerId: randomUUID(), leaseMs: remaining });
    if (claim.status !== 'acquired') throw new ProductError('DESK_METHOD_EXECUTION_BUSY', 409);
    let hosted: Awaited<ReturnType<typeof createPostgresMastraStore>> | undefined;
    let composition: ReturnType<typeof composeMastraTurnExecutor> | undefined;
    const turnId = `quellight:desk-method:${hash([request.actorId, request.jobId, request.attemptId])}`;
    const conversationId = `desk-method:${hash([request.actorId, request.jobId, request.attemptId])}`;
    const ids = { turnId: () => turnId, streamId: () => `stream:${turnId}`, invocationId: randomUUID,
      approvalId: randomUUID, idempotencyKey: randomUUID, cancelId: randomUUID };
    try {
      const profile = deskMethodActivation(request), fenced = stores.forLease(claim.lease);
      const existing = await fenced.turns.getTurn(turnId);
      if (existing && (existing.actorId !== request.actorId || existing.agentProfileVersion !== profile.activation.agentProfileVersion ||
        existing.activationVersion !== undefined && existing.activationVersion !== profile.activation.activationVersion ||
        existing.threadId !== mastraThreadIdForConversation(conversationId))) throw new ProductError('DESK_METHOD_EXECUTION_CONFLICT', 409);
      if (existing && !terminal.has(existing.status)) {
        // The per-job lease proves the former execution owner is gone. Preserve its
        // truthful failed receipt; the worker must persist a NEW attempt before retry.
        await fenced.turns.reconcileTurn({ turnId, status: 'failed', reasonCode: 'VICT_TURN_INTERRUPTED', at: Date.now() });
        throw new ProductError('DESK_METHOD_GENERATION_INTERRUPTED', 503);
      }
      if (existing && existing.status !== 'completed') throw new ProductError('DESK_METHOD_ATTEMPT_TERMINAL', 503);
      hosted = await createPostgresMastraStore({ coordination: stores.coordination,
        schemaName: MEMORY_SCHEMA, migration: 'verify', memoryProfile: 'history', leaseMs: remaining });
      if (!existing) {
        await fenced.governance.saveAgentActivation(profile.record);
        const hub = new AgentStreamHub({ ledger: fenced.streamLedger });
        const tools = new AgentTurnService({ stores: fenced, ids });
        const modelFactory = await options.modelFactory();
        composition = composeMastraTurnExecutor({ stores: fenced, activation: profile.activation, hub, ids,
          agentConfig: { store: hosted.store, threadCoordinator: hosted.coordinator, modelFactory,
            logger: new MastraSanitizedLogger(), tracing: { sampling: { type: 'never' } } },
          capabilityBridge: {
            resolveCapability: () => undefined, invoke: async () => { throw new Error('CAPABILITY_UNAVAILABLE'); },
            recordInvocationIntent: input => tools.recordToolInvocationIntent(input),
            claimInvocationRun: input => fenced.invocations.claimInvocationRun(input),
            settleInvocationRun: input => fenced.invocations.settleInvocationRun(input),
            settleInvocationPending: input => fenced.invocations.settleInvocationPending(input),
            reconcileAbandonedRun: input => fenced.invocations.reconcileAbandonedRun(input),
            requestApproval: input => tools.requestApproval(input), consumeApproval: input => tools.consumeApproval(input),
            updateInvocationStatus: input => fenced.invocations.updateInvocationStatus(input),
          },
        });
        const started = await composition.turnService.startTurn(actor, { threadId: mastraThreadIdForConversation(conversationId),
          input: request.input, inputSummary: 'Reflect on this room’s Desk method' });
        const outcome = await started.outcomePromise;
        if (outcome.status !== 'completed') throw new ProductError('DESK_METHOD_GENERATION_FAILED', 503);
      }
      // Public accepted transcript, never a private reasoning stream or partial delta.
      const exported = await new MastraConversationExportPort({ store: hosted.store, actorId: request.actorId,
        threadCoordinator: hosted.coordinator }).exportConversationThread(conversationId);
      const text = exported?.messages.filter(message => message.role === 'assistant').map(message => message.text).join('\n').trim();
      if (!text) throw new ProductError('DESK_METHOD_OUTPUT_UNAVAILABLE', 503);
      return { text, executionRef: { jobId: request.jobId, attemptId: request.attemptId, turnId, conversationId,
        activationVersion: profile.activation.activationVersion, inputDigest: hash(request.input), status: 'completed' } };
    } finally {
      // The adapter's completed-turn barrier already settles its accepted save in
      // the original thread fence. A later flush would run outside that fence.
      try { await hosted?.close(); } finally { await stores.coordination.release(claim.lease); }
    }
  };
}
