import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { markerText, workload } from '../measurement/workload.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const promptBytes = prompt => Buffer.from(JSON.stringify(prompt), 'utf8');
const body = message => {
  if (typeof message.content === 'string') return message.content;
  assert.ok(Array.isArray(message.content));
  return message.content.filter(part => typeof part.text === 'string').map(part => part.text).join('\n');
};

function firstDifference(left, right) {
  let bytes = 0;
  while (bytes < left.length && bytes < right.length && left[bytes] === right[bytes]) bytes++;
  return bytes;
}

function positions(prompt, marker) {
  return prompt.flatMap((message, index) => {
    const text = body(message);
    const found = [];
    for (let offset = text.indexOf(marker); offset !== -1; offset = text.indexOf(marker, offset + marker.length)) {
      found.push({ index, role: message.role, byteOffsetInContent: Buffer.byteLength(text.slice(0, offset), 'utf8') });
    }
    return found;
  });
}

function verifySummary(summary) {
  const prompt = summary.syntheticMessages;
  assert.ok(Array.isArray(prompt) && prompt.length >= 2);
  const raw = promptBytes(prompt);
  assert.equal(summary.sha256, digest(raw));
  assert.equal(summary.bytes, raw.length);
  assert.deepEqual(summary.messages, prompt.map(message => {
    const serialized = promptBytes(message);
    return { role: message.role, bytes: serialized.length, sha256: digest(serialized) };
  }));
  assert.equal(prompt[0].role, 'system');
  assert.equal(prompt.at(-1).role, 'user');
  return prompt;
}

function activationParts(prompt) {
  const firstSystem = body(prompt[0]);
  const deskOffset = firstSystem.indexOf('\n<desk-context>');
  assert.ok(deskOffset > 0 && firstSystem.endsWith('</desk-context>'));
  const head = firstSystem.slice(0, deskOffset);
  const desk = JSON.parse(firstSystem.slice(deskOffset + '\n<desk-context>'.length, -'</desk-context>'.length));
  const at = head.indexOf('\n\n<approved-room-state');
  if (at < 0) {
    assert.equal(head.includes('<approved-room-state'), false);
    return { base: head, desk, block: null };
  }
  const block = head.slice(at + 2);
  const parsed = /^<approved-room-state revision="(r[123])">([^\r\n]+)<\/approved-room-state>$/.exec(block);
  assert.ok(parsed);
  const base = head.slice(0, at);
  assert.equal(base.includes('<approved-room-state'), false);
  assert.ok(base.endsWith('</response-guidance>'));
  return { base, desk, block, revision: parsed[1], payload: JSON.parse(parsed[2]), blockOffset: at + 2 };
}

function comparableDesk(desk) {
  const normalize = values => values.map(({ id, ...fields }) => fields);
  return { carried: normalize(desk.carried), withinReach: normalize(desk.withinReach) };
}

