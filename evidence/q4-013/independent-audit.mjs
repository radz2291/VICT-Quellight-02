import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const [caseFile, decisionsFile, voiceFile, captureDir, mode = 'observe'] = process.argv.slice(2);
assert.ok(caseFile && decisionsFile && voiceFile && captureDir);
assert.ok(['observe', 'delivery'].includes(mode));
async function json(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new Error('Could not read one required audit JSON input'); }
}
const sha = value => createHash('sha256').update(value).digest('hex');
const hashJson = value => sha(JSON.stringify(value));
const digestFlat = value => hashJson(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
const same = (a, b, message) => assert.ok(JSON.stringify(a) === JSON.stringify(b), message);
const capture = label => json(join(captureDir, label + '.private.json'));
const frozenBytes = await readFile(caseFile);
const frozen = JSON.parse(frozenBytes);
const decisions = await json(decisionsFile);
const voice = (await json(voiceFile)).eight;
const pins = await capture('pins');
assert.equal(sha(frozenBytes), pins.caseSha256);
assert.equal(sha(voice), '23adc723ab5a8d25dcc1371e2a70df248c4f6db1eb9c141df58f5c2ca8b77254');
assert.equal(sha(voice), pins.speaking.sha256);
assert.equal(Buffer.byteLength(voice), 30489);
assert.equal(Buffer.byteLength(voice), pins.speaking.bytes);

const arms = ['default', 'conditioned'];
const background = [];
const learnedAfter = new Map();
let appendSha;
const content = message => typeof message.content === 'string' ? message.content :
  Array.isArray(message.content) ? message.content.map(part => part.text ?? '').join('\n') : '';

function requestFacts(raw, single = true) {
  const { steps, requests, wire, profiles } = raw;
  assert.ok(steps.length);
  if (single) assert.equal(steps.length, 1);
  assert.equal(requests.length, steps.length);
  assert.equal(wire.length, steps.length);
  assert.ok(profiles.length);
  assert.ok(profiles.every(profile => profile.routerModel === 'zai-coding-plan/glm-5.3-flash' && profile.provider === 'zai-coding-plan'));
  const summary = requests.map((request, index) => {
    assert.equal(request.payload.model, 'glm-5.3-flash');
    assert.equal(wire[index].status, 200);
    assert.equal(wire[index].generationOverrides.length, 0);
    const encoded = JSON.stringify(request.payload);
    assert.equal(sha(encoded), request.sha256);
    assert.equal(Buffer.byteLength(encoded), request.bytes);
    const usage = Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens', 'cached_tokens', 'reasoning_tokens']
      .map(field => [field, Number.isFinite(wire[index].usage?.[field]) ? wire[index].usage[field] : null]));
    return { wireBytes: request.bytes, wireSha256: request.sha256, usage,
      sdkBytes: Buffer.byteLength(JSON.stringify(steps[index].options.prompt)) };
  });
  return single ? summary[0] : summary;
}

function pairParity(control, candidate, key) {
  const p = key === 'sdk' ? 'prompt' : 'messages';
  const left = structuredClone(control), right = structuredClone(candidate);
  const a = left[p][0], b = right[p][0];
  assert.equal(a.role, 'system');
  assert.equal(b.role, 'system');
  assert.ok(typeof a.content === 'string' && typeof b.content === 'string');
  assert.ok(!a.content.includes(voice));
  assert.ok(b.content.startsWith(a.content) && b.content.endsWith(voice) && b.content.split(voice).length === 2);
  const append = b.content.slice(a.content.length);
  const marker = '\n\n=== CUSTOM INSTRUCTIONS ===\n\n';
  assert.ok(append.startsWith(marker) && Buffer.byteLength(append) === 30716);
  const instruction = append.slice(marker.length);
  assert.equal(pins.conditioned, hashJson({ role: 'observer', selection: 'append',
    bytes: Buffer.byteLength(instruction), instructionSha256: sha(instruction) }));
  if (appendSha) assert.equal(sha(append), appendSha);
  appendSha = sha(append);
  b.content = a.content;
  if (key === 'sdk') {
    for (const packet of [left, right]) for (const message of packet.prompt) {
      if (!Array.isArray(message.content)) continue;
      for (const part of message.content) {
        const options = part.providerOptions?.mastra;
        if (options && Object.hasOwn(options, 'createdAt')) {
          assert.ok(Number.isSafeInteger(options.createdAt) && options.createdAt > 0);
          delete options.createdAt;
        }
      }
    }
  }
  same(left, right, `Paired ${key} request differs outside the role append/capture time`);
  return hashJson(left);
}

