import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { designSha, git } from '../q4-008/fixture.mjs';
import { openFixture } from '../q4-009/fixture.mjs';
import { openRuntime, readEvent, bindingEvent } from './instrumentation.mjs';
import { arms, digest, loadVoices, sha } from './voices.mjs';
import { matchingModelInput, normalizations } from './comparison.mjs';

const [appPath, designPath, dsn, original, ara, quellightArchive, araArchive, privatePath, summaryPath] = process.argv.slice(2);
assert.ok(summaryPath && process.argv.length === 11,
  'Usage: node capture.mjs APP DESIGN FIXTURE_DSN ORIGINAL ARA QUELLIGHT_ZIP ARA_ZIP PRIVATE_DIR SUMMARY');
const app = resolve(appPath), privateDir = resolve(privatePath), summary = resolve(summaryPath);
assert.ok(!privateDir.replaceAll('\\', '/').toLowerCase().includes('/review/'), 'Use a private path outside the Git checkout');
assert.equal(git(resolve(designPath), 'rev-parse', 'HEAD').toString().trim(), designSha);
const scenarioFile = await readFile(new URL('scenarios.json', import.meta.url));
const scenarios = JSON.parse(scenarioFile);
const modeOrder = ['empty', 'approved'];
const executionOrder = { empty: ['current', 'legacy', 'eight'], approved: ['eight', 'current', 'legacy'] };
const filler = 'Deterministic transport fixture reply.';
const deskBody = 'Label packet. The current draft contains eight labels. Confirm dates, object names and readability.';
const route = 'https://api.z.ai/api/coding/paas/v4';
const modelId = 'zai-coding-plan/glm-5.3-flash';
const product = 'quellight_product_v1';

await mkdir(privateDir, { recursive: true });
const { voices, pins } = await loadVoices({ app, original, ara, quellightArchive, araArchive, privateDir });
await writeFile(join(privateDir, 'assembled-voices.private.json'), JSON.stringify(voices, null, 2) + '\n', { mode: 0o600 });
const fixture = await openFixture(app, dsn, privateDir);
const models = {};
const rows = [];
const usedThreads = new Set();
let approval, unoverlaid;
const occurrences = (haystack, needle) => haystack.split(needle).length - 1;

function parseFirst(prompt) {
  assert.equal(prompt[0]?.role, 'system');
  assert.equal(typeof prompt[0].content, 'string');
  return prompt[0].content;
}

