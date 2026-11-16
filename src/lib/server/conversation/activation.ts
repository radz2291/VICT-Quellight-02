import { createHash } from 'node:crypto';
import { AgentProfileRegistry, type AgentActivationRecord } from '@victframework/runtime';
import { MASTRA_POSTGRES_ADAPTER_COMPATIBILITY } from '@victframework/mastra';
import { promptCatalog, renderPrompt } from '../prompts/catalog.js';

export const MODEL = 'zai-coding-plan/glm-5.3-flash';
export const CREDENTIAL = 'ZHIPU_API_KEY';
export const PROVIDER_URL = 'https://api.z.ai/api/coding/paas/v4';

export function conversationActivation(purpose: string) {
  const instructions = renderPrompt(promptCatalog.conversation, { roomPurpose: purpose });
  const revision = createHash('sha256').update(`quellight-conversation-v2\n${instructions.revision}`).digest('hex');
  const registry = new AgentProfileRegistry({ clock: () => 0, resolveCapabilityRevision: () => false });
  registry.installArtifacts([
    { kind: 'instructions', ...instructions },
    { kind: 'memory-policy', id: 'quellight.conversation.memory', revision: '1', config: {
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
    memoryPolicy: { id: 'quellight.conversation.memory', revision: '1' },
    capabilities: [], adapter: MASTRA_POSTGRES_ADAPTER_COMPATIBILITY,
  });
  const activation = registry.activateAgentProfile({ id: 'quellight.conversation', revision });
  const record: AgentActivationRecord = {
    recordSchema: 'vict.agent-activation-record@1', activationVersion: activation.activationVersion,
    agentProfileVersion: activation.agentProfileVersion, agentId: 'quellight.conversation', agentRevision: revision,
    canonicalManifest: activation.canonicalManifestJson, artifacts: activation.artifactList, createdAt: activation.createdAt,
  };
  return { registry, activation, record };
}