for (const stage of ['before', 'after']) {
  const rows = await Promise.all(arms.map(arm => capture(stage + '-' + arm)));
  const [control, candidate] = rows;
  same(control.input, candidate.input, 'Stage source pages differ');
  const matched = {
    sdk: pairParity(control.capture.steps[0].options, candidate.capture.steps[0].options, 'sdk'),
    wire: pairParity(control.capture.requests[0].payload, candidate.capture.requests[0].payload, 'wire'),
  };
  assert.equal(matched.wire, control.match.wire);
  assert.equal(matched.wire, candidate.match.wire);
  assert.notEqual(control.policy.roleRevision, candidate.policy.roleRevision);
  assert.notEqual(control.policy.config, candidate.policy.config);
  const before = row => Object.fromEntries(Object.entries(row.policy.before).filter(([key]) => key !== 'configurationRevision'));
  same(before(control), before(candidate), 'Observer starting state differs');
  for (const row of rows) {
    const { operation, snapshot, receipts, config } = row.policy;
    const { arm } = row;
    const wire = requestFacts(row.capture);
    const expected = frozen.originals.slice(0, frozen.stageCut[stage]);
    same(row.input.sources.map(s => [s.role, sha(s.text), s.excluded]),
      expected.map(s => [s.role, sha(s.text), false]), 'App source page differs from frozen originals');
    for (const messages of [row.capture.steps[0].options.prompt, row.capture.requests[0].payload.messages]) {
      const selected = messages.filter(message => message.role === 'user').map(content).join('\n');
      assert.ok(expected.every(source => selected.includes(source.text)), 'A frozen original was absent at the model boundary');
    }
    const note = snapshot.current.observations;
    const rawText = row.capture.steps[0].text;
    const plan = decisions.find(p => p.arm === arm);
    for (const quote of Object.values(plan.quotes[stage])) assert.ok(note.includes(quote) && rawText.includes(quote));
    assert.equal(row.phase, stage);
    assert.equal(operation.kind, 'observe');
    assert.equal(operation.status, 'completed');
    assert.ok(operation.result.observed);
    assert.equal(operation.configuration_revision, config);
    assert.equal(operation.source_digest, operation.result.sourceRevision);
    assert.equal(operation.authority_revision, row.input.authorityRevision);
    assert.equal(operation.events.filter(event => event.name === 'prepared').length, 1);
    assert.equal(operation.events.filter(event => event.name === 'published').length, 1);
    assert.ok(operation.result.snapshot.current.observations === note, 'Observation text differs between captured committed views');
    assert.equal(operation.thread_id, 'vict-conv-' + snapshot.conversationId);
    assert.equal(operation.resource_id, snapshot.resourceId);
    assert.equal(operation.request_digest, digestFlat({
      kind: 'observe', conversationId: snapshot.conversationId, operationId: operation.operation_id,
      authorityRevision: operation.authority_revision, configurationRevision: operation.configuration_revision,
    }));
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].status, 'completed');
    assert.equal(receipts[0].invocations.length, 1);
    const [invocation] = receipts[0].invocations;
    assert.equal(invocation.status, 'completed');
    assert.equal(invocation.capabilityId, 'quellight.memory.maintain');
    assert.equal(invocation.effect, 'write');
    assert.ok(operation.resource_id.startsWith('vict-actor-'));
    assert.equal(invocation.argDigest, digestFlat({
      actorId: operation.resource_id.slice('vict-actor-'.length), kind: 'observe', conversationId: snapshot.conversationId,
      operationId: operation.operation_id, authorityRevision: operation.authority_revision,
      configurationRevision: operation.configuration_revision, sourceRevision: operation.source_digest,
    }));
    const dateEstimated = /(?:Dec(?:ember)?\.? 4, 2026|2026-12-04)/i.test(note);
    if (stage === 'after') learnedAfter.set(arm, row);
    background.push({ stage, arm, roleRevision: row.policy.roleRevision, sourceCount: expected.length, policyParity: matched,
      workingMemoryBytes: Buffer.byteLength(snapshot.workingMemory ?? ''), calendarDateInNote: dateEstimated, ...wire });
  }
}
assert.equal(pins.default, hashJson({ role: 'observer', selection: 'native-default', archive: pins.app.adapter }));

