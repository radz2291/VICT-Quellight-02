import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

let server;
let memory;
before(async () => {
  server = await createServer({ configFile: false, logLevel: 'error',
    server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  memory = await server.ssrLoadModule('/src/lib/server/memory/configuration.ts');
});
after(async () => { await server?.close(); });

test('Home and other rooms inherit the same defaults while keeping literal authored purpose', () => {
  const purpose = 'Keep {{purpose}} and $& literal; do not replace my intent.';
  for (const room of [memory.createRoomMemoryConfiguration(), memory.createRoomMemoryConfiguration(purpose)]) {
    const resolved = memory.resolveMemoryConfiguration(memory.DEFAULT_MEMORY_CONFIGURATION, room);
    assert.deepEqual(resolved.values, { responseGuidance: '', automaticLearning: true, personalPreferences: true, recallScope: 'current-room' });
    assert.deepEqual(resolved.sources, { responseGuidance: 'app', automaticLearning: 'app', personalPreferences: 'app', recallScope: 'app' });
    assert.equal(resolved.purpose, room.purpose);
    assert.ok(Object.values(room.overrides).every(field => field.mode === 'inherit'));
  }
  assert.equal(memory.createRoomMemoryConfiguration(purpose).purpose, purpose);
});

test('intentional empty guidance stays empty when app defaults change; inherited guidance follows', () => {
  const inherited = memory.createRoomMemoryConfiguration('My own purpose');
  const empty = memory.setRoomMemoryOverride(inherited, 'responseGuidance', { mode: 'override', value: '' });
  for (const responseGuidance of ['Use brief answers.', 'Explain the steps.']) {
    const defaults = { ...memory.DEFAULT_MEMORY_CONFIGURATION, responseGuidance };
    assert.equal(memory.resolveMemoryConfiguration(defaults, inherited).values.responseGuidance, responseGuidance);
    const resolved = memory.resolveMemoryConfiguration(defaults, empty);
    assert.equal(resolved.values.responseGuidance, '');
    assert.equal(resolved.sources.responseGuidance, 'room');
  }
});

test('default updates preserve explicit false and recall overrides; resetting only one field resumes inheritance', () => {
  let room = memory.createRoomMemoryConfiguration('Project purpose');
  room = memory.setRoomMemoryOverride(room, 'automaticLearning', { mode: 'override', value: false });
  room = memory.setRoomMemoryOverride(room, 'recallScope', { mode: 'override', value: 'same-owner' });
  const saved = JSON.stringify(room);
  const changed = { ...memory.DEFAULT_MEMORY_CONFIGURATION, responseGuidance: 'Be concise.', personalPreferences: false };
  const resolved = memory.resolveMemoryConfiguration(changed, room);
  assert.equal(resolved.values.automaticLearning, false);
  assert.equal(resolved.values.recallScope, 'same-owner');
  assert.equal(resolved.values.personalPreferences, false);
  assert.equal(resolved.values.responseGuidance, 'Be concise.');
  const reset = memory.resetRoomMemoryOverride(room, 'recallScope');
  assert.deepEqual(reset.overrides.recallScope, { mode: 'inherit' });
  assert.equal(memory.resolveMemoryConfiguration(changed, reset).values.recallScope, 'current-room');
  assert.equal(reset.purpose, 'Project purpose');
  assert.deepEqual(reset.overrides.automaticLearning, { mode: 'override', value: false });
  assert.equal(JSON.stringify(room), saved);
});

test('effective content revisions are stable across key order and revert while source revisions preserve overrides', () => {
  const defaults = memory.DEFAULT_MEMORY_CONFIGURATION;
  const room = memory.createRoomMemoryConfiguration('Purpose');
  const original = memory.resolveMemoryConfiguration(defaults, room);
  const reordered = Object.fromEntries(Object.entries(defaults).reverse());
  assert.deepEqual(memory.resolveMemoryConfiguration(reordered, room), original);
  const explicit = memory.setRoomMemoryOverride(room, 'recallScope', { mode: 'override', value: 'current-room' });
  const sameContent = memory.resolveMemoryConfiguration(defaults, explicit);
  assert.equal(sameContent.revision, original.revision);
  assert.notEqual(sameContent.roomRevision, original.roomRevision);
  const broader = memory.setRoomMemoryOverride(room, 'recallScope', { mode: 'override', value: 'same-owner' });
  assert.notEqual(memory.resolveMemoryConfiguration(defaults, broader).revision, original.revision);
  assert.notEqual(memory.resolveMemoryConfiguration(defaults, memory.createRoomMemoryConfiguration('Changed purpose')).revision, original.revision);
  assert.deepEqual(memory.resolveMemoryConfiguration(defaults, memory.resetRoomMemoryOverride(broader, 'recallScope')), original);
});

test('resolved snapshots and saved room overrides are defensive immutable copies', () => {
  const defaults = { ...memory.DEFAULT_MEMORY_CONFIGURATION, responseGuidance: 'Original' };
  const input = structuredClone(memory.createRoomMemoryConfiguration('Authored'));
  input.overrides.personalPreferences = { mode: 'override', value: false };
  const stored = memory.readRoomMemoryConfiguration(input);
  const resolved = memory.resolveMemoryConfiguration(defaults, input);
  const snapshot = JSON.stringify(resolved);
  defaults.responseGuidance = 'Edited';
  input.purpose = 'Overwritten';
  input.overrides.personalPreferences.value = true;
  assert.equal(JSON.stringify(resolved), snapshot);
  assert.equal(stored.purpose, 'Authored');
  assert.equal(stored.overrides.personalPreferences.value, false);
  assert.throws(() => { resolved.values.recallScope = 'same-owner'; }, TypeError);
  assert.throws(() => { stored.overrides.personalPreferences.value = true; }, TypeError);
  assert.throws(() => { resolved.sources.recallScope = 'room'; }, TypeError);
});

test('malformed configuration and hidden/unknown fields fail closed without running accessors', () => {
  const invalid = /MEMORY_CONFIGURATION_INVALID/;
  const defaults = memory.DEFAULT_MEMORY_CONFIGURATION;
  const room = memory.createRoomMemoryConfiguration();
  for (const value of [null, [], {}, { ...defaults, ownerId: 'another-owner' },
    { ...defaults, automaticLearning: 'false' }, { ...defaults, recallScope: 'everyone' },
    { ...defaults, responseGuidance: null }, { ...defaults, personalPreferences: 0 }]) {
    assert.throws(() => memory.readMemoryDefaults(value), invalid);
  }
  for (const value of [{ ...room, learnedPurpose: 'Inferred' }, { ...room, purpose: null },
    { ...room, overrides: {} }, { ...room, overrides: { ...room.overrides, model: 'another-model' } }]) {
    assert.throws(() => memory.readRoomMemoryConfiguration(value), invalid);
  }
  for (const value of [{ mode: 'inherit', value: '' }, { mode: 'override' },
    { mode: 'override', value: '', model: 'other' }, { mode: 'override', value: false }, { mode: 'unknown' }]) {
    assert.throws(() => memory.setRoomMemoryOverride(room, 'responseGuidance', value), invalid);
  }
  assert.throws(() => memory.resetRoomMemoryOverride(room, 'purpose'), invalid);
  let accessed = false;
  const getter = { ...defaults };
  Object.defineProperty(getter, 'responseGuidance', { enumerable: true, get() { accessed = true; return 'Hidden'; } });
  assert.throws(() => memory.readMemoryDefaults(getter), invalid);
  assert.equal(accessed, false);
  const hidden = { ...defaults };
  Object.defineProperty(hidden, 'hidden', { value: true });
  assert.throws(() => memory.readMemoryDefaults(hidden), invalid);
  assert.throws(() => memory.readMemoryDefaults(Object.assign(Object.create({ extra: true }), defaults)), invalid);
});
