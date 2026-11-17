import { createHash, randomUUID } from 'node:crypto';
import { AgentProfileRegistry, authenticatedActorContext, assertActorScope, gateCapabilityInvoke } from '@victframework/runtime';
import { AgentTurnService } from '@victframework/control';
import { defineContract, neutralJsonContract, type CapabilityContext } from '@victframework/sdk';
import { bridgeCapabilityToolToMastra, MASTRA_POSTGRES_ADAPTER_COMPATIBILITY, runWithBridgeTurnScope } from '@victframework/mastra';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import { MODEL, CREDENTIAL } from '../conversation/activation.js';
import { promptCatalog, renderPrompt } from '../prompts/catalog.js';

export const MEMORY_PROCESS_CAPABILITY = 'quellight.memory.maintain';
const revision = '1';
const permission = 'quellight.memory.maintain';
const kinds = new Set(['observe', 'reflect', 'reconcile', 'revise-authority', 'purge-invalidated', 'import-sources']);
export interface GovernedMemoryRequest {
  kind: string; actorId: string; conversationId: string; operationId: string;
  configurationRevision: string; sourceRevision: string; authorityRevision?: string;
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Trusted automatic policy authorizes this exact capability revision only. Native publication
 * remains the authority for operation replay/reconciliation; every actual attempt has a VICT receipt. */
export async function automaticMemoryWriter(stores: PostgresStoreSet, actorId: string) {
  const actor = authenticatedActorContext(await stores.actors.get(actorId), actorId);
  assertActorScope(actor, 'agent.turn.start');
  const instructions = renderPrompt(promptCatalog.maintenance, {});
  const registry = new AgentProfileRegistry({ clock: () => 0,
    resolveCapabilityRevision: (id, rev) => id === MEMORY_PROCESS_CAPABILITY && rev === revision });
  registry.installArtifacts([
    { kind: 'instructions', ...instructions },
    { kind: 'memory-policy', id: 'quellight.maintenance.no-history', revision, config: {
      lastMessages: false, workingMemory: { enabled: false }, semanticRecall: false,
    } },
  ]);
  registry.registerProfile({ schema: 'vict.agent-profile@1', id: 'quellight.memory.maintenance', revision: instructions.revision,
    instructions: { id: instructions.id, revision: instructions.revision },
    modelProfile: { id: 'quellight.glm-flash', revision, provider: 'zai-coding-plan', routerModel: MODEL, providerCredentialVar: CREDENTIAL },
    generation: {}, turnPolicy: { schema: 'vict.agent-turn-policy@2', mode: 'until-completion-or-cancel' },
    memoryPolicy: { id: 'quellight.maintenance.no-history', revision },
    capabilities: [{ id: MEMORY_PROCESS_CAPABILITY, revision }], adapter: MASTRA_POSTGRES_ADAPTER_COMPATIBILITY,
  });
  const activation = registry.activateAgentProfile({ id: 'quellight.memory.maintenance', revision: instructions.revision });
  const existing = await stores.governance.getAgentActivation(activation.activationVersion);
  if (existing) {
    if (!registry.restoreActivation(existing).ok) throw new Error('MEMORY_ACTIVATION_INVALID');
  } else await stores.governance.saveAgentActivation({ recordSchema: 'vict.agent-activation-record@1', activationVersion: activation.activationVersion,
      agentProfileVersion: activation.agentProfileVersion, agentId: 'quellight.memory.maintenance', agentRevision: instructions.revision,
      canonicalManifest: activation.canonicalManifestJson, artifacts: activation.artifactList, createdAt: activation.createdAt });
  const turnService = new AgentTurnService({ stores, ids: { turnId: randomUUID, streamId: randomUUID,
    invocationId: randomUUID, approvalId: randomUUID, idempotencyKey: randomUUID, cancelId: randomUUID } });

  return async function governedWrite<T>(request: GovernedMemoryRequest, effect: () => Promise<T>): Promise<T> {
    if (request.actorId !== actorId || !kinds.has(request.kind) ||
      ['conversationId','operationId','configurationRevision','sourceRevision'].some(field => typeof request[field as keyof GovernedMemoryRequest] !== 'string' || !request[field as keyof GovernedMemoryRequest])) {
      throw new Error('MEMORY_AUTHORITY_INVALID');
    }
    // Job admission never elevates a revoked actor, even when the writer was opened earlier.
    assertActorScope(authenticatedActorContext(await stores.actors.get(actorId), actorId), 'agent.turn.start');
    const requestDigest = digest(request), turnId = `quellight-memory:${randomUUID()}`, streamId = `stream:${turnId}`;
    const threadId = `vict-conv-${request.conversationId}`, now = Date.now();
    await stores.turns.createTurnIntent({ turnId, streamId, threadId, actorId,
      agentProfileVersion: activation.agentProfileVersion, activationVersion: activation.activationVersion,
      inputSummary: `memory:${request.kind}:${request.operationId}`, status: 'intent', createdAt: now, updatedAt: now,
      applicationReleaseVersion: undefined, terminalAt: undefined, errorCode: undefined, traceId: undefined,
      victRunId: undefined, mastraRunId: undefined });
    await stores.turns.startTurn(turnId, now);
    const input = defineContract<GovernedMemoryRequest>({ id: 'quellight.memory.maintain.input', revision,
      descriptiveJsonSchema: { type: 'object', properties: Object.fromEntries(Object.keys(request).map(key => [key, { type: 'string' }])), required: Object.keys(request), additionalProperties: false },
      parse(value) { return value && typeof value === 'object' && digest(value) === requestDigest
        ? { ok: true, value: value as GovernedMemoryRequest }
        : { ok: false, issues: [{ code: 'MEMORY_REQUEST_CHANGED', path: '(root)', message: 'The memory operation changed.' }] }; } });
    let originalError: unknown;
    const capability = { id: MEMORY_PROCESS_CAPABILITY, revision, effect: 'write' as const, permissions: [permission], input, output: neutralJsonContract,
      invoke: async () => { try { return await effect(); } catch (error) { originalError = error; throw error; } } };
    const invoke = gateCapabilityInvoke(capability, { grants: [permission] });
    const tool = bridgeCapabilityToolToMastra(activation, capability, {
      resolveCapability: (id, rev) => id === capability.id && rev === revision ? capability : undefined,
      // The public bridge supplies a partial context; this capability consumes no missing graph fields.
      invoke: async (_definition, value, context) => invoke(value, context as CapabilityContext),
      recordInvocationIntent: value => turnService.recordToolInvocationIntent(value),
      claimInvocationRun: value => stores.invocations.claimInvocationRun(value),
      settleInvocationRun: value => stores.invocations.settleInvocationRun(value),
      settleInvocationPending: value => stores.invocations.settleInvocationPending(value),
      reconcileAbandonedRun: value => stores.invocations.reconcileAbandonedRun(value),
      requestApproval: value => turnService.requestApproval(value), consumeApproval: value => turnService.consumeApproval(value),
      updateInvocationStatus: value => stores.invocations.updateInvocationStatus(value),
      quietWriteApprovals: { policyIdentity: 'quellight.automatic-memory@1', entries: [{ capabilityId: capability.id, capabilityRevision: revision }] },
    });
    try {
      if (!tool || typeof tool !== 'object' || !('execute' in tool) || typeof tool.execute !== 'function') throw new Error('MEMORY_BRIDGE_UNAVAILABLE');
      const executeTool = tool.execute.bind(tool);
      const result = await runWithBridgeTurnScope({ turnId, streamId, threadId, actorId, agentProfileVersion: activation.agentProfileVersion },
        () => executeTool(request, { toolCallId: 'native-memory' })) as Record<string, unknown>;
      if (result?.victCapabilityFailure || result?.victCapabilityReplay) throw originalError ?? new Error('MEMORY_WRITE_UNCONFIRMED');
      await stores.turns.completeTurn({ turnId, status: 'completed', at: Date.now() });
      return result as T;
    } catch (error) {
      await stores.turns.completeTurn({ turnId, status: 'failed', at: Date.now(), errorCode: 'MEMORY_WRITE_UNCONFIRMED' });
      throw error;
    }
  };
}
