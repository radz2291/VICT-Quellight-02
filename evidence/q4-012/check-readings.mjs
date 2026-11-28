import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { arms, digest, sha } from '../q4-011/voices.mjs';
import { matchingModelInput } from '../q4-011/comparison.mjs';
import { endpoint, routerId, wireModel } from './provider.mjs';

const [summary, runDir, priorDir, readerDir, output, preflightDir] = process.argv.slice(2);
assert.ok(preflightDir, 'Usage: node check-readings.mjs SUMMARY PRIVATE_RUN PRIOR_VOICES PRIVATE_READER OUTPUT PRIVATE_PREFLIGHT');
const read = async name => JSON.parse(await readFile(name, 'utf8'));
const status = await read(summary);
const source = await read(new URL('../q4-011/capture.json', import.meta.url));
const scenarios = await read(new URL('../q4-011/scenarios.json', import.meta.url));
const order = await read(new URL('../q4-011/blind-order.json', import.meta.url));
const key = await read(join(readerDir, 'reveal-key.private.json'));
const voices = await read(join(priorDir, 'assembled-voices.private.json'));
const responses = await read(join(runDir, 'replies.private.json'));
const session = await read(join(runDir, 'session.private.json'));
const preflight = await read(join(preflightDir, 'empty-practical-current.private.json'));
const recovered = await read(join(preflightDir, 'recovered-preflight.private.json'));
assert.equal(status.mode, 'live');
assert.equal(status.result, 'completed');
assert.equal(status.finished.length, 42);
assert.equal(status.endpoint, endpoint);
assert.equal(status.model, wireModel);
assert.equal(status.routerId, routerId);
assert.equal(status.sourcePinsSha256, digest(source.sourcePins));
assert.equal(status.design, source.pinned.design);
assert.equal(status.installed.app, source.pinned.app);
assert.equal(status.installed.installLock, source.pinned.installLock);
assert.equal(status.installed.installedBinding, 'baseline');
assert.equal(order.keyCommitment, digest(key));
assert.equal(status.blindOrderSha256, digest(order));
assert.equal(responses.schema, 'quellight.q4-011.live-replies@1');
assert.equal(responses.routeEvidenceSha256, status.routeEvidenceSha256);
assert.equal(responses.replies.length, 42);
assert.ok(session.complete && session.mode === 'live');
assert.equal(preflight.wire.length, 2);
assert.ok(preflight.wire.every(item => item.status === 200 && item.model === wireModel));
assert.equal(recovered.execution_state, 'settled');
assert.equal(recovered.desk[0].revision, 2);
assert.ok(recovered.output_text.trim());

const repetitions = [];
for (const row of status.repetitions ?? []) {
  const receipt = await read(join(runDir, [row.room, row.case, row.arm].join('-') + '-initial.private.json'));
  assert.deepEqual(receipt.wire, row.requests);
  assert.equal(receipt.status, row.state);
  assert.equal(receipt.errorCode, row.errorCode);
  const replacement = status.finished.find(item => item.room === row.room && item.case === row.case && item.arm === row.arm);
  assert.ok(replacement?.completed);
  assert.deepEqual(row.proof.common, replacement.proof.common);
  repetitions.push({ room: row.room, case: row.case, arm: row.arm, state: row.state,
    errorCode: row.errorCode, provider: row.requests, replacementVerified: true });
}

