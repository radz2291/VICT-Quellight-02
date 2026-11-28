import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { arms, digest, sha } from './voices.mjs';
import { matchingModelInput } from './comparison.mjs';

const [evidencePath, privatePath, readerPath] = process.argv.slice(2);
assert.ok(evidencePath && privatePath && readerPath, 'Usage: node audit.mjs EVIDENCE_DIR PRIVATE_CAPTURE_DIR PRIVATE_READER_DIR');
const evidence = resolve(evidencePath);
const read = async (root, name) => JSON.parse(await readFile(join(root, name), 'utf8'));
const scenariosBytes = await readFile(join(evidence, 'scenarios.json'));
const scenarios = JSON.parse(scenariosBytes);
const published = await read(evidence, 'capture.json');
const actual = await read(privatePath, 'installed-capture.private.json');
const voices = await read(privatePath, 'assembled-voices.private.json');
const order = await read(evidence, 'blind-order.json');
const reveal = await read(readerPath, 'reveal-key.private.json');
assert.equal(published.status, 'passed');
assert.equal(published.liveProviderRequests, 0);
assert.equal(published.scenarioSha256, sha(scenariosBytes));
assert.equal(order.scenarioSha256, sha(scenariosBytes));
assert.equal(order.keyCommitment, digest(reveal));
assert.deepEqual(published.sourcePins, actual.sourcePins);
assert.deepEqual(published.rows, actual.captures.map(row => row.publicRow));
assert.equal(published.unmodifiedControlInstructionsSha256, sha(actual.unoverlaid));
assert.equal(published.approvedRoomBlockSha256, sha(actual.approval.block));

const rooms = ['empty', 'approved'];
const armsPerSetup = new Set();
for (const arm of arms) {
  const pin = published.sourcePins.voices[arm];
  assert.equal(pin.sha256, sha(voices[arm]));
  assert.equal(pin.bytes, Buffer.byteLength(voices[arm]));
}
for (const room of rooms) {
  assert.deepEqual(order.sequence.filter(row => row.room === room).map(row => row.case), scenarios.order.map(row => row.id));
  for (const [position, scenario] of scenarios.order.entries()) {
    const readerOrder = order.sequence.find(row => row.room === room && row.case === scenario.id).order;
    assert.deepEqual([...readerOrder].sort(), Object.values(reveal.mapping).sort());
    if (position > 0) {
      const previous = order.sequence.find(row => row.room === room && row.case === scenarios.order[position - 1].id).order;
      assert.deepEqual(readerOrder, [...previous.slice(1), previous[0]]);
    }
    for (const [index, step] of scenario.turns.entries()) {
      const captures = actual.captures.filter(({ publicRow: row }) =>
        row.mode === room && row.caseId === scenario.id && row.step === index + 1);
      assert.deepEqual(captures.map(({ publicRow: row }) => row.arm).sort(), [...arms].sort());
      assert.equal(new Set(captures.map(row => row.thread)).size, arms.length);
      for (const row of captures) {
        const saved = row.publicRow;
        const [system, ...ordinary] = row.prompt;
        const voice = voices[saved.arm];
        assert.ok(system.role === 'system' && system.content.startsWith(voice + '\n'));
        const escaped = JSON.stringify(voice).slice(1, -1);
        assert.equal(JSON.stringify(row.prompt).split(escaped).length, 2);
        assert.equal(saved.voiceOccurrences, 1);
        assert.equal(saved.voiceSha256, sha(voice));
        assert.equal(saved.instructionsSha256, sha(system.content));
        assert.equal(saved.rawOrdinaryMessagesSha256, digest(ordinary));
        assert.equal(saved.rawOptionsSha256, digest(row.modelOptions));
        assert.equal(saved.workingMemoryOccurrences, 1);
        assert.ok(row.user === step.input);
        assert.equal(row.read.revision, room === 'approved' ? actual.approval.revision : null);
        const [binding] = row.record.artifacts.filter(item => item.kind === 'instructions');
        assert.equal(binding.revision, digest({ id: binding.id, text: system.content }));
        assert.equal(saved.instructionsRevision, binding.revision);
        assert.equal(saved.activationVersion, 'v1_' + sha(row.record.canonicalManifest));
        const options = matchingModelInput(ordinary, row.modelOptions, row.thread, saved.recallRevision);
        assert.equal(options.ordinaryMessages, saved.common.ordinaryMessages);
        assert.equal(options.toolSchemasAndOptions, saved.common.toolSchemasAndOptions);
        if (step.fixedReply) assert.ok(row.assistant === step.fixedReply);
        if (index === 0) armsPerSetup.add(row.thread);
      }
      assert.ok(captures.every(row => digest(row.publicRow.common) === digest(captures[0].publicRow.common)));
    }
  }
}
assert.equal(armsPerSetup.size, 42, 'All reading cases require fresh threads');
assert.equal(actual.captures.length, 48);
assert.ok(published.grouped.every(row => row.matchedWithinBothRooms && row.onlyRoomDeltaAcrossModes));
const secretFragments = Object.values(voices).flatMap(voice => voice.split('\n'))
  .map(line => line.trim()).filter(line => line.length >= 40);
const readable = await readFile(join(readerPath, 'owner-reading.private.md'), 'utf8');
for (const arm of arms) assert.ok(!readable.split('\n').includes('#### ' + arm));
for (const entry of await readdir(evidence, { withFileTypes: true })) {
  assert.ok(entry.isFile() && !entry.name.includes('.private.'), 'Private or unexpected publication entry');
  const blob = await readFile(join(evidence, entry.name), 'utf8');
  assert.ok(!blob.includes(reveal.nonce), 'Reveal nonce in ' + entry.name);
  assert.ok(!secretFragments.some(fragment => blob.includes(fragment) || blob.includes(JSON.stringify(fragment).slice(1, -1))),
    'Voice source fragment in ' + entry.name);
  assert.ok(!blob.includes(actual.story.owner.actorId) && !blob.includes(actual.approval.block),
    'Private run identity or exact room block in ' + entry.name);
}
console.log(JSON.stringify({ status: 'passed', freshThreads: armsPerSetup.size, sdkCaptures: actual.captures.length,
  readingGroups: order.sequence.length, privateKeyCommitment: 'verified', publicationScan: 'passed' }));
