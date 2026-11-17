import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

let server, settings, prompts;
before(async () => {
  server = await createServer({ configFile: false, logLevel: 'error',
    server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  settings = await server.ssrLoadModule('/src/lib/server/memory/settings.ts');
  prompts = await server.ssrLoadModule('/src/lib/server/prompts/memory-catalog.ts');
});
after(async () => { await server?.close(); });

test('native defaults remain distinguishable from the explicit Quellight personal-preferences preset', () => {
  const defaults = settings.createAppMemorySettings();
  const room = settings.createRoomMemorySettings('A room');
  const result = settings.previewMemorySettings(defaults, room);
  for (const role of ['observer', 'reflector', 'recall']) {
    assert.equal(result.prompts.roles[role].selection.mode, 'native-default');
    assert.equal(result.prompts.roles[role].text, undefined);
    assert.equal(result.prompts.roles[role].native.package, '@mastra/memory');
  }
  assert.equal(result.prompts.roles.workingMemory.selection.mode, 'preset');
  assert.equal(prompts.memoryPromptCatalog.presets['personal-preferences'].source, 'quellight-preset');
  assert.match(result.prompts.roles.workingMemory.text, /Communication preferences/);
  const native = structuredClone(defaults);
  native.prompts.workingMemory = { mode: 'native-default' };
  assert.equal(settings.previewMemorySettings(native, room).prompts.roles.workingMemory.text, undefined);
  assert.notEqual(settings.previewMemorySettings(native, room).revision, result.revision);
});

test('custom empty additions and templates stay explicit while inherited prompts follow defaults', () => {
  const defaults = structuredClone(settings.createAppMemorySettings());
  const room = structuredClone(settings.createRoomMemorySettings());
  for (const role of ['observer', 'reflector', 'recall', 'workingMemory']) {
    const mode = role === 'workingMemory' ? 'template' : 'append';
    defaults.prompts[role] = { mode, text: 'Default A' };
    room.prompts[role] = { mode: 'override', value: { mode, text: '' } };
    let result = settings.previewMemorySettings(defaults, room);
    assert.equal(result.prompts.roles[role].text, '');
    assert.equal(result.prompts.roles[role].source, 'room');
    defaults.prompts[role] = { mode, text: 'Default B' };
    assert.equal(settings.previewMemorySettings(defaults, room).prompts.roles[role].text, '');
    room.prompts[role] = { mode: 'inherit' };
    result = settings.previewMemorySettings(defaults, room);
    assert.equal(result.prompts.roles[role].text, 'Default B');
    assert.equal(result.prompts.roles[role].source, 'app');
  }
});

test('full conversation override renders room purpose once and preserves its literal content', () => {
  const defaults = structuredClone(settings.createAppMemorySettings());
  const literal = 'Keep {{roomPurpose}} and $& literal.';
  const room = structuredClone(settings.createRoomMemorySettings(literal));
  defaults.prompts.conversation = { mode: 'replace', text: 'Purpose: {{roomPurpose}}' };
  assert.equal(settings.previewMemorySettings(defaults, room).prompts.roles.conversation.text, `Purpose: ${literal}`);
  room.prompts.conversation = { mode: 'override', value: { mode: 'replace', text: 'An independent instruction.' } };
  assert.equal(settings.previewMemorySettings(defaults, room).prompts.roles.conversation.text, 'An independent instruction.');
  for (const text of ['', '  ', 'Unknown {{secret}}']) {
    room.prompts.conversation.value = { mode: 'replace', text };
    assert.throws(() => settings.previewMemorySettings(defaults, room), /MEMORY_PROMPT_INVALID/);
  }
});

test('effective revisions pin selected content and separately pin inheritance, without mutable aliases', () => {
  const defaults = structuredClone(settings.createAppMemorySettings());
  const room = structuredClone(settings.createRoomMemorySettings('Authored'));
  const initial = settings.previewMemorySettings(defaults, room);
  room.prompts.observer = { mode: 'override', value: { mode: 'native-default' } };
  const explicit = settings.previewMemorySettings(defaults, room);
  assert.equal(explicit.revision, initial.revision);
  assert.notEqual(explicit.prompts.roomRevision, initial.prompts.roomRevision);
  defaults.prompts.reflector = { mode: 'append', text: 'Preserve explicit corrections.' };
  const changed = settings.previewMemorySettings(defaults, room);
  assert.notEqual(changed.revision, initial.revision);
  const retained = JSON.stringify(changed);
  defaults.prompts.reflector.text = 'Modified outside snapshot';
  room.configuration.purpose = 'Changed later';
  assert.equal(JSON.stringify(changed), retained);
  assert.throws(() => { changed.prompts.roles.reflector.selection.text = 'Mutation'; }, TypeError);
  const reordered = Object.fromEntries(Object.entries(settings.createAppMemorySettings()).reverse());
  assert.equal(settings.previewMemorySettings(reordered, settings.createRoomMemorySettings('Authored')).revision, initial.revision);
});

test('prompt inputs reject hidden authority/config fields and accessor values without executing getters', () => {
  const defaults = structuredClone(settings.createAppMemorySettings());
  for (const role of ['observer', 'reflector', 'recall']) {
    for (const value of [{ mode: 'replace', text: 'Override native base' }, { mode: 'append', text: null },
      { mode: 'append', text: '', model: 'other' }, { mode: 'native-default', text: '' }]) {
      assert.throws(() => prompts.readMemoryPromptSelections({ ...defaults.prompts, [role]: value }), /MEMORY_PROMPT_INVALID/);
    }
  }
  assert.throws(() => settings.readAppMemorySettings({ ...defaults, actorId: 'forged' }), /MEMORY_SETTINGS_INVALID/);
  let reads = 0;
  const accessor = { mode: 'append' };
  Object.defineProperty(accessor, 'text', { enumerable: true, get() { reads++; return 'Hidden'; } });
  assert.throws(() => prompts.readMemoryPromptSelections({ ...defaults.prompts, observer: accessor }), /MEMORY_PROMPT_INVALID/);
  assert.equal(reads, 0);
  const inherited = Object.assign(Object.create({ toJSON() { throw new Error('must not execute'); } }), defaults.prompts);
  assert.throws(() => prompts.readMemoryPromptSelections(inherited), /MEMORY_PROMPT_INVALID/);
});
