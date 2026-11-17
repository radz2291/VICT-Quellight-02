import { defineContract, neutralJsonContract, type ApplicationDefinitionV3, type ResourceDefinition } from '@victframework/sdk';

export type MemorySettingsActionId = 'memory.settings.save' | 'memory.settings.restore';
export interface MemorySettingsActionInput {
  target: 'app' | 'room';
  roomId: string;
  expectedRevision: number;
  content?: string;
  restoreRevision?: number;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function contract(actionId: MemorySettingsActionId) {
  const fields = ['target', 'roomId', 'expectedRevision', actionId === 'memory.settings.save' ? 'content' : 'restoreRevision'];
  return defineContract<MemorySettingsActionInput>({
    id: `quellight.${actionId}.input`, revision: '1',
    presentationFields: Object.fromEntries(fields.map(field => [field, field.endsWith('Revision') ? 'number' : 'string'])),
    parse(input: unknown) {
      const invalid = { ok: false as const, issues: [{ code: 'MEMORY_SETTINGS_INPUT_INVALID', path: '(root)', message: 'Check the memory settings.' }] };
      if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid;
      const values = input as Record<string, unknown>;
      if (![Object.prototype, null].includes(Object.getPrototypeOf(values))) return invalid;
      const descriptors = Object.getOwnPropertyDescriptors(values);
      if (Reflect.ownKeys(descriptors).length !== fields.length || fields.some(key => !descriptors[key] || !('value' in descriptors[key]) || !descriptors[key].enumerable)) return invalid;
      if (Object.keys(values).some(key => !fields.includes(key)) || (values.target !== 'app' && values.target !== 'room')) return invalid;
      if (typeof values.roomId !== 'string' || (values.target === 'room' ? !uuid.test(values.roomId) : values.roomId !== '')) return invalid;
      if (!Number.isSafeInteger(values.expectedRevision) || Number(values.expectedRevision) < 0) return invalid;
      if (actionId === 'memory.settings.save' && typeof values.content !== 'string') return invalid;
      if (actionId === 'memory.settings.restore' && (!Number.isSafeInteger(values.restoreRevision) || Number(values.restoreRevision) < 0)) return invalid;
      return { ok: true as const, value: { target: values.target as 'app' | 'room', roomId: values.roomId,
        expectedRevision: Number(values.expectedRevision), ...(actionId === 'memory.settings.save'
          ? { content: values.content as string } : { restoreRevision: Number(values.restoreRevision) }) } };
    },
  });
}
export const memorySettingsActionBindings = Object.fromEntries((['memory.settings.save', 'memory.settings.restore'] as const).map(id => [id, {
  id, input: contract(id), output: neutralJsonContract, capabilityId: `quellight.${id}`, permission: `quellight.${id}`,
}])) as Record<MemorySettingsActionId, { id: MemorySettingsActionId; input: ReturnType<typeof contract>; output: typeof neutralJsonContract; capabilityId: string; permission: string }>;
export const memorySettingsContracts = Object.values(memorySettingsActionBindings).map(binding => binding.input);
export const memorySettingsActions: ApplicationDefinitionV3['actions'] = Object.values(memorySettingsActionBindings).map(binding => ({
  kind: 'mutation', id: binding.id, revision: '1', resourceId: 'quellight.memory-settings', resourceRevision: '1', op: binding.id,
  inputContractId: binding.input.id, inputContractRevision: '1', outputContractId: binding.output.id, outputContractRevision: binding.output.revision,
}));
export const memorySettingsResource: ResourceDefinition = {
  schema: 'vict.resource@1', id: 'quellight.memory-settings', revision: '1', identity: { key: 'id' },
  fields: [{ name: 'id', type: 'string', required: true }],
  mutations: Object.values(memorySettingsActionBindings).map(binding => ({ op: binding.id, effect: 'write',
    inputContractId: binding.input.id, outputContractId: binding.output.id, permissions: [binding.permission] })),
};

export type MemoryCareActionId = 'memory.correct' | 'memory.forget' | 'memory.resume' | 'memory.retry';
export interface MemoryCareActionInput {
  conversationId: string;
  expectedAuthorityRevision: string;
  /** JSON array of source message IDs; transport stays within canonical scalar fields. */
  sourceMessageIds: string;
  workingMemory?: string;
}
function careContract(actionId: MemoryCareActionId) {
  const fields = ['conversationId', 'expectedAuthorityRevision', 'sourceMessageIds', ...(actionId === 'memory.correct' ? ['workingMemory'] : [])];
  return defineContract<MemoryCareActionInput>({
    id: `quellight.${actionId}.input`, revision: '1',
    presentationFields: Object.fromEntries(fields.map(field => [field, 'string' as const])),
    parse(input: unknown) {
      const invalid = { ok: false as const, issues: [{ code: 'MEMORY_CARE_INPUT_INVALID', path: '(root)', message: 'Check the memory changes.' }] };
      if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return invalid;
      const descriptors = Object.getOwnPropertyDescriptors(input);
      if (Reflect.ownKeys(descriptors).length !== fields.length || fields.some(key => !descriptors[key] || !('value' in descriptors[key]) || !descriptors[key].enumerable || typeof descriptors[key].value !== 'string')) return invalid;
      const value = input as MemoryCareActionInput;
      if (!uuid.test(value.conversationId) || !value.expectedAuthorityRevision.trim()) return invalid;
      try {
        const ids: unknown = JSON.parse(value.sourceMessageIds);
        if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length || (actionId === 'memory.forget' && !ids.length)) return invalid;
      } catch { return invalid; }
      return { ok: true as const, value: { conversationId: value.conversationId, expectedAuthorityRevision: value.expectedAuthorityRevision,
        sourceMessageIds: value.sourceMessageIds, ...(actionId === 'memory.correct' ? { workingMemory: value.workingMemory! } : {}) } };
    },
  });
}
export const memoryCareActionBindings = Object.fromEntries((['memory.correct', 'memory.forget', 'memory.resume', 'memory.retry'] as const).map(id => [id, {
  id, input: careContract(id), output: neutralJsonContract, capabilityId: `quellight.${id}`, permission: `quellight.${id}`,
}])) as Record<MemoryCareActionId, { id: MemoryCareActionId; input: ReturnType<typeof careContract>; output: typeof neutralJsonContract; capabilityId: string; permission: string }>;
export const memoryCareContracts = Object.values(memoryCareActionBindings).map(binding => binding.input);
export const memoryCareActions: ApplicationDefinitionV3['actions'] = Object.values(memoryCareActionBindings).map(binding => ({
  kind: 'mutation', id: binding.id, revision: '1', resourceId: 'quellight.memory-care', resourceRevision: '1', op: binding.id,
  inputContractId: binding.input.id, inputContractRevision: '1', outputContractId: binding.output.id, outputContractRevision: binding.output.revision,
}));
export const memoryCareResource: ResourceDefinition = {
  schema: 'vict.resource@1', id: 'quellight.memory-care', revision: '1', identity: { key: 'id' },
  fields: [{ name: 'id', type: 'string', required: true }],
  mutations: Object.values(memoryCareActionBindings).map(binding => ({ op: binding.id, effect: 'write',
    inputContractId: binding.input.id, outputContractId: binding.output.id, permissions: [binding.permission] })),
};