const cells = [], requestRows = [], invocationTypes = new Map(), threads = new Set();
for (const group of order.sequence) {
  const { room, case: id } = group;
  const result = { room, case: id, arms: [] };
  let common;
  for (const arm of arms) {
    const matches = status.finished.filter(row => row.room === room && row.case === id && row.arm === arm);
    assert.equal(matches.length, 1);
    const [row] = matches;
    const raw = await read(join(runDir, [room, id, arm].join('-') + '.private.json'));
    const [first] = raw.steps;
    const { prompt, ...options } = first.options;
    const [system, ...ordinary] = prompt;
    const voice = voices[arm];
    assert.ok(system.content.startsWith(voice + '\n'));
    assert.equal(JSON.stringify(prompt).split(JSON.stringify(voice).slice(1, -1)).length, 2);
    assert.equal(row.proof.voiceSha256, source.sourcePins.voices[arm].sha256);
    assert.equal(row.proof.instructionsSha256, sha(system.content));
    assert.equal(row.instructionsRevision, digest({ id: 'quellight.conversation.desk-context', text: system.content }));
    const recall = raw.bindings[0].capabilities.find(item => item.id === 'recall');
    const compared = matchingModelInput(ordinary, options, raw.thread, recall.revision);
    assert.equal(row.proof.common.ordinaryMessages, compared.ordinaryMessages);
    assert.equal(row.proof.common.toolSchemasAndOptions, compared.toolSchemasAndOptions);
    common ??= row.proof.common;
    assert.deepEqual(row.proof.common, common);
    assert.equal(raw.steps.length, row.steps);
    assert.deepEqual(raw.wire, row.requests);
    assert.ok(raw.status === 'completed' && raw.projectionSettled && raw.reply.trim() && row.completed);
    assert.ok(raw.wire.length >= 1 && raw.wire.every(call => call.status === 200 && call.model === wireModel && !call.generationOverrides.length));
    assert.equal(raw.reads[0].revision, room === 'approved' ? 'r1' : null);
    assert.ok(!threads.has(raw.thread));
    threads.add(raw.thread);
    const replies = responses.replies.filter(item => item.room === room && item.case === id && item.arm === arm);
    assert.equal(replies.length, 1);
    assert.ok(replies[0].text === raw.reply);
    const invocations = new Map();
    for (const { options: step } of raw.steps.slice(1)) {
      for (const message of step.prompt.filter(message => message.role === 'tool')) {
        for (const part of message.content) {
          if (part.type === 'tool-result') invocations.set(part.toolCallId, part.toolName);
        }
      }
    }
    for (const tool of invocations.values()) invocationTypes.set(tool, (invocationTypes.get(tool) ?? 0) + 1);
    requestRows.push(...raw.wire);
    result.arms.push({ arm, voiceSha256: row.proof.voiceSha256, activationVersion: row.activationVersion,
      instructionsRevision: row.instructionsRevision, replyVerified: true });
  }
  cells.push({ ...result, commonFirstInputSha256: digest(common) });
}
for (const { id } of scenarios.order) assert.equal(cells.find(row => row.room === 'empty' && row.case === id).commonFirstInputSha256,
  cells.find(row => row.room === 'approved' && row.case === id).commonFirstInputSha256);
assert.equal(new Set(requestRows.map(row => row.settingsDigest)).size, 1);
const observed = requestRows.filter(row => row.usage);
const totals = Object.fromEntries([...new Set(observed.flatMap(row => Object.keys(row.usage)))].map(field => {
  const values = observed.flatMap(row => row.usage[field] === undefined ? [] : [row.usage[field]]);
  return [field, { sum: values.reduce((sum, n) => sum + n, 0), reportedBy: values.length }];
}));
const outputRecord = {
  schema: 'quellight.q4-012.audit@1', result: 'passed',
  model: status.model, routerId: status.routerId, endpoint: status.endpoint, app: status.installed, design: status.design,
  seedArchiveSha256: sha(await readFile(join(runDir, 'seed.private.dump'))),
  sourcePinsSha256: status.sourcePinsSha256, scenariosSha256: status.scenariosSha256,
  routeEvidenceSha256: status.routeEvidenceSha256, blindOrderSha256: status.blindOrderSha256,
  privateKeyCommitment: 'verified', ownerVerdict: 'pending',
  projectedReplies: threads.size, matchedTrios: cells.length, roomCrossChecks: scenarios.order.length,
  preflight: { http200Requests: 2, settledReply: true, observedDeskRevisionAfterAppend: 2, usage: 'unavailable' },
  repetitions,
  totalLiveRequests: 2 + requestRows.length + repetitions.reduce((sum, row) => sum + row.provider.length, 0),
  providerRequests: requestRows.length, sdkSteps: status.finished.reduce((sum, row) => sum + row.steps, 0),
  extraModelSteps: status.finished.reduce((sum, row) => sum + row.steps - 1, 0),
  casesWithExtraSteps: status.finished.filter(row => row.steps > 1).length,
  countsWithUsage: observed.length, availableUsage: totals, observedToolResults: Object.fromEntries(invocationTypes),
  httpStatuses: [...new Set(requestRows.map(row => row.status))],
  providerSettingsSha256: requestRows[0].settingsDigest, normalizedFields: status.normalization, cells,
};
await writeFile(output, JSON.stringify(outputRecord, null, 2) + '\n');
console.log(JSON.stringify({ replies: threads.size, triplets: cells.length, liveRequests: requestRows.length, tokenObservations: observed.length }));
