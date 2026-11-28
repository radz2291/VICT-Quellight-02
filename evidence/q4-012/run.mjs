import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { designSha, git } from '../q4-008/fixture.mjs';
import { openFixture } from '../q4-009/fixture.mjs';
import { openRuntime, readEvent, bindingEvent } from '../q4-011/instrumentation.mjs';
import { matchingModelInput, normalizations } from '../q4-011/comparison.mjs';
import { arms, digest, sha } from '../q4-011/voices.mjs';
import { credential, endpoint, routerId, wireModel, watchModel, withWireCapture } from './provider.mjs';
import { isolatedDatabase } from './isolation.mjs';

const [mode, appArg, design, dsn, priorCapture, priorReader, outArg, summary, pgBin, keyFile, code] = process.argv.slice(2);
assert.ok(['live', 'mock', 'resume', 'continue'].includes(mode) && appArg && design && dsn && priorCapture &&
  priorReader && outArg && summary && pgBin && (mode === 'mock' || keyFile),
  'Usage: node run.mjs live|mock|resume|continue APP DESIGN DSN PRIOR_CAPTURE PRIOR_READER PRIVATE_DIR PUBLIC_SUMMARY PG_BIN [KEY_FILE] [OPAQUE_CODE]');
const app = resolve(appArg), out = resolve(outArg);
assert.ok(!out.replaceAll('\\', '/').toLowerCase().includes('/review/'));
assert.match(new URL(dsn).pathname, /^\/q4_009_[a-z][a-z0-9]*$/);
assert.equal(git(resolve(design), 'rev-parse', 'HEAD').toString().trim(), designSha);

const readJson = async source => JSON.parse(await readFile(source, 'utf8'));
const writeJson = (file, value, flags = {}) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, ...flags });
const voices = await readJson(join(priorCapture, 'assembled-voices.private.json'));
const previous = await readJson(new URL('../q4-011/capture.json', import.meta.url));
const scenarioBytes = await readFile(new URL('../q4-011/scenarios.json', import.meta.url));
const plan = JSON.parse(scenarioBytes);
const groups = await readJson(new URL('../q4-011/blind-order.json', import.meta.url));
const key = await readJson(join(priorReader, 'reveal-key.private.json'));
assert.equal(sha(scenarioBytes), groups.scenarioSha256);
assert.equal(digest(key), groups.keyCommitment);
for (const arm of arms) assert.equal(sha(voices[arm]), previous.sourcePins.voices[arm].sha256);
const apiKey = mode === 'mock' ? 'local-mock-fixture' : await credential(keyFile);
const requireApp = createRequire(join(app, 'package.json'));
const { ModelRouterLanguageModel } = await import(pathToFileURL(requireApp.resolve('@mastra/core/llm')).href);
const product = 'quellight_product_v1';
const roomPasses = ['empty', 'approved'];
const deskText = 'Label packet. The current draft contains eight labels. Confirm dates, object names and readability.';

await mkdir(out, { recursive: true });
const { Client } = requireApp('pg');
const database = isolatedDatabase(Client, dsn, pgBin);
let fixture;
let identity;
const useFixture = (archive, task, save) => database.use(archive, async () => {
  fixture = await openFixture(app, dsn, out);
  identity ??= fixture.identity;
  try { return await task(); } finally { await fixture.close(); fixture = undefined; }
}, save);
const runtimes = new Map();
let approved;
let lockedWireSettings;
async function runtime(arm) {
  if (!runtimes.has(arm)) {
    const rt = await openRuntime(app, out, arm, voices.current, voices[arm]);
    runtimes.set(arm, rt);
    const { MODEL, PROVIDER_URL, CREDENTIAL } = await rt.load('conversation/activation');
    assert.equal(MODEL, routerId);
    assert.equal(PROVIDER_URL, endpoint);
    assert.equal(CREDENTIAL, 'ZHIPU_API_KEY');
  }
  return runtimes.get(arm);
}
async function freshThread(story, title) {
  const id = randomUUID();
  const saved = await fixture.one('INSERT INTO ' + product +
    '.conversations(id,actor_id,room_id,thread_id,title) VALUES($1,$2,$3,$4,$5) RETURNING id',
    [id, story.owner.actorId, story.roomId, 'vict-conv-' + id, title]);
  assert.equal(saved.id, id);
  return id;
}