async function turn(rt, story, thread, input, reply, arm, mode, caseId, step) {
  const { createConversationService } = await rt.load('conversation/service');
  const calls = [], reads = [], bindings = [], profiles = [];
  const base = fixture.adapter.createDeterministicOfflineModel({ script: {} });
  const capture = (config, method) => {
    const { abortSignal, ...options } = config;
    calls.push({ method, options: JSON.parse(JSON.stringify(options)) });
  };
  const model = {
    ...base, modelId,
    async doGenerate(config) {
      capture(config, 'generate');
      const result = await base.doGenerate(config);
      return { ...result, content: [{ type: 'text', text: reply }] };
    },
    async doStream(config) {
      capture(config, 'stream');
      const stream = new ReadableStream({ start(controller) {
        for (const event of [
          { type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'fixture' },
          { type: 'text-delta', id: 'fixture', delta: reply }, { type: 'text-end', id: 'fixture' },
          { type: 'finish', finishReason: 'stop', usage: { inputTokens: 12, outputTokens: 21, totalTokens: 33 } },
        ]) controller.enqueue(event);
        controller.close();
      } });
      return { stream };
    },
  };
  const service = createConversationService({ openDatabase: () => fixture.open(),
    readCredential: async () => 'fixture-unused', modelFactory: profile => { profiles.push(profile); return model; } });
  globalThis[readEvent] = event => reads.push(event);
  globalThis[bindingEvent] = binding => bindings.push(binding);
  let started;
  try {
    started = await service.start(story.owner, thread, { input, idempotencyKey: randomUUID() });
    await started.completion;
  } finally {
    delete globalThis[readEvent];
    delete globalThis[bindingEvent];
  }
  const view = await service.events(story.owner, started.turnId, 0);
  assert.ok(view.turn.status === 'completed' && view.turn.projectionSettled, caseId + ' did not settle');
  assert.ok(view.assistantMessage.text === reply, caseId + ' fixture transport mismatch');
  assert.equal(calls.length, 1);
  assert.equal(profiles.length, 2);
  assert.ok(profiles.every(profile => profile.routerModel === modelId));
  assert.equal(bindings.length, 1);
  assert.equal(reads.length, 1);
  const [{ method, options }] = calls;
  const [binding] = bindings;
  const [read] = reads;
  assert.deepEqual(binding.generation, {});
  assert.equal(binding.turnPolicy.mode, 'until-completion-or-cancel');
  assert.equal(binding.memoryPolicy.lastMessages, false);
  assert.equal(binding.memoryPolicy.workingMemory.enabled, false);
  assert.equal(binding.memoryPolicy.semanticRecall, false);
  assert.ok(binding.memoryPolicy.managedContext?.revision);
  assert.equal(binding.modelProfile.routerModel, modelId);
  const { prompt, ...modelOptions } = options;
  const first = parseFirst(prompt), voice = voices[arm];
  assert.ok(first.startsWith(voice + '\n'), 'Wrong voice position');
  assert.equal(prompt.reduce((count, message) => count + occurrences(JSON.stringify(message), JSON.stringify(voice).slice(1, -1)), 0),
    1, 'Voice must appear exactly once across the SDK prompt');
  for (const other of arms.filter(name => name !== arm)) {
    assert.ok(!first.includes(voices[other]), 'Unexpected second voice');
  }
  assert.ok(first.includes('<response-guidance>' + scenarios.preserveResponseGuidance + '</response-guidance>'), 'Response guidance missing');
  const marker = '<approved-room-state revision="r1">';
  const hasRoom = mode === 'approved';
  assert.equal(occurrences(first, marker), Number(hasRoom), 'Room state multiplicity');
  const deskOffset = first.indexOf('<desk-context>');
  assert.ok(deskOffset >= 0 && first.includes(deskBody), 'Carried Desk note missing');
  if (hasRoom) {
    assert.ok(first.includes(approval.block) && first.indexOf(marker) < deskOffset, 'Q4-009 placement mismatch');
    assert.ok(read.revision === approval.revision && read.sourceId === approval.sourceId &&
      approval.sourceThread !== thread && read.authority === approval.authority, 'Q4-009 source scope mismatch');
  } else {
    assert.equal(read.revision, null);
    assert.equal(read.sourceId, null);
  }
  assert.equal(read.actorId, story.owner.actorId);
  assert.equal(read.roomId, story.roomId);
  assert.equal(read.conversationId, thread);
  const admitted = await fixture.one('SELECT activation_version,memory_authority_revision,memory_configuration,desk_binding ' +
    'FROM ' + product + '.conversation_turns WHERE turn_id=$1 AND actor_id=$2', [started.turnId, story.owner.actorId]);
  assert.ok(admitted);
  assert.equal(admitted.memory_authority_revision, read.authority);
  assert.equal(admitted.desk_binding.roomId, story.roomId);
  const desk = await fixture.one('SELECT selection_digest,selection FROM ' + product +
    '.desk_contexts WHERE actor_id=$1 AND turn_id=$2', [story.owner.actorId, started.turnId]);
  assert.ok(desk?.selection?.items.some(item => item.body === deskBody && item.attention === 'carried'));
  const { record, actor } = await fixture.withStores(async stores => ({
    record: await stores.governance.getAgentActivation(admitted.activation_version),
    actor: await stores.actors.get(story.owner.actorId),
  }));
  assert.equal(record.activationVersion, admitted.activation_version);
  assert.equal(record.agentId, 'quellight.conversation');
  const instructions = record.artifacts.filter(value => value.kind === 'instructions');
  assert.equal(instructions.length, 1);
  assert.equal(instructions[0].revision, digest({ id: instructions[0].id, text: first }), 'Actual SDK system text differs from persisted instructions');
  assert.equal(record.activationVersion, 'v1_' + sha(record.canonicalManifest));
  const native = prompt.slice(1);
  assert.ok(mode === 'seed' || native.some(message => message.role === 'system' && JSON.stringify(message).includes(scenarios.ordinaryMemory)),
    'Ordinary native Working Memory did not reach the model');
  assert.ok(native.some(message => message.role === 'user' && JSON.stringify(message).includes(input)), 'User message missing');
  const exceptVoice = first.slice(voice.length);
  const exceptRoom = approval && hasRoom ? exceptVoice.replace('\n\n' + approval.block, '') : exceptVoice;
  const memory = admitted.memory_configuration;
  const recall = 'recall';
  const capabilities = binding.capabilities.map(({ revision, ...capability }) =>
    capability.id === recall ? capability : { ...capability, revision });
  const recallBinding = binding.capabilities.find(cap => cap.id === recall);
  assert.ok(recallBinding, 'Expected source recall capability missing: ' + binding.capabilities.map(cap => cap.id).join(','));
  const common = {
    operatingAndContext: sha(exceptVoice), operatingWithoutRoom: sha(exceptRoom),
    ...matchingModelInput(native, modelOptions, thread, recallBinding.revision), nativeMemoryPolicy: digest(binding.memoryPolicy),
    effectiveSettings: memory.revision, promptSelections: digest(memory.prompts),
    nativeAuthority: admitted.memory_authority_revision, desk: desk.selection_digest,
    capabilityEnvelope: digest(capabilities), permissions: digest([actor.actorId, actor.roles, actor.status, binding.grants]),
    quietWriteApprovals: digest(binding.quietWriteApprovals),
    configuredModel: digest([profiles, binding.modelProfile, binding.generation, binding.turnPolicy]),
    toolNames: (modelOptions.tools ?? []).map(tool => tool.name),
  };
  const publicRow = { mode, arm, caseId, step, method, voiceOccurrences: 1, voiceSha256: sha(voice),
    instructionsSha256: sha(first), instructionsRevision: instructions[0].revision, activationVersion: record.activationVersion,
    workingMemoryOccurrences: occurrences(JSON.stringify(native), scenarios.ordinaryMemory),
    recallRevision: recallBinding.revision, rawOrdinaryMessagesSha256: digest(native), rawOptionsSha256: digest(modelOptions), roomReads: reads.length, approvedRoomOccurrences: Number(hasRoom), common };
  return { publicRow, prompt, modelOptions, binding, record, read, admitted, desk, profiles, actor,
    thread, turnId: started.turnId, user: input, assistant: reply };
}

