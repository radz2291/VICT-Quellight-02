import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

let server;
let prompts;
let conversationActivation;

before(async () => {
  server = await createServer({
    configFile: false, logLevel: 'error',
    server: { middlewareMode: true, hmr: false }, appType: 'custom',
    ssr: { noExternal: [/^@victframework\//] },
    optimizeDeps: { noDiscovery: true }
  });
  prompts = await server.ssrLoadModule('/src/lib/server/prompts/catalog.ts');
  ({ conversationActivation } = await server.ssrLoadModule('/src/lib/server/conversation/activation.ts'));
});

after(async () => { await server?.close(); });

test('prompt edits change the real conversation activation and reverting restores its identity', () => {
  const definition = prompts.promptCatalog.conversation;
  const original = [...definition.template];
  const first = conversationActivation('A space for planning.');
  const originalRecord = JSON.stringify(first.record);
  try {
    definition.template[0] = 'You are Quellight. Use concise replies.';
    const edited = conversationActivation('A space for planning.');
    assert.notEqual(edited.activation.activationVersion, first.activation.activationVersion);
    assert.notEqual(edited.activation.agentProfileVersion, first.activation.agentProfileVersion);
    assert.equal(JSON.stringify(first.record), originalRecord);
  } finally {
    definition.template.splice(0, definition.template.length, ...original);
  }
  assert.equal(conversationActivation('A space for planning.').activation.activationVersion, first.activation.activationVersion);
});

test('room context remains literal and participates in the prompt identity', () => {
  const definition = prompts.promptCatalog.conversation;
  const purpose = 'Keep {{roomPurpose}}, {{unknown}}, $& and $1 as literal notes.';
  const result = prompts.renderPrompt(definition, { roomPurpose: purpose });
  assert.ok(result.text.endsWith(`<room-purpose>${purpose}</room-purpose>`));
  assert.notEqual(result.revision, prompts.renderPrompt(definition, { roomPurpose: 'Different room.' }).revision);
  assert.notEqual(conversationActivation(purpose).activation.activationVersion,
    conversationActivation('Different room.').activation.activationVersion);
});

test('invalid prompt edits fail before constructing a runnable profile', () => {
  const definition = prompts.promptCatalog.conversation;
  assert.throws(() => prompts.renderPrompt(definition, {}), /PROMPT_VARIABLES_INVALID/);
  assert.throws(() => prompts.renderPrompt(definition, { roomPurpose: '', extra: '' }), /PROMPT_VARIABLES_INVALID/);
  assert.throws(() => prompts.renderPrompt({ ...definition, template: ['{{unknown}}'] }, { roomPurpose: '' }), /PROMPT_VARIABLE_UNDECLARED/);
  assert.throws(() => prompts.renderPrompt({ ...definition, template: ['No room context.'] }, { roomPurpose: '' }), /PROMPT_VARIABLE_UNUSED/);
  assert.throws(() => prompts.renderPrompt({ ...definition, template: ['  '] }, { roomPurpose: '' }), /PROMPT_DEFINITION_EMPTY/);
});
