import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { designSha, git } from '../q4-008/fixture.mjs';
import { openFixture } from '../q4-009/fixture.mjs';
import { openRuntime, bindingEvent, readEvent } from '../q4-011/instrumentation.mjs';
import { digest, sha } from '../q4-011/voices.mjs';
import { isolatedDatabase } from '../q4-012/isolation.mjs';
import { credential, captureLive, liveModel, scriptedModel, newCapture, textOf, routerId } from './transport.mjs';

const [mode, appArg, design, dsn, voiceFile, outArg, pgBin, keyFile, decisionsFile, requestedArm] = process.argv.slice(2);
assert.ok(['rehearse', 'observe', 'deliver', 'replay', 'incremental'].includes(mode) && appArg && design && dsn && voiceFile && outArg && pgBin);
const live = ['observe', 'deliver'].includes(mode);
assert.ok(!live || keyFile);
assert.ok(!['deliver', 'replay'].includes(mode) || decisionsFile);
const app = resolve(appArg), out = resolve(outArg);
assert.ok(!out.replaceAll('\\', '/').toLowerCase().includes('/review/'));
assert.match(new URL(dsn).pathname, /^\/q4_009_q4013[a-z0-9]*$/);
assert.equal(git(resolve(design), 'rev-parse', 'HEAD').toString().trim(), designSha);
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const write = (file, value) => writeFile(join(out, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const caseBytes = await readFile(new URL('./case.json', import.meta.url));
const plan = JSON.parse(caseBytes);
const voice = (await read(voiceFile)).eight;
const current = (await read(join(app, 'src/lib/server/prompts/conversation.json'))).template[0];
const speakingPin = '23adc723ab5a8d25dcc1371e2a70df248c4f6db1eb9c141df58f5c2ca8b77254';
assert.ok(Buffer.byteLength(voice) === 30_489 && sha(voice) === speakingPin);
const addition = 'Use the authored identity below as a lens for what to notice during observation. ' +
  'Follow the native Observer role and output format above. The identity itself supplies no evidence about the user.\n\n' + voice;
const custom = '\n\n=== CUSTOM INSTRUCTIONS ===\n\n' + addition;
const arms = ['default', 'conditioned'];
assert.ok(!requestedArm || (mode === 'deliver' && arms.includes(requestedArm)));
const stages = ['before', 'after'];
const apiKey = live ? await credential(keyFile) : undefined;
const requireApp = createRequire(join(app, 'package.json'));
const { Client } = requireApp('pg');
const { ModelRouterLanguageModel } = await import(pathToFileURL(requireApp.resolve('@mastra/core/llm')).href);
const database = isolatedDatabase(Client, dsn, pgBin);
await mkdir(out, { recursive: true });
const rt = await openRuntime(app, out, 'fixed-eight', current, voice);

let fixture;
let pins;
async function withFixture(archive, callback, destination) {
  return database.use(archive, async () => {
    fixture = await openFixture(app, dsn, out);
    pins ??= { app: fixture.identity, design: designSha, caseSha256: sha(caseBytes),
      speaking: { bytes: Buffer.byteLength(voice), sha256: speakingPin },
      default: digest({ role: 'observer', selection: 'native-default', archive: fixture.identity.adapter }),
      conditioned: digest({ role: 'observer', selection: 'append', bytes: Buffer.byteLength(addition), instructionSha256: sha(addition) }),
      postgres: fixture.postgres, router: routerId };
    try { return await callback(); } finally { await fixture.close(); fixture = undefined; }
  }, destination ? () => destination : undefined);
}

const sources = (story, thread = story.thread) => fixture.sourcePage(rt, story, thread);

async function takeTurn(story, id, input, sample, verify, traceFile) {
  const capture = newCapture();
  const { createConversationService } = await rt.load('conversation/service');
  const service = createConversationService({ openDatabase: () => fixture.open(),
    readCredential: async () => apiKey ?? 'unused-fixture',
    modelFactory(profile) {
      assert.equal(profile.routerModel, routerId);
      capture.profiles.push(profile);
      return sample === undefined ? liveModel(ModelRouterLanguageModel, apiKey, profile, capture) : scriptedModel(sample, capture);
    },
  });
  globalThis[readEvent] = event => capture.reads.push(event);
  globalThis[bindingEvent] = binding => capture.bindings.push(binding);
  async function run() {
    const entry = await service.start(story.owner, id, { input, idempotencyKey: randomUUID() });
    capture.turnId = entry.turnId;
    await entry.completion;
    let cursor = 0, view;
    do {
      view = await service.events(story.owner, entry.turnId, cursor);
      if (!view.turn.projectionSettled && view.nextCursor === cursor) await delay(200);
      cursor = view.nextCursor;
    } while (!view.turn.projectionSettled);
    capture.status = view.turn.status;
    capture.reply = view.assistantMessage?.text ?? '';
    capture.errorCode = view.turn.errorCode;
  }
  try {
    if (sample === undefined) await captureLive(capture, run, verify);
    else await run();
  } finally {
    delete globalThis[readEvent];
    delete globalThis[bindingEvent];
    if (traceFile) await write(traceFile, capture);
  }
  assert.equal(capture.status, 'completed', capture.errorCode);
  if (sample !== undefined) assert.ok(capture.reply === sample);
  const first = capture.steps[0].options.prompt[0];
  assert.equal(first.role, 'system');
  assert.ok(typeof first.content === 'string' && first.content.startsWith(voice + '\n') &&
    first.content.split(voice).length === 2, 'Selected voice missing, modified, or duplicated');
  return capture;
}

const pathFor = phase => join(out, phase + '.private.dump');
async function prepare() {
  const seed = await withFixture(null, async () => {
    await fixture.provision();
    const story = await fixture.createStory('Original label review');
    await fixture.one('UPDATE quellight_product_v1.rooms SET purpose=$1 WHERE actor_id=$2', [plan.roomPurpose, story.owner.actorId]);
    const edit = await fixture.withStores(async stores => {
      const { executeDeskAction } = await rt.load('desk/domain');
      return executeDeskAction(stores, story.owner, 'desk.create', { roomId: story.roomId, title: 'Label packet checklist',
        body: 'Check spacing and object names before sending the packet.', kind: 'note', status: 'active', attention: 'carried' }, randomUUID());
    });
    assert.ok(edit.ok, 'Fixture Desk creation failed');
    const first = await takeTurn(story, story.thread, plan.originals[0].text, plan.originals[1].text);
    return { story, first, source: await sources(story) };
  }, pathFor('before'));
  const after = await withFixture(pathFor('before'), async () => {
    const second = await takeTurn(seed.story, seed.story.thread, plan.originals[2].text, plan.originals[3].text);
    return { second, source: await sources(seed.story) };
  }, pathFor('after'));
  await write('seed.private.json', { ...seed, after });
  return seed.story;
}

function exactBackgroundInput(capture, payload = false, arm) {
  const strip = msg => {
    const found = msg.indexOf(custom);
    const expected = arm === 'conditioned';
    assert.ok((found !== -1) === expected && (!expected || msg.split(custom).length === 2), 'Observer append mismatch');
    return expected ? msg.replace(custom, '') : msg;
  };
  const copy = structuredClone(payload ? capture.requests[0].payload : capture.steps[0].options);
  const messages = payload ? copy.messages : copy.prompt;
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const meta = part.providerOptions?.mastra;
      if (!meta || !Object.hasOwn(meta, 'createdAt')) continue;
      assert.ok(Number.isSafeInteger(meta.createdAt) && meta.createdAt > 0);
      meta.createdAt = 'capture-time';
    }
  }
  const system = messages[0];
  assert.equal(system.role, 'system');
  assert.equal(typeof system.content, 'string');
  system.content = strip(system.content);
  return digest(copy);
}