async function setup() {
  const rt = await openRuntime(app, privateDir, 'setup', voices.current, voices.current);
  try {
    const story = await fixture.createStory('Audition fixture');
    const purpose = 'Prepare fictional exhibit labels for curator review.';
    const { createRoomMemorySettings } = await rt.load('memory/settings');
    const { executeMemorySettingsAction } = await rt.load('memory/settings-actions');
    const settings = structuredClone(createRoomMemorySettings(purpose));
    settings.configuration.overrides.responseGuidance = { mode: 'override', value: scenarios.preserveResponseGuidance };
    const saved = await fixture.withStores(stores => executeMemorySettingsAction(stores, story.owner, 'memory.settings.save',
      { target: 'room', roomId: story.roomId, expectedRevision: 0, content: JSON.stringify(settings) }, randomUUID()));
    assert.equal(saved.ok, true);
    const { executeDeskAction } = await rt.load('desk/domain');
    const desk = await fixture.withStores(stores => executeDeskAction(stores, story.owner, 'desk.create',
      { roomId: story.roomId, title: 'Label review checklist', body: deskBody, kind: 'note', status: 'active', attention: 'carried' }, randomUUID()));
    assert.equal(desk.ok, true);
    const seeded = await turn(rt, story, story.evidenceThread, scenarios.approvedSource,
      filler, 'current', 'seed', 'approval-source', 1);
    await fixture.care(rt, story, story.evidenceThread, 'memory.correct', { workingMemory: scenarios.ordinaryMemory });
    const page = await fixture.sourcePage(rt, story, story.evidenceThread);
    const eligible = page.sources.filter(source => !source.excluded && source.role === 'user');
    assert.equal(eligible.length, 1);
    return { story, seed: seeded, source: eligible[0] };
  } finally { await rt.close(); }
}

async function freshThread(story, tag) {
  const id = randomUUID();
  assert.ok(!usedThreads.has(id));
  usedThreads.add(id);
  const result = await fixture.one('INSERT INTO ' + product +
    '.conversations(id,actor_id,room_id,thread_id,title) VALUES($1,$2,$3,$4,$5) RETURNING id',
    [id, story.owner.actorId, story.roomId, 'vict-conv-' + id, tag]);
  assert.equal(result.id, id);
  return id;
}