const [, , capturePath] = process.argv;
assert.ok(capturePath, 'Pass the combined short replay capture JSON');
const bytes = await readFile(capturePath);
const capture = JSON.parse(bytes);
assert.equal(capture.schema, 'quellight.q4-009.replay@1');
assert.ok(['started', 'passed'].includes(capture.status), capture.error?.message ?? capture.status);
assert.equal(capture.pins.app, '14b6ccaf6f409eac3e041dc3d9abd0bb9f875344');
assert.equal(capture.pins.design, '9dbfd28175d86b28f9a52340aa4939b4ed11db81');
assert.equal(capture.pins.installLock, '31b606ed8bdffa497bd4621f87877900ed3767f2f0ee0a5681f384e75d75e225');
assert.equal(capture.pins.adapter, '90b2de7c6515785e23b4e6370c92be019959ffca430a7980f6752d5d104c9b2c');
assert.equal(capture.pins.memory, 'f1469f784fbb8385376936e20ad1e89364221f0fe3f53412094955a976527e07');
assert.equal(capture.pins.memoryVersion, '1.28.2');
assert.equal(capture.pins.installedBinding, 'baseline');
assert.equal(capture.pins.victArchiveCount, 14);
assert.equal(capture.pins.node, 'v22.23.5');
assert.equal(capture.liveProviderCalls, 0);
assert.deepEqual(capture.markers, markerText);
const rows = capture.rows.filter(row => row.scenario === 'short');
assert.equal(rows.length, 22);
const armOrder = [...new Set(rows.map(row => row.arm))];
assert.deepEqual(armOrder, capture.study.orders.arms);
const fixtureTurns = new Map(workload.short.map(turn => [turn.caseId, turn]));
const byCase = new Map();
for (const row of rows) {
  assert.ok(['control', 'room-block'].includes(row.arm));
  const pair = byCase.get(row.caseId) ?? new Map();
  assert.ok(!pair.has(row.arm), row.caseId);
  const turn = fixtureTurns.get(row.caseId);
  const prompt = verifySummary(row.prompt);
  const parts = activationParts(prompt);
  assert.equal(prompt[1].role, 'system');
  if (turn) assert.equal(row.inputSha256, digest(turn.input));
  assert.equal(row.inputSha256, digest(body(prompt.at(-1))));
  assert.equal(row.foreground.modelCalls, 1);
  assert.equal(parts.desk.roomId, row.admitted.room_id);
  assert.equal(row.reads.length, row.arm === 'room-block' ? 1 : 0);
  assert.equal(row.foreground.roomSelectionReads, row.reads.length);
  assert.equal(row.foreground.providerUsage, null);

  const expected = row.arm === 'room-block' ? row.expectedRevision : null;
  assert.equal(parts.revision ?? null, expected);
  assert.equal(row.selectedRevision, expected);
  assert.equal(row.blocks.length, expected === null ? 0 : 1);
  if (expected !== null) {
    assert.deepEqual(parts.payload, workload.revisions[expected]);
    assert.equal(row.blocks[0].index, 0);
    assert.equal(row.blocks[0].role, 'system');
    assert.equal(row.blocks[0].revision, expected);
    assert.equal(row.blocks[0].block, parts.block);
    assert.equal(row.blocks[0].offset, parts.blockOffset);
    assert.equal(row.prompt.roomBlockBytes, Buffer.byteLength(parts.block));
  } else {
    assert.equal(row.prompt.roomBlockBytes, 0);
  }
  const hits = Object.fromEntries(Object.entries(markerText).map(([id, marker]) => [id, positions(prompt, marker)]));
  assert.deepEqual(row.prompt.markers, hits);
  for (const [id, places] of Object.entries(hits)) {
    assert.equal(places.filter(place => place.index === 0).length, id === expected ? 1 : 0);
  }
  for (const id of row.confirmedAbsent) assert.deepEqual(hits[id], [], `${row.caseId}:${row.arm}:${id}`);
  if (row.requiredCarry) assert.ok(hits[row.requiredCarry].some(place => place.index > 0));

  if (row.arm === 'room-block') {
    const [read] = row.reads;
    const bindings = {
      actorId: row.ownerId, conversationId: row.thread, roomId: row.admitted.room_id,
      authority: row.admitted.memory_authority_revision, revision: expected,
    };
    for (const [key, value] of Object.entries(bindings)) assert.equal(read[key], value);
    if (expected === null) {
      assert.equal(read.sourceId, null);
      assert.equal(read.resultBytes, 2);
    } else {
      assert.match(read.sourceId, /^[0-9a-f-]{36}$/i);
      assert.equal(read.resultBytes, Buffer.byteLength(JSON.stringify([{ revision: expected, block: parts.block, source_id: read.sourceId }])));
    }
    assert.equal(row.foreground.roomSelectionResultBytes, read.resultBytes);
  }
  pair.set(row.arm, { row, parts, hits, prompt });
  byCase.set(row.caseId, pair);
}

const bytesByCase = [];
for (const [caseId, pair] of byCase) {
  const control = pair.get('control'), candidate = pair.get('room-block');
  assert.ok(control && candidate, caseId);
  assert.equal(control.row.inputSha256, candidate.row.inputSha256);
  assert.equal(control.row.replySha256, candidate.row.replySha256);
  assert.equal(control.row.admitted.memory_settings, candidate.row.admitted.memory_settings);
  assert.equal(control.parts.base, candidate.parts.base);
  assert.deepEqual(comparableDesk(control.parts.desk), comparableDesk(candidate.parts.desk));
  assert.equal(control.row.blocks.length, 0);
  bytesByCase.push({
    caseId, roomBlock: candidate.row.prompt.roomBlockBytes,
    matchedPromptDelta: candidate.row.prompt.bytes - control.row.prompt.bytes,
    extraRoomReads: candidate.row.foreground.roomSelectionReads - control.row.foreground.roomSelectionReads,
    roomReadResult: candidate.row.foreground.roomSelectionResultBytes,
  });
}

const test = name => {
  const picked = byCase.get(name)?.get('room-block');
  assert.ok(picked, name);
  return picked;
};