if (mode === 'observe') {
  console.log(JSON.stringify({ speaking: pins.speaking, caseSha256: pins.caseSha256, appendSha256: appendSha, background }, null, 2));
}

if (mode === 'delivery') {
  const results = [];
  const normalizeSdk = original => {
    const options = structuredClone(original);
    for (const message of options.prompt) {
      if (!Array.isArray(message.content)) continue;
      for (const part of message.content) {
        const receipt = part.providerOptions?.mastra;
        if (!receipt || !Object.hasOwn(receipt, 'createdAt')) continue;
        assert.ok(Number.isSafeInteger(receipt.createdAt) && receipt.createdAt > 0);
        delete receipt.createdAt;
      }
    }
    return hashJson(options);
  };
  function performedWriteArguments(chat, read, inRoom) {
    const writes = new Map();
    for (const { payload } of chat.requests) for (const message of payload.messages) {
      for (const call of message.tool_calls ?? []) {
        const fn = call.function;
        if (!fn || !['quellight_desk_create', 'quellight_desk_append'].includes(fn.name) || writes.has(call.id)) continue;
        let args;
        try { args = JSON.parse(fn.arguments); }
        catch { throw new Error('Could not parse one tool argument in private capture'); }
        assert.ok(args.roomId === read.roomId, 'Desk write is outside the admitted scope');
        const text = args.text ?? args.body;
        assert.ok(typeof text === 'string');
        assert.equal(text.includes('Cedar-47'), inRoom);
        assert.equal(text.includes('Mira'), inRoom);
        if (inRoom) {
          assert.ok(/wording check/i.test(text) && /final approval/i.test(text) && /undecided/i.test(text),
            'Same-room write lacks a vetted role or open-decision marker');
        }
        writes.set(call.id, { capabilityId: fn.name.replaceAll('_', '.'), roomMatched: true, argumentSha256: hashJson(args) });
      }
    }
    const completed = chat.invocations.filter(invocation => invocation.effect === 'write' && invocation.status === 'completed');
    same([...writes.values()].map(entry => entry.capabilityId).sort(), completed.map(entry => entry.capabilityId).sort(),
      'Observed Desk write calls and completed receipts differ');
    return [...writes.values()];
  }
  for (const arm of arms) {
    const row = await capture('deliver-' + arm);
    const learned = learnedAfter.get(arm);
    const plan = decisions.find(decision => decision.arm === arm);
    assert.equal(row.arm, arm);
    assert.equal(row.approval.revision, 'r2');
    assert.equal(row.approval.sourceId, learned.approvedSource);
    assert.equal(row.approval.sourceThread, learned.policy.snapshot.conversationId);
    assert.equal(row.approval.authority, learned.input.authorityRevision);
    const notes = learned.policy.snapshot.current.observations;
    for (const [field, support] of Object.entries(plan.sources)) {
      const originalIndex = frozen.originals.findIndex(source => source.id === support.original);
      assert.ok(originalIndex >= 0);
      const source = learned.input.sources[originalIndex];
      assert.equal(source.role, 'user');
      assert.equal(source.excluded, false);
      assert.ok(source.text.includes(support.span));
      assert.ok(notes.includes(plan.quotes.after[support.observation]));
      assert.ok(plan.context[field]);
    }
    const block = `<approved-room-state revision="r2">${JSON.stringify(plan.context)}</approved-room-state>`;
    assert.ok(row.approval.block === block, 'Approved room block differs from reviewed fixture fields');
    for (const scope of ['same', 'cross']) {
      const chat = row[scope], inRoom = scope === 'same';
      const requests = requestFacts(chat, false);
      assert.equal(chat.status, 'completed');
      assert.equal(chat.reads.length, 1);
      assert.equal(chat.bindings.length, 1);
      const [read] = chat.reads;
      assert.equal(read.actorId, learned.policy.operation.resource_id.slice('vict-actor-'.length));
      assert.notEqual(read.conversationId, row.approval.sourceThread);
      assert.equal(read.roomId === row.approval.roomId, inRoom);
      assert.equal(read.revision, inRoom ? 'r2' : null);
      assert.equal(read.sourceId, inRoom ? row.approval.sourceId : null);
      assert.equal(read.authority, row.approval.authority);
      const sdk = chat.steps[0].options;
      assert.equal(sdk.headers['x-thread-id'], 'vict-conv-' + read.conversationId);
      const layers = chat.steps.flatMap((step, index) => [step.options.prompt, chat.requests[index].payload.messages]);
      for (const messages of layers) {
        const first = messages[0];
        assert.equal(first.role, 'system');
        assert.ok(typeof first.content === 'string' && first.content.startsWith(voice + '\n'));
        assert.ok(first.content.split(voice).length === 2);
        assert.equal(first.content.split(block).length - 1, inRoom ? 1 : 0);
        assert.equal(first.content.includes('<approved-room-state'), inRoom);
        if (inRoom) assert.ok(first.content.indexOf(block) < first.content.indexOf('<desk-context>'));
        const all = JSON.stringify(messages);
        assert.equal(all.includes('Cedar-47'), inRoom);
        assert.equal(all.includes('Mira'), inRoom);
        assert.equal(all.includes('Mira is the final approver'), false);
        assert.ok(messages.some(msg => msg.role === 'user' && content(msg).includes(frozen.fresh)));
      }
      for (const messages of layers.slice(0, 2)) {
        const packet = JSON.stringify(messages);
        assert.ok(frozen.originals.every(source => !packet.includes(source.text)), 'Initial fresh chat contains old-thread history');
      }
      const [instruction] = chat.activation.artifacts.filter(a => a.kind === 'instructions');
      assert.equal(chat.activation.activationVersion, 'v1_' + sha(chat.activation.canonicalManifest));
      assert.equal(instruction.revision, hashJson({ id: instruction.id, text: sdk.prompt[0].content }));
      assert.ok(chat.reply === chat.steps.map(step => step.text ?? '').join(''), 'Public reply differs from captured assistant text');
      assert.ok(Array.isArray(chat.invocations));
      const writeArguments = performedWriteArguments(chat, read, inRoom);
      results.push({ arm, scope, admittedRevision: read.revision, evaluatedRoomBlock: inRoom,
        admittedInstructionsSha256: sha(sdk.prompt[0].content), initialSdk: normalizeSdk(sdk),
        invocations: chat.invocations.map(({ capabilityId, effect, status }) => ({ capabilityId, effect, status })),
        writeArguments, replySha256: sha(chat.reply), requests });
    }
    assert.notEqual(row.same.reads[0].conversationId, row.cross.reads[0].conversationId);
    assert.notEqual(row.same.turnId, row.cross.turnId);
  }
  for (const scope of ['same', 'cross']) {
    const pair = results.filter(record => record.scope === scope);
    assert.equal(pair[0].initialSdk, pair[1].initialSdk);
    assert.equal(pair[0].requests[0].wireSha256, pair[1].requests[0].wireSha256);
  }
  console.log(JSON.stringify({ speaking: pins.speaking, caseSha256: pins.caseSha256, background, delivery: results }, null, 2));
}