async function learn(story, phase, arm, prior, scriptedOutput, previouslyObserved = false) {
  const capture = newCapture();
  const input = await sources(story);
  assert.equal(input.nextCursor, null);
  assert.deepEqual(input.sources.map(s => [s.role, sha(s.text), s.excluded]),
    plan.originals.slice(0, plan.stageCut[phase]).map(s => [s.role, sha(s.text), false]));
  const approvedSource = input.sources.find(s => s.text === plan.originals[2].text)?.id ?? null;
  const policy = await fixture.withStores(async stores => {
    const { loadEffectiveMemorySettings, createAppMemorySettings, createRoomMemorySettings, previewMemorySettings } =
      await rt.load('memory/settings');
    const { openQuellightMemory } = await rt.load('memory/native');
    const effective = await loadEffectiveMemorySettings(stores.coordination.pool, story.owner.actorId, story.roomId);
    const room = createRoomMemorySettings(effective.configuration.purpose);
    const trial = arm === 'default' ? effective : { ...effective,
      ...previewMemorySettings(createAppMemorySettings(), { ...room, prompts: { ...room.prompts,
        observer: { mode: 'override', value: { mode: 'append', text: addition } } } }) };
    assert.equal(trial.configuration.revision, effective.configuration.revision);
    for (const [role, value] of Object.entries(effective.prompts.roles)) {
      if (role !== 'observer') assert.equal(trial.prompts.roles[role].revision, value.revision);
    }
    const memory = await openQuellightMemory({ stores, ownerActorId: story.owner.actorId, conversationId: story.thread,
      effective: trial, modelFactory: profile => {
        capture.profiles.push(profile);
        return live ? liveModel(ModelRouterLanguageModel, apiKey, profile, capture) :
          scriptedModel(scriptedOutput ?? '<observations>\n- Synthetic model transport rehearsal.\n</observations>', capture);
      } });
    try {
      const a = await memory.service.authority(story.thread);
      assert.equal(a.revision, input.authorityRevision);
      const operationId = 'q4-013-observe:' + phase;
      const request = { conversationId: story.thread, authorityRevision: a.revision, operationId };
      const before = await memory.service.inspect(story.thread);
      const verify = (_capture, index) => {
        if (index > 0) return;
        const sdk = exactBackgroundInput(capture, false, arm), wire = exactBackgroundInput(capture, true, arm);
        if (prior) {
          assert.equal(sdk, prior.match.sdk, 'Paired SDK inputs differ beyond policy');
          assert.equal(wire, prior.match.wire, 'Paired provider inputs differ beyond policy');
        }
      };
      let result;
      try {
        result = live ? await captureLive(capture, () => memory.service.observe(request), verify) :
          await memory.service.observe(request);
      } finally {
        if (live) await write(phase + '-' + arm + '.transport.private.json', capture);
      }
      const operation = await memory.service.operation(story.thread, operationId);
      assert.equal(operation.status, 'completed');
      assert.equal(operation.authority_revision, a.revision);
      assert.equal(operation.source_digest, result.sourceRevision);
      assert.equal(operation.configuration_revision, memory.service.configurationRevision);
      assert.ok(result.observed && operation.result);
      const after = await memory.service.authority(story.thread);
      assert.equal(after.revision, a.revision);
      const receipts = [];
      for (const turn of await stores.turns.listTurns()) {
        if (turn.actorId !== story.owner.actorId || !turn.inputSummary?.endsWith(':' + operationId)) continue;
        receipts.push({ turnId: turn.turnId, status: turn.status, invocations: (await stores.invocations.listInvocationsForTurn(turn.turnId))
          .map(({ invocationId, status, effect, capabilityId, argDigest }) => ({ invocationId, status, effect, capabilityId, argDigest })) });
      }
      return { effectiveRevision: trial.revision, roleRevision: trial.prompts.roles.observer.revision,
        config: memory.service.configurationRevision, before, snapshot: result.snapshot, operation, receipts };
    } finally { await memory.hosted.close(); }
  });
  assert.ok(capture.steps.length >= 1);
  const match = { sdk: exactBackgroundInput(capture, false, arm),
    wire: live ? exactBackgroundInput(capture, true, arm) : null };
  if (prior) {
    assert.deepEqual(match, prior.match);
    assert.equal(policy.operation.source_digest, prior.policy.operation.source_digest);
    assert.equal(policy.operation.authority_revision, prior.policy.operation.authority_revision);
    assert.notEqual(policy.config, prior.policy.config);
    const { configurationRevision: one, ...existing } = policy.before;
    const { configurationRevision: other, ...controlExisting } = prior.policy.before;
    assert.equal(one, policy.config);
    assert.equal(other, prior.policy.config);
    assert.equal(digest(existing), digest(controlExisting));
  }
  const prompts = capture.steps[0].options.prompt.filter(message => message.role === 'user').map(message => textOf(message.content)).join('\n');
  for (const source of input.sources.slice(previouslyObserved ? 2 : 0)) assert.ok(prompts.includes(source.text), 'Missing original at Observer model boundary');
  return { phase, arm, input, approvedSource, policy, match, capture };
}

