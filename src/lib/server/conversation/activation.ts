import { createHash } from 'node:crypto';
import { AgentProfileRegistry, type AgentActivationRecord } from '@victframework/runtime';
import { MASTRA_POSTGRES_ADAPTER_COMPATIBILITY, MASTRA_RECOVERABLE_MEMORY_ADAPTER_COMPATIBILITY } from '@victframework/mastra';
import { promptCatalog, renderPrompt } from '../prompts/catalog.js';
import type { EffectiveMemorySettings } from '../memory/settings.js';
import type { DeskContextSelection } from '../desk/context.js';

export const MODEL = 'zai-coding-plan/glm-5.3-flash';
export const CREDENTIAL = 'ZHIPU_API_KEY';
export const PROVIDER_URL = 'https://api.z.ai/api/coding/paas/v4';

export interface ManagedConversationBinding {
  effective: EffectiveMemorySettings;
  memory: { id: string; revision: string };
  recall: { id: string; revision: string };
  desk?: { selection: DeskContextSelection; capabilities: readonly { id: string; revision: string }[] };
}
export function conversationActivation(purpose: string, managed?: ManagedConversationBinding) {
  const baseInstructions = managed ? renderPrompt(promptCatalog.conversationContext, {
    conversationInstructions: managed.effective.prompts.roles.conversation.text!,
    responseGuidance: managed.effective.configuration.values.responseGuidance,
  }) : renderPrompt(promptCatalog.conversation, { roomPurpose: purpose });
  const instructions = managed?.desk ? renderPrompt(promptCatalog.conversationDesk, {
    conversationInstructions: baseInstructions.text,
    deskSelection: JSON.stringify({ roomId: managed.desk.selection.roomId, ...JSON.parse(managed.desk.selection.text) }),
  }) : baseInstructions;
  const capabilities = managed ? [managed.recall, ...(managed.desk?.capabilities ?? [])] : [];
  const revision = createHash('sha256').update(JSON.stringify({ schema: 'quellight-conversation-v3',
    instructions: instructions.revision, memory: managed?.memory, recall: managed?.recall,
    settings: managed?.effective.revision, desk: managed?.desk?.selection.digest, capabilities })).digest('hex');
  const memoryRevision = managed ? revision : '1';
  const registry = new AgentProfileRegistry({ clock: () => 0,
    resolveCapabilityRevision: (id, revision) => capabilities.some(capability => capability.id === id && capability.revision === revision) });
  registry.installArtifacts([
    { kind: 'instructions', ...instructions },
    { kind: 'memory-policy', id: 'quellight.conversation.memory', revision: memoryRevision, config: managed ? {
      // The native selector supplies history, OM and applicable personal memory once.
      lastMessages: false, workingMemory: { enabled: false }, semanticRecall: false,
      managedContext: managed.memory,
    } : {
      // The installed public VICT policy accepts 1..1000. Stored history is retained in full.
      lastMessages: 1000, workingMemory: { enabled: false }, semanticRecall: false,
    } },
  ]);
  registry.registerProfile({
    schema: 'vict.agent-profile@1', id: 'quellight.conversation', revision,
    instructions: { id: instructions.id, revision: instructions.revision },
    modelProfile: { id: 'quellight.glm-flash', revision: '1', provider: 'zai-coding-plan',
      routerModel: MODEL, providerCredentialVar: CREDENTIAL },
    generation: {},
    turnPolicy: { schema: 'vict.agent-turn-policy@2', mode: 'until-completion-or-cancel' },
    memoryPolicy: { id: 'quellight.conversation.memory', revision: memoryRevision },
    capabilities,
    adapter: managed ? MASTRA_RECOVERABLE_MEMORY_ADAPTER_COMPATIBILITY : MASTRA_POSTGRES_ADAPTER_COMPATIBILITY,
  });
  const activation = registry.activateAgentProfile({ id: 'quellight.conversation', revision });
  const record: AgentActivationRecord = {
    recordSchema: 'vict.agent-activation-record@1', activationVersion: activation.activationVersion,
    agentProfileVersion: activation.agentProfileVersion, agentId: 'quellight.conversation', agentRevision: revision,
    canonicalManifest: activation.canonicalManifestJson, artifacts: activation.artifactList, createdAt: activation.createdAt,
  };
  return { registry, activation, record };
}