function scripted(response) {
  return { specificationVersion: 'v2', provider: 'q4-012-fixture', modelId: routerId, supportedUrls: {},
    async doGenerate() { throw new Error('Unexpected generate for scripted turn'); },
    async doStream() {
      return { stream: new ReadableStream({ start(controller) {
        for (const event of [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'fixture' },
          { type: 'text-delta', id: 'fixture', delta: response }, { type: 'text-end', id: 'fixture' },
          { type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }])
          controller.enqueue(event);
        controller.close();
      } }) };
    },
  };
}

async function takeTurn(story, thread, arm, input, fixtureReply, beforeWire) {
  const rt = await runtime(arm);
  const { createConversationService } = await rt.load('conversation/service');
  const capture = { steps: [], wire: [], reads: [], bindings: [], profiles: [], status: 'unsettled' };
  const service = createConversationService({ openDatabase: () => fixture.open(),
    readCredential: async () => fixtureReply ? 'unused-fixture' : apiKey,
    modelFactory: profile => {
      assert.equal(profile.routerModel, routerId);
      capture.profiles.push(profile);
      return fixtureReply ? scripted(fixtureReply) :
        watchModel(new ModelRouterLanguageModel({ id: profile.routerModel, url: endpoint, apiKey }), capture);
    } });
  globalThis[readEvent] = event => capture.reads.push(event);
  globalThis[bindingEvent] = binding => capture.bindings.push(binding);
  const execute = async () => {
    let entry;
    try {
      entry = await service.start(story.owner, thread, { input, idempotencyKey: randomUUID() });
      capture.turnId = entry.turnId;
      await entry.completion;
      let cursor = 0;
      let view;
      do {
        view = await service.events(story.owner, entry.turnId, cursor);
        if (!view.turn.projectionSettled && view.nextCursor === cursor) await delay(250);
        cursor = view.nextCursor;
      } while (!view.turn.projectionSettled);
      capture.status = view.turn.status;
      capture.projectionSettled = view.turn.projectionSettled;
      capture.reply = view.assistantMessage?.text ?? '';
      if (view.turn.errorCode && /^[A-Z0-9_]{1,90}$/.test(view.turn.errorCode)) capture.errorCode = view.turn.errorCode;
    } catch (error) {
      capture.status = 'runner-error';
      capture.errorClass = error instanceof Error ? error.constructor.name : 'Unknown';
    }
  };
  try {
    // The first SDK call is verified before the actual fetch leaves the machine.
    if (fixtureReply) await execute();
    else await withWireCapture(capture.wire, mode, async () => {
      capture.beforeWire = () => beforeWire?.(capture);
      await execute();
    }, () => capture.beforeWire?.());
  } finally {
    delete globalThis[readEvent];
    delete globalThis[bindingEvent];
    delete capture.beforeWire;
  }
  return capture;
}

async function bootstrap() {
  await fixture.provision();
  const rt = await runtime('current');
  const story = await fixture.createStory('Live identity audition');
  const { createRoomMemorySettings } = await rt.load('memory/settings');
  const { executeMemorySettingsAction } = await rt.load('memory/settings-actions');
  const settings = structuredClone(createRoomMemorySettings('Prepare fictional exhibit labels for curator review.'));
  settings.configuration.overrides.responseGuidance = { mode: 'override', value: plan.preserveResponseGuidance };
  const saved = await fixture.withStores(stores => executeMemorySettingsAction(stores, story.owner, 'memory.settings.save',
    { target: 'room', roomId: story.roomId, expectedRevision: 0, content: JSON.stringify(settings) }, randomUUID()));
  assert.equal(saved.ok, true);
  const { executeDeskAction } = await rt.load('desk/domain');
  const desk = await fixture.withStores(stores => executeDeskAction(stores, story.owner, 'desk.create',
    { roomId: story.roomId, title: 'Label review checklist', body: deskText, kind: 'note', status: 'active', attention: 'carried' }, randomUUID()));
  assert.equal(desk.ok, true);
  const seedReply = 'Deterministic transport fixture reply.';
  const seed = await takeTurn(story, story.evidenceThread, 'current', plan.approvedSource, seedReply);
  assert.ok(seed.status === 'completed' && seed.projectionSettled && seed.reply === seedReply, 'Approval source did not settle');
  await fixture.care(rt, story, story.evidenceThread, 'memory.correct', { workingMemory: plan.ordinaryMemory });
  const source = await fixture.sourcePage(rt, story, story.evidenceThread);
  const eligible = source.sources.filter(item => !item.excluded && item.role === 'user');
  assert.equal(eligible.length, 1);
  return { story, sourceId: eligible[0].id };
}

