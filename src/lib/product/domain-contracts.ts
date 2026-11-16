import { defineContract, neutralJsonContract } from '@victframework/sdk';
import type { ApplicationDefinitionV3, ResourceDefinition } from '@victframework/sdk';

export type ProductInput = Record<string, string | number>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const specifications = {
  'room.create': { required: ['name'], optional: ['purpose'] },
  'room.rename': { required: ['id', 'name', 'revision'], optional: [] },
  'room.archive': { required: ['id', 'revision'], optional: [] },
  'conversation.create': { required: ['roomId'], optional: ['title'] }
} as const;
export type ProductActionId = keyof typeof specifications;

function inputContract(actionId: ProductActionId) {
  const spec = specifications[actionId];
  const fields = [...spec.required, ...spec.optional] as string[];
  return defineContract<ProductInput>({
    id: `quellight.${actionId}.input`, revision: '1',
    presentationFields: Object.fromEntries(fields.map(field => [field, field === 'revision' ? 'number' : 'string'])),
    parse(input: unknown) {
      const invalid = { ok: false as const, issues: [{ code: 'INVALID_INPUT', path: '(root)', message: 'Check the supplied values.' }] };
      if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid;
      const values = input as Record<string, unknown>;
      if (Object.keys(values).some(field => !fields.includes(field)) || spec.required.some(field => !(field in values))) return invalid;
      const parsed: ProductInput = {};
      for (const [field, value] of Object.entries(values)) {
        if (field === 'revision') {
          if (!Number.isSafeInteger(value) || Number(value) < 1) return invalid;
          parsed[field] = Number(value);
        } else {
          if (typeof value !== 'string') return invalid;
          if (['id', 'roomId'].includes(field) && !uuid.test(value)) return invalid;
          const text = value.trim();
          if (field !== 'purpose' && !text) return invalid;
          if (text.length > (field === 'purpose' ? 4000 : 200)) return invalid;
          parsed[field] = text;
        }
      }
      return { ok: true as const, value: parsed };
    }
  });
}

export const productActionBindings = Object.fromEntries(Object.keys(specifications).map(id => {
  const actionId = id as ProductActionId;
  return [actionId, {
    id: actionId, input: inputContract(actionId), output: neutralJsonContract,
    capabilityId: `quellight.product.${actionId}`, permission: `quellight.product.${actionId}`,
    resourceId: actionId.startsWith('room.') ? 'quellight.rooms' : 'quellight.conversations',
    op: actionId.split('.')[1]
  }];
})) as Record<ProductActionId, { id: ProductActionId; input: ReturnType<typeof inputContract>; output: typeof neutralJsonContract; capabilityId: string; permission: string; resourceId: string; op: string }>;

export const productContracts = [...Object.values(productActionBindings).map(binding => binding.input), neutralJsonContract];
export const productActions: ApplicationDefinitionV3['actions'] = Object.values(productActionBindings).map(binding => ({
  kind: 'mutation', id: binding.id, revision: '1', resourceId: binding.resourceId, resourceRevision: '1', op: binding.op,
  inputContractId: binding.input.id, inputContractRevision: '1',
  outputContractId: binding.output.id, outputContractRevision: binding.output.revision
}));
export const productResources: ResourceDefinition[] = ['quellight.rooms', 'quellight.conversations'].map(id => ({
  schema: 'vict.resource@1', id, revision: '1', identity: { key: 'id' },
  fields: [{ name: 'id', type: 'string', required: true }],
  mutations: Object.values(productActionBindings).filter(binding => binding.resourceId === id).map(binding => ({
    op: binding.op, effect: 'write', inputContractId: binding.input.id,
    outputContractId: binding.output.id, permissions: [binding.permission]
  }))
}));
