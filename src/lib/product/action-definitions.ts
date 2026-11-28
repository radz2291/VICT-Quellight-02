import type { ApplicationDefinitionV3, ResourceDefinition } from '@victframework/sdk';

// Presentation contracts describe the transport's declared input. Server handlers
// independently validate these requests and resolve the authenticated actor.
export const interfaceContracts = [
  { id: 'quellight.conversation.send.input', revision: '1', presentationFields: { conversationId: 'string', text: 'string' } },
  { id: 'quellight.conversation.cancel.input', revision: '1', presentationFields: { turnId: 'string' } },
  { id: 'quellight.auth.sign-in.input', revision: '1', presentationFields: { email: 'string', password: 'string' } },
  { id: 'quellight.auth.setup.input', revision: '1', presentationFields: { password: 'string', confirmation: 'string' } },
  { id: 'quellight.auth.sign-out.input', revision: '1', presentationFields: {} },
  { id: 'quellight.selection.input', revision: '1', presentationFields: { id: 'string' } }
] as const;

const operations = ['conversation.send', 'conversation.cancel', 'auth.sign-in', 'auth.setup', 'auth.sign-out'];
export const interfaceResources: ResourceDefinition[] = [{
  schema: 'vict.resource@1', id: 'quellight.interface', revision: '1',
  identity: { key: 'id' }, fields: [{ name: 'id', type: 'string', required: true }],
  mutations: operations.map(op => ({
    op, effect: 'write', inputContractId: `quellight.${op}.input`,
    permissions: [`quellight.${op}`]
  }))
}];

export const interfaceActions: ApplicationDefinitionV3['actions'] = [
  ...operations.map(id => ({
    kind: 'mutation' as const, id, revision: '1', resourceId: 'quellight.interface', resourceRevision: '1',
    op: id, inputContractId: `quellight.${id}.input`, inputContractRevision: '1'
  })),
  ...['ui.room.select', 'ui.conversation.select', 'ui.memory.source.toggle', 'ui.room-guidance.edit', 'ui.room-guidance.forget.select'].map(id => ({
    kind: 'local' as const, id, revision: '1', inputContractId: 'quellight.selection.input'
  })),
  ...['ui.room.edit', 'ui.room.dismiss', 'ui.room.new', 'ui.archive.open', 'ui.archive.dismiss', 'ui.reload', 'ui.export', 'ui.history.older', 'ui.send.retry',
    'ui.memory.open', 'ui.memory.context', 'ui.memory.more-sources', 'ui.memory.more-replies', 'ui.memory.reload', 'ui.memory.defaults', 'ui.memory.defaults.close', 'ui.memory.settings.preview',
    'ui.memory.forget.open', 'ui.memory.forget.close',
    'ui.room-guidance.reload', 'ui.room-guidance.cancel', 'ui.room-guidance.rebase', 'ui.room-guidance.correct',
    'ui.room-guidance.forget.cancel', 'ui.room-guidance.forget', 'ui.room-guidance.restore'].map(id => ({
    kind: 'local' as const, id, revision: '1'
  }))
];
