import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const app = process.cwd();
const use = createRequire(join(app, 'package.json'));
const { createServer } = await import(pathToFileURL(use.resolve('vite')).href);
const fixture = await createServer({ root: app, configFile: false, cacheDir: join(app,'.local','q4014-activation-check'),
  logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true } });
const digest = b => createHash('sha256').update(b).digest('hex');
const identityPin = '23adc723ab5a8d25dcc1371e2a70df248c4f6db1eb9c141df58f5c2ca8b77254';
try {
  const { conversationActivation } = await fixture.ssrLoadModule('/src/lib/server/conversation/activation.ts');
  const { createAppMemorySettings, createRoomMemorySettings, previewMemorySettings } =
    await fixture.ssrLoadModule('/src/lib/server/memory/settings.ts');
  const { selectedConversationIdentity } = await fixture.ssrLoadModule('/src/lib/server/prompts/persona-source.mjs');
  const voice = selectedConversationIdentity();
  assert.equal(Buffer.byteLength(voice), 30489);
  assert.equal(digest(voice), identityPin);
  const purpose = 'Fixture room purpose';
  const appSettings = createAppMemorySettings();
  const roomId = 'e33b5b56-f19a-4627-bb46-9245931aae57';
  const effective = previewMemorySettings(appSettings, createRoomMemorySettings(purpose));
  const roomGuidance = {revision: 2, block: '<room-guidance>\nIntent: The owner approves the draft.\n</room-guidance>'};
  const bindings = { effective, roomGuidance, memory: {id:'quellight.memory.native', revision:'native-pin'},
    recall:{id:'recall',revision:'recalled'}, desk:{selection:{ text:'{}', roomId, digest:'desk-pin' },capabilities:[]} };
  const treated = conversationActivation(purpose, bindings);
  const controlled = conversationActivation(purpose, {...bindings, roomGuidance:null});
  const prompt = plan => plan.activation.instructions.artifact.text;
  const delivered = prompt(treated);
  const baseline = prompt(controlled);
  assert.ok(delivered.startsWith(voice + '\n'));
  assert.equal(delivered.split(voice).length, 2);
  assert.equal(delivered.split(roomGuidance.block).length, 2);
  assert.ok(delivered.indexOf('<response-guidance>') < delivered.indexOf(roomGuidance.block));
  assert.ok(delivered.indexOf(roomGuidance.block) < delivered.indexOf('<desk-context>'));
  assert.equal(delivered.replace('\n\n' + roomGuidance.block, ''), baseline);
  assert.notEqual(treated.activation.activationVersion, controlled.activation.activationVersion);
  const override = 'Owner operating override, literal $1 and brace text.';
  const custom = previewMemorySettings({...appSettings, prompts: {...appSettings.prompts,
    conversation:{mode:'replace',text:override} }}, createRoomMemorySettings(purpose));
  assert.ok(prompt(conversationActivation(purpose, {...bindings,effective:custom})).startsWith(voice+'\n\n'+override));
  console.log(JSON.stringify({ voiceSha256: identityPin, voiceBytes: 30489, blockDeltaBytes: Buffer.byteLength(delivered)-Buffer.byteLength(baseline),
    placement: 'one block after response guidance and before Desk', equivalentControl: true, retainsCustomInstructions: true }));
} finally { await fixture.close(); }