function validateCare(entry, actionId, story, expectedAuthority, rememberedSource) {
  const { request, receipt, result } = entry;
  assert.equal(request.conversationId, story.evidenceThread);
  assert.equal(request.expectedAuthorityRevision, expectedAuthority);
  assert.deepEqual(JSON.parse(request.sourceMessageIds), rememberedSource ? [rememberedSource] : []);
  assert.equal(receipt.action_id, actionId);
  assert.equal(receipt.state, 'applied');
  assert.equal(receipt.conversation_id, story.evidenceThread);
  assert.equal(receipt.expected_authority_revision, expectedAuthority);
  const argumentDigest = digest(JSON.stringify({ actionId, revision: '1', input: request }));
  assert.equal(receipt.argument_digest, argumentDigest);
  const newAuthority = 'care:' + digest(JSON.stringify([story.owner.actorId, receipt.command_key, argumentDigest]));
  assert.equal(receipt.intended_authority_revision, newAuthority);
  assert.equal(receipt.native_operation_id, 'quellight-care:' + digest(JSON.stringify([story.owner.actorId, receipt.command_key])));
  assert.equal(result.ok, true);
  assert.equal(result.replay, false);
  assert.equal(result.value.authorityRevision, newAuthority);
  return newAuthority;
}

const witness = [];
for (const arm of ['control', 'room-block']) {
  const matching = capture.evidence.filter(entry => entry.mode === 'short' && entry.arm === arm);
  assert.equal(matching.length, 1, arm);
  const [{ story, approvals, care, reopens, maintenance, excludedSource, seed, runtimeEdits, status }] = matching;
  assert.equal(status, 'passed');
  assert.deepEqual(runtimeEdits, arm === 'room-block' ? ['activation', 'service'] : []);
  assert.equal(new Set([story.thread, story.freshThread, story.otherThread, story.evidenceThread]).size, 4);
  assert.deepEqual(rows.filter(row => row.arm === arm).map(row => row.caseId), [
    'short-first', 'short-repeat', 'short-reopen', 'short-fresh', 'short-other-room', 'short-post-compaction',
    'short-changed', 'short-reopen-r2', 'short-after-correction', 'short-repeat-r3', 'short-after-exclusion',
  ]);
  const [r1, r2, r3] = approvals;
  assert.deepEqual(approvals.map(record => record.revision), ['r1', 'r2', 'r3']);
  assert.equal(new Set(approvals.map(record => record.sourceId)).size, 1);
  assert.equal(seed.thread, story.evidenceThread);
  assert.equal(seed.ownerId, story.owner.actorId);
  assert.equal(seed.admitted.room_id, story.roomId);
  assert.equal(seed.admitted.memory_authority_revision, r1.authority);
  for (const approval of approvals) {
    assert.equal(approval.roomId, story.roomId);
    assert.equal(approval.sourceThread, story.evidenceThread);
    if (approval.source) {
      assert.equal(approval.source.id, approval.sourceId);
      assert.equal(approval.source.role, 'user');
      assert.equal(approval.source.conversationId, approval.sourceThread);
      assert.equal(approval.source.excluded, false);
    }
  }
  assert.equal(care.length, 3);
  assert.equal(validateCare(care[0], 'memory.correct', story, r1.authority), r2.authority);
  assert.equal(validateCare(care[1], 'memory.correct', story, r2.authority), r3.authority);
  const newAuthority = validateCare(care[2], 'memory.forget', story, r3.authority, r3.sourceId);
  assert.deepEqual(excludedSource, { id: r3.sourceId, authority: newAuthority, excluded: true });
  assert.deepEqual(reopens.map(({ after, thread }) => [after, thread]), [
    ['short-repeat', story.thread], ['short-changed', story.thread],
  ]);
  assert.ok(reopens.every(entry => JSON.stringify(entry.priorRuntimeEdits) === JSON.stringify(runtimeEdits)));

  const atArm = name => byCase.get(name).get(arm);
  const relevant = {
    'short-first': r1, 'short-repeat': r1, 'short-reopen': r1, 'short-fresh': r1, 'short-post-compaction': r1,
    'short-changed': r2, 'short-reopen-r2': r2, 'short-after-correction': r3, 'short-repeat-r3': r3,
  };
  for (const [name, approval] of Object.entries(relevant)) {
    const { row, parts } = atArm(name);
    assert.equal(row.ownerId, story.owner.actorId);
    assert.equal(row.thread, name === 'short-fresh' ? story.freshThread : story.thread);
    assert.equal(row.admitted.room_id, story.roomId);
    assert.equal(row.admitted.memory_authority_revision, approval.authority);
    assert.equal(row.expectedRevision, approval.revision);
    if (arm === 'room-block') {
      assert.equal(row.reads[0].sourceId, approval.sourceId);
      assert.equal(parts.block, approval.block);
    }
  }
  assert.notEqual(story.thread, story.freshThread);
  const other = atArm('short-other-room');
  assert.equal(other.row.thread, story.otherThread);
  assert.equal(other.row.admitted.room_id, story.otherRoomId);
  assert.notEqual(story.otherRoomId, story.roomId);
  assert.ok(Object.values(other.hits).every(hit => hit.length === 0));
  assert.equal(other.parts.block, null);

  const reopened = atArm('short-reopen-r2');
  assert.ok(reopened.hits.r2.some(hit => hit.index > 0 && hit.role === 'assistant'));
  assert.deepEqual(reopened.hits.r1, []);
  assert.equal(reopened.row.admitted.activation_version, atArm('short-changed').row.admitted.activation_version);
  assert.notEqual(reopened.row.admitted.activation_version, atArm('short-reopen').row.admitted.activation_version);
  const compact = atArm('short-post-compaction');
  assert.ok(compact.hits.r1.some(hit => hit.index > 0 && hit.role === 'system'));
  assert.equal(maintenance.length, 1);
  const reflection = maintenance[0].reflection;
  assert.equal(reflection.operationId, 'memory-job:' + reflection.jobId);
  assert.equal(reflection.authority, r1.authority);
  assert.ok(reflection.observations.includes(markerText.r1));
  assert.equal(atArm('short-repeat').row.echo, 'r1');
  assert.equal(atArm('short-changed').row.echo, 'r2');
  assert.deepEqual(atArm('short-changed').hits.r1, []);
  assert.equal(atArm('short-after-correction').row.echo, 'r3');
  assert.deepEqual(atArm('short-after-correction').hits.r1, []);
  assert.deepEqual(atArm('short-after-correction').hits.r2, []);
  const carried = atArm('short-repeat-r3');
  assert.ok(carried.hits.r3.some(hit => hit.index > 0 && hit.role === 'assistant'));
  assert.deepEqual(carried.hits.r2, []);
  const excluded = atArm('short-after-exclusion');
  assert.equal(excluded.row.admitted.memory_authority_revision, newAuthority);
  assert.equal(excluded.row.thread, story.thread);
  assert.equal(excluded.row.admitted.room_id, story.roomId);
  assert.equal(excluded.parts.block, null);
  assert.ok(Object.values(excluded.hits).every(hit => hit.length === 0));

  witness.push({ arm, actorId: story.owner.actorId, roomId: story.roomId,
    reopenedR2: { turnId: reopened.row.turnId, conversationId: story.thread, revision: reopened.parts.revision ?? null,
      authority: r2.authority, approvedSource: r2.sourceId, promptSha256: reopened.row.prompt.sha256,
      activationVersion: reopened.row.admitted.activation_version, markerPositions: reopened.hits.r2 },
    forget: { originalId: r3.sourceId, approvalAuthority: r3.authority, currentAuthority: newAuthority,
      commandKey: care[2].receipt.command_key, argumentDigest: care[2].receipt.argument_digest,
      before: carried.hits.r3, after: excluded.hits.r3, excludedTurnId: excluded.row.turnId,
      fallbackPromptSha256: excluded.row.prompt.sha256, selectedRevision: excluded.row.selectedRevision },
    compactedCarry: { observationOperationId: reflection.operationId, markerPositions: compact.hits.r1 },
  });
}