function firstInput(capture, story, thread, arm, room, current, prefix) {
  const [{ options }] = capture.steps;
  const { prompt, ...modelOptions } = options;
  const [system, ...ordinary] = prompt;
  const voice = voices[arm];
  assert.ok(system.role === 'system' && system.content.startsWith(voice + '\n'));
  assert.equal(JSON.stringify(prompt).split(JSON.stringify(voice).slice(1, -1)).length, 2);
  for (const other of arms.filter(id => id !== arm)) assert.ok(!system.content.includes(voices[other]));
  assert.ok(system.content.includes(deskText) && system.content.includes(plan.preserveResponseGuidance));
  assert.ok(ordinary.some(message => message.role === 'system' && JSON.stringify(message).includes(plan.ordinaryMemory)));
  assert.ok(ordinary.some(message => message.role === 'user' && JSON.stringify(message).includes(current)));
  if (prefix) assert.ok(JSON.stringify(ordinary).includes(prefix.input) && JSON.stringify(ordinary).includes(prefix.fixedReply));
  const [binding] = capture.bindings, [read] = capture.reads;
  assert.equal(capture.bindings.length, 1);
  assert.equal(capture.reads.length, 1);
  assert.equal(binding.modelProfile.id, 'quellight.glm-flash');
  assert.equal(binding.modelProfile.revision, '1');
  assert.equal(binding.modelProfile.routerModel, routerId);
  assert.deepEqual(binding.generation, {});
  assert.equal(binding.turnPolicy.mode, 'until-completion-or-cancel');
  assert.equal(binding.memoryPolicy.lastMessages, false);
  assert.equal(binding.memoryPolicy.workingMemory.enabled, false);
  assert.ok(binding.memoryPolicy.managedContext?.revision);
  assert.equal(read.actorId, story.owner.actorId);
  assert.equal(read.roomId, story.roomId);
  assert.equal(read.conversationId, thread);
  const block = '<approved-room-state revision="r1">';
  assert.equal(system.content.split(block).length, room === 'approved' ? 2 : 1);
  if (room === 'approved') {
    assert.ok(read.revision === approved.revision && read.sourceId === approved.sourceId && read.authority === approved.authority);
    assert.ok(system.content.includes(approved.block) && system.content.indexOf(block) < system.content.indexOf('<desk-context>'));
  } else assert.equal(read.revision, null);
  const recall = binding.capabilities.find(item => item.id === 'recall');
  const policy = binding.capabilities.map(({ revision, ...item }) => item.id === 'recall' ? item : { ...item, revision });
  const remainingSystem = system.content.slice(voice.length).replace(approved ? '\n\n' + approved.block : '\u0000', '');
  return { instructionsSha256: sha(system.content), voiceSha256: sha(voice),
    common: { operatingAndDesk: sha(remainingSystem), ...matchingModelInput(ordinary, modelOptions, thread, recall.revision),
      tools: digest(policy), grants: digest(binding.grants), approvals: digest(binding.quietWriteApprovals),
      nativePolicy: digest(binding.memoryPolicy), nativeAuthority: read.authority,
      profile: digest([binding.modelProfile, binding.generation, binding.turnPolicy]) } };
}

async function activation(capture, story) {
  if (!capture.turnId || !capture.proof) return;
  const admitted = await fixture.one('SELECT activation_version FROM ' + product +
    '.conversation_turns WHERE turn_id=$1 AND actor_id=$2', [capture.turnId, story.owner.actorId]);
  assert.ok(admitted);
  const record = await fixture.withStores(stores => stores.governance.getAgentActivation(admitted.activation_version));
  const artifact = record.artifacts.find(item => item.kind === 'instructions');
  assert.equal(artifact.revision, digest({ id: artifact.id, text: capture.steps[0].options.prompt[0].content }));
  assert.equal(record.activationVersion, 'v1_' + sha(record.canonicalManifest));
  return { activationVersion: record.activationVersion, instructionsRevision: artifact.revision };
}

const status = {
  schema: 'quellight.q4-012.run@1', mode, result: 'started', model: wireModel, endpoint, routerId,
  design: designSha, sourcePinsSha256: digest(previous.sourcePins),
  scenariosSha256: sha(scenarioBytes), blindOrderSha256: digest(groups), normalization: normalizations,
  readingStatus: 'pending', ownerVerdict: 'pending', finished: [], expected: 42,
};
const saveStatus = () => writeJson(summary, status);
const sessionFile = join(out, 'session.private.json');
const seedArchive = join(out, 'seed.private.dump');