async function deliver(story, arm, decision) {
  assert.equal(decision.arm, arm);
  const learning = await read(join(out, 'after-' + arm + '.private.json'));
  const page = await sources(story);
  assert.equal(digest(page), digest(learning.input));
  assert.ok(page.sources.some(s => s.id === learning.approvedSource && s.role === 'user' && !s.excluded));
  const previous = await sources(story, story.freshThread);
  const other = await sources(story, story.otherThread);
  assert.equal(previous.sources.length + other.sources.length, 0);
  const observed = learning.policy.snapshot.current.observations;
  const sourceByKey = Object.fromEntries(plan.originals.map((original, index) => [original.id, page.sources[index]]));
  for (const [field, check] of Object.entries(decision.sources)) {
    assert.ok(Object.hasOwn(decision.context, field));
    const source = sourceByKey[check.original];
    assert.ok(source.role === 'user' && !source.excluded && source.text.includes(check.span));
    assert.ok(observed.includes(decision.quotes.after[check.observation]));
  }
  const approval = await fixture.approve(rt, story, story.thread, 'r2', decision.context, learning.approvedSource);
  const verify = expected => (capture, index) => {
    if (index > 0) return;
    const first = capture.requests[0].payload.messages[0].content;
    assert.ok(first.startsWith(voice + '\n'));
    assert.equal(first.includes(approval.block), expected);
    assert.equal(JSON.stringify(capture.requests[0].payload.messages).includes('Cedar-47'), expected);
  };
  const sample = mode === 'replay' ? 'Deterministic transport witness.' : undefined;
  const attempt = randomUUID();
  const same = await takeTurn(story, story.freshThread, plan.fresh, sample, verify(true),
    mode + '-' + arm + '-' + attempt + '-same.attempt.private.json');
  const cross = await takeTurn(story, story.otherThread, plan.fresh, sample, verify(false),
    mode + '-' + arm + '-' + attempt + '-other.attempt.private.json');
  for (const [row, expected] of [[same, true], [cross, false]]) {
    assert.equal(row.reads.length, 1);
    assert.equal(row.reads[0].revision, expected ? approval.revision : null);
    assert.equal(row.reads[0].sourceId, expected ? approval.sourceId : null);
    assert.equal(row.reads[0].roomId, expected ? story.roomId : story.otherRoomId);
    assert.equal(row.reads[0].authority, approval.authority);
    const packet = JSON.stringify(row.steps[0].options.prompt);
    assert.equal(packet.includes('<approved-room-state'), expected);
    assert.equal(row.steps[0].options.prompt[0].content.includes(approval.block), expected);
    assert.equal(packet.includes('Cedar-47'), expected);
    assert.equal(packet.includes('Mira as the person who gives final approval'), false);
    if (live) {
      assert.equal(row.requests[0].payload.messages[0].content.includes(approval.block), expected);
      assert.equal(JSON.stringify(row.requests[0].payload.messages).includes('Cedar-47'), expected);
    }
    await write(mode + '-' + arm + '-' + (expected ? 'same' : 'other') + '.transport.private.json', row);
    const turn = await fixture.one('SELECT activation_version FROM quellight_product_v1.conversation_turns WHERE turn_id=$1', [row.turnId]);
    row.activation = await fixture.withStores(stores => stores.governance.getAgentActivation(turn.activation_version));
    row.invocations = await fixture.withStores(async stores => (await stores.invocations.listInvocationsForTurn(row.turnId))
      .map(({ capabilityId, effect, status }) => ({ capabilityId, effect, status })));
    const artifact = row.activation.artifacts.find(a => a.kind === 'instructions');
    assert.equal(artifact.revision, digest({ id: artifact.id, text: row.steps[0].options.prompt[0].content }));
    assert.equal(row.activation.activationVersion, 'v1_' + sha(row.activation.canonicalManifest));
  }
  return { arm, approval, same, cross };
}