try {
  await fixture.provision();
  const { story, seed, source } = await setup();
  const originalRuntime = await fixture.runtime('control');
  const anchorInput = scenarios.order[0].turns[0].input;
  try {
    // The unmodified application is a control for the empty Q4-009 fallback.
    const { createConversationService } = await originalRuntime.load('conversation/service');
    const base = fixture.adapter.createDeterministicOfflineModel({ script: {} });
    const prompts = [];
    const service = createConversationService({ openDatabase: () => fixture.open(), readCredential: async () => 'fixture-unused',
      modelFactory: () => ({ ...base, modelId, doStream(options) { prompts.push(options.prompt); return base.doStream(options); },
        doGenerate(options) { prompts.push(options.prompt); return base.doGenerate(options); } }) });
    const thread = await freshThread(story, 'Original, no fixture transforms');
    const entry = await service.start(story.owner, thread, { input: anchorInput, idempotencyKey: randomUUID() });
    await entry.completion;
    const view = await service.events(story.owner, entry.turnId, 0);
    assert.ok(view.turn.status === 'completed' && view.turn.projectionSettled);
    assert.equal(prompts.length, 1);
    unoverlaid = parseFirst(prompts[0]);
  } finally { await originalRuntime.close(); }

  for (const mode of modeOrder) {
    if (mode === 'approved') {
      const rt = await openRuntime(app, privateDir, 'approval', voices.current, voices.current);
      try { approval = await fixture.approve(rt, story, story.evidenceThread, 'r1', scenarios.approvedRoom, source.id); }
      finally { await rt.close(); }
    }
    for (const arm of executionOrder[mode]) {
      const rt = await openRuntime(app, privateDir, mode + '-' + arm, voices.current, voices[arm]);
      try {
        for (const scenario of scenarios.order) {
          const thread = await freshThread(story, 'Synthetic ' + scenario.id);
          for (const [index, step] of scenario.turns.entries()) {
            const row = await turn(rt, story, thread, step.input, step.fixedReply ?? filler, arm, mode, scenario.id, index + 1);
            if (index > 0) {
              const earlier = scenario.turns[index - 1];
              const prior = JSON.stringify(row.prompt.slice(1));
              assert.ok(prior.includes(earlier.input) && prior.includes(earlier.fixedReply), 'Matched correction history missing');
            }
            rows.push(row);
          }
        }
        models[mode + '-' + arm] = rt.edits();
        assert.deepEqual(models[mode + '-' + arm],
          { room: ['activation', 'service'], audition: arm === 'current' ? ['witness'] : ['voice', 'witness'] });
        console.log('Captured ' + mode + ' ' + arm + ': ' + scenarios.order.reduce((n, scenario) => n + scenario.turns.length, 0));
      } finally { await rt.close(); }
    }
  }
  await writeFile(join(privateDir, 'installed-capture.private.json'), JSON.stringify({
    sourcePins: pins, story, approval, seed, source, unoverlaid, captures: rows,
  }, null, 2) + '\n', { mode: 0o600 });
  const grouped = [];
  for (const scenario of scenarios.order) {
    for (let step = 1; step <= scenario.turns.length; step++) {
      const cells = modeOrder.map(mode => {
        const matched = rows.filter(row => row.publicRow.mode === mode && row.publicRow.caseId === scenario.id && row.publicRow.step === step);
        assert.equal(matched.length, 3);
        assert.equal(new Set(matched.map(row => row.thread)).size, 3);
        assert.equal(new Set(matched.map(row => row.record.activationVersion)).size, 3);
        for (const other of matched.slice(1)) assert.deepEqual(other.publicRow.common, matched[0].publicRow.common);
        return matched;
      });
      const safeRoomDelta = structuredClone(cells[1][0].publicRow.common);
      safeRoomDelta.operatingAndContext = safeRoomDelta.operatingWithoutRoom;
      assert.deepEqual(safeRoomDelta, cells[0][0].publicRow.common);
      grouped.push({ caseId: scenario.id, step, matchedWithinBothRooms: true, onlyRoomDeltaAcrossModes: true,
        matchingDigest: digest(cells.map(cell => cell[0].publicRow.common)) });
    }
  }
  const matchedAnchor = rows.find(row => row.publicRow.mode === 'empty' && row.publicRow.arm === 'current');
  assert.ok(unoverlaid === parseFirst(matchedAnchor.prompt), 'Unmodified control differs from empty-overlay control');
  const publicCapture = {
    schema: 'quellight.q4-011.capture@1', status: 'passed', boundary: 'installed-language-model-v2-deterministic',
    pinned: { ...fixture.identity, design: designSha, postgres: fixture.postgres, node: process.version },
    sourcePins: pins, scenarioSha256: sha(scenarioFile), route, modelId, liveProviderRequests: 0, executionOrder, models, normalizations,
    unmodifiedControlInstructionsSha256: sha(unoverlaid), approvedRoomBlockSha256: sha(approval.block),
    counts: { cases: scenarios.order.length, matchedTurnTriplets: grouped.length * 2, admittedStudyTurns: rows.length,
      replayPrefixTurns: modeOrder.length * arms.length, scriptedFixtureSetupTurns: 2 },
    grouped, rows: rows.map(row => row.publicRow),
  };
  await writeFile(summary, JSON.stringify(publicCapture, null, 2) + '\n');
  console.log(JSON.stringify(publicCapture.counts));
} finally {
  await fixture.close();
}