const first = test('short-first'), repeat = test('short-repeat'), reopen = test('short-reopen'), fresh = test('short-fresh');
assert.ok([repeat, reopen, fresh, test('short-post-compaction')].every(entry => entry.parts.block === first.parts.block));
const changed = test('short-changed'), reopened = test('short-reopen-r2');
assert.equal(changed.parts.block, reopened.parts.block);
assert.notEqual(first.parts.block, changed.parts.block);
assert.equal(first.parts.base, changed.parts.base);
assert.equal(first.parts.blockOffset, changed.parts.blockOffset);
const currentSdkPrefixBytes = firstDifference(promptBytes(changed.prompt), promptBytes(reopened.prompt));
const changedSdkPrefixBytes = firstDifference(promptBytes(first.prompt), promptBytes(changed.prompt));
assert.ok(currentSdkPrefixBytes > changedSdkPrefixBytes);

console.log(JSON.stringify({ captureSha256: digest(bytes), captureStatus: capture.status, pins: capture.pins, armOrder, syntheticPairedCases: byCase.size,
  localPrompt: { stableR1Bytes: Buffer.byteLength(first.parts.block), changedR2Bytes: Buffer.byteLength(changed.parts.block),
    activeRoomBlockOffsetUtf8: Buffer.byteLength(first.parts.base + '\n\n'), sameRevisionPrefixBytes: currentSdkPrefixBytes,
    changedRevisionPrefixBytes: changedSdkPrefixBytes, bytesByCase }, independentlyChecked: witness }, null, 2));
