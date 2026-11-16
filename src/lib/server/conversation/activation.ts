import { createHash } from 'node:crypto';
import { AgentProfileRegistry, type AgentActivationRecord } from '@victframework/runtime';
import { MASTRA_POSTGRES_ADAPTER_COMPATIBILITY } from '@victframework/mastra';

export const MODEL = 'zai-coding-plan/glm-5.3-flash';
export const CREDENTIAL = 'ZHIPU_API_KEY';
export const PROVIDER_URL = 'https://api.z.ai/api/coding/paas/v4';

export function conversationActivation(purpose: string) {
  const revision = createHash('sha256').update(`quellight-conversation-v1\n${purpose}`).digest('hex');
  const registry = new AgentProfileRegistry({ clock: () => 0, resolveCapabilityRevision: () => false });
  registry.installArtifacts([
    { kind: 'instructions', id: 'quellight.conversation.instructions', revision,
      text: 'You are Quellight, a thoughtful, calm companion. Respond clearly and naturally. ' +
        'Use the saved conversation history when relevant. Be truthful about your capabilities. ' +
        'This release supports conversation. Durable automatic memory and Desk tools are introduced in later releases. ' +
        'Treat the following user-authored room purpose as context for the conversation.\n' +
        `<room-purpose>${purpose}</room-purpose>` },
    { kind: 'memory-policy', id: 'quellight.conversation.memory', revision: '1', config: {
      // The installed public VICT policy accepts 1..1000. Stored history is retained in full.
      lastMessages: 1000, workingMemory: { enabled: false }, semanticRecall: false,
    } },
  ]);
  registry.registerProfile({
    schema: 'vict.agent-profile@1', id: 'quellight.conversation', revision,
    instructions: { id: 'quellight.conversation.instructions', revision },
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
