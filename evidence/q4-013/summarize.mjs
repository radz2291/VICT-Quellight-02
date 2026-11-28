import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { digest, sha } from '../q4-011/voices.mjs';
import { matchingModelInput } from '../q4-011/comparison.mjs';

const [dir, decisionsFile, output] = process.argv.slice(2);
assert.ok(dir && decisionsFile && output);
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const from = file => read(join(resolve(dir), file + '.private.json'));
const plans = await read(decisionsFile);
const pins = await from('pins');
const arms = ['default', 'conditioned'];
const stages = ['before', 'after'];
const background = [], foreground = [];

function transport(capture) {
  assert.equal(capture.wire.length, capture.requests.length);
  assert.equal(capture.requests.length, capture.steps.length);
  assert.ok(capture.wire.every(r => r.status === 200 && r.generationOverrides.length === 0));
  return capture.wire.map((r, index) => ({
    status: r.status, stream: r.stream, settingsSha256: r.settingsDigest, usage: r.usage ?? null,
    wireBytes: capture.requests[index].bytes, wireSha256: capture.requests[index].sha256,
    messagesBytes: Buffer.byteLength(JSON.stringify(capture.requests[index].payload.messages)),
    sdkPromptBytes: Buffer.byteLength(JSON.stringify(capture.steps[index].options.prompt)),
  }));
}

for (const stage of stages) {
  const pair = await Promise.all(arms.map(arm => from(stage + '-' + arm)));
  assert.deepEqual(pair[0].match, pair[1].match);
  assert.deepEqual(pair[0].input, pair[1].input);
  assert.notEqual(pair[0].policy.roleRevision, pair[1].policy.roleRevision);
  assert.notEqual(pair[0].policy.config, pair[1].policy.config);
  for (const row of pair) {
    const { operation, receipts, snapshot, ...policy } = row.policy;
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].status, 'completed');
    assert.equal(receipts[0].invocations.length, 1);
    assert.equal(receipts[0].invocations[0].status, 'completed');
    const observation = snapshot.current.observations;
    const plan = plans.find(p => p.arm === row.arm);
    const text = row.capture.steps.map(step => step.text).join('\n');
    for (const quote of Object.values(plan?.quotes?.[stage] ?? {})) {
      assert.ok(typeof quote === 'string' && quote.length && observation.includes(quote) && text.includes(quote),
        'Evidence excerpt absent from the returned and persisted observation');
    }
    background.push({ arm: row.arm, stage, match: row.match,
      effectiveRevision: policy.effectiveRevision, observerRevision: policy.roleRevision, config: policy.config,
      retainedObservationsSha256: sha(observation), rawOutputSha256: sha(text),
      observationsBytes: Buffer.byteLength(observation), workingMemorySha256: sha(snapshot.workingMemory ?? ''),
      priorObservationCount: policy.before.current ? 1 : 0,
      typedMembership: Object.hasOwn(operation.result, 'sourceMembership'),
      authority: operation.authority_revision, nativeSourceDigest: operation.source_digest,
      originals: row.input.sources.map(source => ({ role: source.role, sha256: sha(source.text), eligible: !source.excluded })),
      operation: { status: operation.status, support: receipts[0].invocations[0].capabilityId,
        invocationStatus: receipts[0].invocations[0].status },
      requests: transport(row.capture) });
  }
}

for (const plan of plans.filter(p => p.context)) {
  const row = await from('deliver-' + plan.arm);
  for (const [scope, chat] of [['same', row.same], ['other', row.cross]]) {
    const options = chat.steps[0].options;
    const { prompt, ...rest } = options;
    const binding = chat.bindings[0];
    const recall = binding.capabilities.find(cap => cap.id.includes('recall'));
    assert.ok(recall);
    const system = prompt[0].content;
    assert.equal(sha(Buffer.from(system).subarray(0, pins.speaking.bytes)), pins.speaking.sha256);
    const admitted = scope === 'same';
    assert.equal(chat.reads[0].revision, admitted ? 'r2' : null);
    assert.ok(admitted ? system.includes(row.approval.block) : !system.includes('<approved-room-state'));
    const messages = chat.requests.flatMap(request => request.payload.messages);
    for (const marker of ['<approved-room-state', 'cedar-label-r2', 'Cedar-47', 'Mira']) {
      assert.equal(JSON.stringify(messages).includes(marker), admitted);
    }
    assert.equal(JSON.stringify(messages).includes('Mira as the person who gives final approval'), false);
    if (!admitted) assert.ok(!/Mira|Cedar-47/.test(chat.reply));
    const proof = matchingModelInput(prompt.slice(1), rest, chat.reads[0].conversationId, recall.revision);
    const common = { ...proof, binding: digest(binding), profile: digest(chat.profiles[0]),
      baseInstructions: sha(system.replace('\n\n' + row.approval.block, '')) };
    foreground.push({ arm: plan.arm, scope, speaker: pins.speaking.sha256, common,
      approval: { revision: chat.reads[0].revision, oneLookup: chat.reads.length === 1,
        sameCurrentAuthority: chat.reads[0].authority === row.approval.authority, resultBytes: chat.reads[0].resultBytes,
        blockBytes: admitted ? Buffer.byteLength(row.approval.block) : 0 },
      activationVersion: chat.activation.activationVersion, settled: chat.status === 'completed',
      replySha256: sha(chat.reply), invocations: chat.invocations, requests: transport(chat) });
  }
}

for (const scope of ['same', 'other']) {
  const pair = foreground.filter(row => row.scope === scope);
  if (pair.length === 2) {
    assert.deepEqual(pair[0].common, pair[1].common, 'Foreground changed outside room guidance');
    assert.equal(pair[0].requests[0].wireSha256, pair[1].requests[0].wireSha256, 'Paired first wire bodies differ');
  }
}

const incremental = await from('incremental');
assert.equal(incremental.firstEvidenceSha256, background.find(r => r.arm === 'default' && r.stage === 'before').rawOutputSha256);
assert.equal(incremental.secondEvidenceSha256, background.find(r => r.arm === 'default' && r.stage === 'after').rawOutputSha256);
const usage = groups => Object.fromEntries(groups.map(([name, rows]) => {
  const requests = rows.flatMap(r => r.requests);
  const counts = Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens', 'cached_tokens', 'reasoning_tokens']
    .map(field => [field, requests.reduce((sum, r) => sum + (r.usage?.[field] ?? 0), 0)]));
  return [name, { requests: requests.length, usageAvailable: requests.filter(r => r.usage).length, ...counts }];
}));
const result = { pins, incremental, usage: {
  background: usage(arms.map(arm => [arm, background.filter(row => row.arm === arm)])),
  foreground: usage(arms.map(arm => [arm, foreground.filter(row => row.arm === arm)])),
  missing: ['Initial default foreground capture rejected by the local activation evidence check',
    'Earlier conditioned foreground attempt interrupted during projection by local disk exhaustion'],
}, normalization: {
  observerSdk: ['exact conditioned role append', 'numeric providerOptions.mastra.createdAt'],
  observerWire: ['exact conditioned role append'],
  foreground: ['exact admitted room block', 'numeric providerOptions.mastra.createdAt', 'admitted thread ID', 'admitted recall revision'],
}, background, foreground };
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