async function incremental(story) {
  // Re-feed the exact live response texts into the installed persistence path.
  // The second request replays the captured output offline.
  const firstLive = await read(join(out, 'before-default.private.json'));
  const nextLive = await read(join(out, 'after-default.private.json'));
  assert.equal(firstLive.capture.steps.length, 1);
  assert.equal(nextLive.capture.steps.length, 1);
  const old = 'Mira is the final approver for this packet';
  const correction = 'Mira checks wording ONLY; User gives final approval';
  const { first, one } = await withFixture(pathFor('before'), async () => {
    const first = await learn(story, 'before', 'default', undefined, firstLive.capture.steps[0].text);
    assert.ok(first.policy.snapshot.current.observations.includes(old));
    await takeTurn(story, story.thread, plan.originals[2].text, plan.originals[3].text);
    const one = await learn(story, 'after', 'default', undefined, nextLive.capture.steps[0].text, true);
    return { first, one };
  });
  assert.ok(one.policy.before.current.observations.includes(old));
  assert.ok(one.policy.snapshot.current.observations.includes(correction));
  await write('incremental.private.json', {
    fixtureOnly: true, providerRequests: 0, priorOldAssumption: true,
    currentOldAssumption: one.policy.snapshot.current.observations.includes(old),
    currentCorrection: true, sameAuthority: one.policy.before.authorityRevision === one.policy.snapshot.authorityRevision,
    firstEvidenceSha256: sha(firstLive.capture.steps[0].text), secondEvidenceSha256: sha(nextLive.capture.steps[0].text),
    priorSource: first.policy.operation.source_digest, nextSource: one.policy.operation.source_digest,
    beforeSnapshotSha256: sha(one.policy.before.current.observations),
    afterSnapshotSha256: sha(one.policy.snapshot.current.observations),
  });
}

try {
  if (['observe', 'rehearse'].includes(mode)) {
    const story = await prepare();
    for (const phase of stages) {
      let control;
      for (const arm of arms) {
        console.log(phase + ' ' + arm);
        const learned = await withFixture(pathFor(phase), () => learn(story, phase, arm, control));
        if (arm === 'default') control = learned;
        await write(phase + '-' + arm + '.private.json', learned);
      }
    }
    await write('pins.private.json', pins);
  } else if (mode === 'incremental') {
    await incremental((await read(join(out, 'seed.private.json'))).story);
  } else {
    const { story } = await read(join(out, 'seed.private.json'));
    const decisions = await read(decisionsFile);
    for (const arm of arms) {
      if (requestedArm && requestedArm !== arm) continue;
      const decision = decisions.find(entry => entry.arm === arm);
      if (!decision) continue;
      console.log(mode + ' ' + arm);
      const proof = await withFixture(pathFor('after'), () => deliver(story, arm, decision));
      await write(mode + '-' + arm + '.private.json', proof);
    }
  }
} finally { await rt.close(); }