async function recoverSeed() {
  const { id: roomId, actor_id: actorId } = await fixture.one(`SELECT id,actor_id FROM ${product}.rooms WHERE purpose=$1`,
    ['Prepare fictional exhibit labels for curator review.']);
  const { id: evidenceThread } = await fixture.one(`SELECT id FROM ${product}.conversations WHERE room_id=$1 AND actor_id=$2 AND title=$3`,
    [roomId, actorId, 'Approved source']);
  const story = { owner: { actorId, id: actorId, email: 'cedar-cut@fixture.invalid' }, roomId, evidenceThread };
  const source = await fixture.sourcePage(await runtime('current'), story, evidenceThread);
  const eligible = source.sources.filter(item => !item.excluded && item.role === 'user');
  assert.equal(eligible.length, 1);
  return { story, sourceId: eligible[0].id };
}

function receiptPath(row) { return join(out, [row.room, row.case, row.arm].join('-') + '.private.json'); }

try {
  if (mode === 'continue') {
    const session = await readJson(sessionFile);
    assert.ok(session.complete && session.mode === 'live' && session.dsn === dsn);
    const [arm] = Object.entries(key.mapping).find(([, label]) => label === code) ?? [];
    assert.ok(arm, 'Unknown blinded code');
    process.stdin.setEncoding('utf8');
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    input = input.trim();
    assert.ok(input, 'Provide the continuation message on standard input');
    const entry = session.practical[arm];
    approved = entry.approval;
    const archive = join(out, entry.archive);
    const next = join(out, 'continuation-' + code + '-' + randomUUID() + '.private.dump');
    const capture = await useFixture(archive, async () => {
      const result = await takeTurn(session.story, entry.thread, arm, input, undefined);
      await writeJson(join(out, 'continuation-' + code + '-' + randomUUID() + '.private.json'), { code, input, capture: result });
      assert.ok(result.status === 'completed' && result.projectionSettled && result.reply.trim(), 'Continuation failed. See private receipt.');
      return result;
    }, () => next);
    entry.archive = next.split(/[\\/]/).at(-1);
    await writeJson(sessionFile, session);
    process.stdout.write(capture.reply + '\n');
  } else {
    const practical = {}, replies = [], contexts = new Map(), finished = new Set();
    let seed;
    if (mode === 'resume') {
      const session = await readJson(sessionFile);
      const checkpoint = await readJson(summary);
      assert.ok(session.mode === 'live' && session.dsn === dsn && !session.complete);
      assert.ok(checkpoint.mode === 'live' && checkpoint.result === 'incomplete' && checkpoint.expected === 42);
      for (const field of ['routerId', 'endpoint', 'sourcePinsSha256', 'scenariosSha256', 'blindOrderSha256'])
        assert.equal(checkpoint[field], status[field]);
      Object.assign(status, checkpoint, { result: 'started', finished: [], failure: undefined });
      status.repetitions ??= [];
      for (const row of checkpoint.finished) {
        if (!row.completed) {
          assert.ok(!row.requests.some(call => [401, 402, 403, 429].includes(call.status) || call.code === 1113),
            'Provider access or quota refusal must be reviewed');
          assert.ok(!status.repetitions.some(item => item.room === row.room && item.case === row.case && item.arm === row.arm),
            'One repeated attempt already recorded for this case');
          await copyFile(receiptPath(row), join(out, [row.room, row.case, row.arm].join('-') + '-initial.private.json'));
          status.repetitions.push(row);
          continue;
        }
        const saved = await readJson(receiptPath(row));
        assert.ok(saved.projectionSettled && saved.reply.trim());
        assert.deepEqual(saved.proof, row.proof);
        assert.deepEqual(saved.wire, row.requests);
        status.finished.push(row);
        const cell = row.room + '/' + row.case;
        if (contexts.has(cell)) assert.deepEqual(contexts.get(cell), row.proof.common);
        else contexts.set(cell, row.proof.common);
        finished.add(cell + '/' + row.arm);
        lockedWireSettings ??= row.requests[0].settingsDigest;
        replies.push({ room: row.room, case: row.case, arm: row.arm, text: saved.reply });
        if (row.room === 'approved' && row.case === 'practical') {
          const prior = saved.reads[0];
          const block = saved.steps[0].options.prompt[0].content.match(/<approved-room-state revision="r1">[^\n]+<\/approved-room-state>/)?.[0];
          assert.ok(block);
          practical[row.arm] = { thread: saved.thread, archive: 'practical-' + row.arm + '.private.dump',
            approval: { revision: prior.revision, sourceId: prior.sourceId, authority: prior.authority, block } };
        }
      }
      seed = await useFixture(seedArchive, recoverSeed);
      assert.deepEqual(identity, checkpoint.installed);
      for (const entry of Object.values(practical)) entry.approval.sourceThread = seed.story.evidenceThread;
    } else {
      await writeJson(sessionFile, { mode, dsn, complete: false }, { flag: 'wx' });
      await saveStatus();
      seed = await useFixture(null, bootstrap, () => seedArchive);
    }
    const { story, sourceId } = seed;
    status.installed = identity;
    await saveStatus();
    for (const room of roomPasses) {
      for (const scenario of plan.order) {
        for (const arm of arms) {
          if (finished.has(room + '/' + scenario.id + '/' + arm)) continue;
          const archiveName = 'practical-' + arm + '.private.dump';
          await useFixture(seedArchive, async () => {
            approved = room === 'approved' ? await fixture.approve(await runtime('current'), story, story.evidenceThread,
              'r1', plan.approvedRoom, sourceId) : undefined;
            const thread = await freshThread(story, scenario.id);
            const [initial] = scenario.turns, target = scenario.turns.at(-1);
            const prefix = initial === target ? undefined : initial;
            if (prefix) {
              const setup = await takeTurn(story, thread, arm, prefix.input, prefix.fixedReply);
              assert.ok(setup.status === 'completed' && setup.projectionSettled && setup.reply === prefix.fixedReply);
            }
            const cell = room + '/' + scenario.id;
            let proof;
            const capture = await takeTurn(story, thread, arm, target.input, undefined, witness => {
              if (proof) return;
              proof = firstInput(witness, story, thread, arm, room, target.input, prefix);
              const sameCell = contexts.get(cell);
              if (sameCell) assert.deepEqual(proof.common, sameCell, 'Matched non-voice SDK context changed');
              else contexts.set(cell, proof.common);
              if (room === 'approved') assert.deepEqual(proof.common, contexts.get('empty/' + scenario.id), 'Unintended room-pass delta');
            });
            capture.proof = proof;
            const row = { room, case: scenario.id, arm, state: capture.status, requests: capture.wire, steps: capture.steps.length,
              usage: capture.steps.map(step => step.usage), proof, errorCode: capture.errorCode ?? null };
            const binding = await activation(capture, story);
            if (binding) Object.assign(row, binding);
            const succeeded = Boolean(proof && capture.status === 'completed' && capture.projectionSettled &&
              capture.reply.trim() && capture.wire.some(item => item.status >= 200 && item.status < 300));
            if (succeeded) {
              const [first] = capture.wire;
              lockedWireSettings ??= first.settingsDigest;
              assert.equal(first.settingsDigest, lockedWireSettings, 'First provider generation settings changed');
            }
            status.finished.push({ ...row, completed: succeeded });
            await writeJson(join(out, [room, scenario.id, arm].join('-') + '.private.json'), { thread, ...capture });
            if (succeeded) {
              replies.push({ room, case: scenario.id, arm, text: capture.reply });
              if (room === 'approved' && scenario.id === 'practical') practical[arm] = { thread, approval: approved, archive: archiveName };
            }
            await saveStatus();
            console.log([room, scenario.id, arm, succeeded ? 'completed' : 'failed', capture.wire.map(item => item.status).join(',') || 'no HTTP'].join(' '));
            if (!succeeded) throw new Error('AUDITION_TURN_DID_NOT_COMPLETE');
          }, () => room === 'approved' && scenario.id === 'practical' ? join(out, archiveName) : undefined);
        }
      }
    }
    assert.equal(replies.length, 42);
    const routeEvidenceSha256 = digest([endpoint, routerId, lockedWireSettings, ...status.finished.flatMap(row => row.requests)]);
    await writeJson(join(out, 'replies.private.json'), { schema: 'quellight.q4-011.live-replies@1', routeEvidenceSha256, replies });
    await writeJson(sessionFile, { mode: status.mode, dsn, complete: true, story, practical });
    status.routeEvidenceSha256 = routeEvidenceSha256;
    status.result = 'completed';
    await saveStatus();
  }
} catch (error) {
  if (mode !== 'continue') {
    status.result = 'incomplete';
    status.failure = error.message === 'AUDITION_TURN_DID_NOT_COMPLETE' ? error.message : error.constructor.name;
    await saveStatus();
  }
  // Avoid reporting upstream error messages, provider request bodies, or credentials.
  console.error(mode + ' did not finish. Review its redacted status and local receipts.');
  process.exitCode = 1;
} finally {
  for (const rt of runtimes.values()) await rt.close();
  await fixture?.close();
}
