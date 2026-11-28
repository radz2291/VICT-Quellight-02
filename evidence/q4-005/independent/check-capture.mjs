import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const [capturePath, fixturePath] = process.argv.slice(2);
assert.ok(capturePath && fixturePath, 'Pass the installed capture and frozen fixture');
const fixtureFile = await readFile(fixturePath);
const fixture = JSON.parse(fixtureFile);
const capture = JSON.parse(await readFile(capturePath, 'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');
assert.equal(capture.schema, 'quellight.q4-005.installed-replay@1');
assert.equal(capture.status, 'passed', capture.error?.message);
assert.equal(capture.fixtureCommit, 'b588e6ffcd1b648fb42bd20bd8e6909db4db9ed5');
assert.equal(capture.fixtureSha256, sha(fixtureFile));
assert.equal(capture.appSha, '14b6ccaf6f409eac3e041dc3d9abd0bb9f875344');
assert.equal(capture.designSha, '9dbfd28175d86b28f9a52340aa4939b4ed11db81');
assert.equal(capture.node, 'v22.23.5');
assert.equal(capture.lockSha, '31b606ed8bdffa497bd4621f87877900ed3767f2f0ee0a5681f384e75d75e225');
assert.equal(capture.archives.length, 14);
assert.equal(capture.archives.find(row => row.name === '@victframework/mastra')?.sha256,
  '90b2de7c6515785e23b4e6370c92be019959ffca430a7980f6752d5d104c9b2c');
assert.deepEqual(capture.shadowSqlRole, { can_insert: false, can_rewrite: false, namespaceUpdateBlocked: true });

const { actorId, roomId, foreignRoomId, threads } = capture.scope;
assert.notEqual(roomId, foreignRoomId);
assert.equal(new Set(Object.values(threads)).size, 3);
const chosen = (list, key, id) => {
  const rows = list.filter(row => row[key] === id);
  assert.equal(rows.length, 1, id);
  return rows[0];
};
const parts = phase => capture.reads[phase];
const read = (phase, id) => chosen(parts(phase), 'caseId', id);
const history = id => chosen(capture.observations, 'caseId', id);
const settle = id => chosen(capture.settlements, 'caseId', id);
const receiptFor = id => chosen(capture.receiptAudit.receipts, 'caseId', id);
const observations = new Map();
const receiptIds = new Set();

for (const source of fixture.turns) {
  const witness = settle(source.id);
  const instance = history(source.id);
  const { operation } = instance;
  const { receipt, maintenanceTurnId, request } = receiptFor(source.id);
  assert.equal(witness.conversationId, threads[source.thread]);
  assert.equal(witness.status, 'completed');
  assert.equal(witness.projectionSettled, true);
  assert.equal(witness.assistantText, source.assistant);
  assert.equal(witness.assistantId, witness.turnId + ':assistant');
  assert.equal(witness.operationId, 'memory-job:' + witness.jobId);
  assert.equal(operation.operation_id, witness.operationId);
  assert.equal(operation.thread_id, 'vict-conv-' + witness.conversationId);
  assert.equal(operation.resource_id, 'vict-actor-' + actorId);
  assert.equal(operation.status, 'completed');
  assert.equal(operation.kind, 'observe');
  assert.equal(operation.result.operationId, witness.operationId);
  assert.equal(operation.result.observed, true);
  assert.equal(operation.result.snapshot.conversationId, witness.conversationId);
  assert.equal(operation.result.snapshot.resourceId, operation.resource_id);
  assert.equal(operation.result.snapshot.authorityRevision, operation.authority_revision);
  assert.equal(operation.result.sourceRevision, operation.source_digest);
  const prepared = operation.events.filter(event => event.name === 'prepared');
  const published = operation.events.filter(event => event.name === 'published');
  assert.equal(prepared.length, 1);
  assert.equal(published.length, 1);
  assert.ok(Date.parse(prepared[0].at) <= Date.parse(published[0].at));
  assert.deepEqual(instance.activity.map(event => event.state), ['queued', 'running', 'completed']);
  assert.ok(instance.activity.every(event => event.job_id === witness.jobId));
  assert.ok(Date.parse(witness.queuedAt) <= Date.parse(published[0].at));
  assert.equal(receipt.actorId, actorId);
  assert.equal(receipt.turnId, maintenanceTurnId);
  assert.notEqual(receipt.turnId, witness.turnId);
  assert.equal(receipt.capabilityId, 'quellight.memory.maintain');
  assert.equal(receipt.capabilityRevision, '1');
  assert.equal(receipt.effect, 'write');
  assert.equal(receipt.status, 'completed');
  assert.ok(!receiptIds.has(receipt.invocationId));
  receiptIds.add(receipt.invocationId);
  const argumentsFromOperation = {
    actorId, authorityRevision: operation.authority_revision,
    configurationRevision: operation.configuration_revision, conversationId: witness.conversationId,
    kind: 'observe', operationId: witness.operationId, sourceRevision: operation.source_digest,
  };
  assert.deepEqual(request, argumentsFromOperation);
  // Every member is a string and fields above are lexicographically ordered.
  // This independently reproduces the bridge's strict canonical digest.
  const calculated = sha(JSON.stringify(argumentsFromOperation));
  assert.equal(receipt.argDigest, calculated, source.id);
  observations.set(source.id, { operationId: witness.operationId,
    observationId: operation.result.snapshot.current.id, publishedAt: published[0].at,
    receiptId: receipt.invocationId, argumentDigest: calculated });
}

let accepted = 0;
for (const phase of ['before', 'after']) {
  assert.deepEqual(parts(phase).map(row => row.caseId), fixture.expected[phase].map(row => row.case));
  for (const expected of fixture.expected[phase]) {
    const row = read(phase, expected.case);
    assert.equal(row.conversationId, threads[expected.thread]);
    assert.equal(row.refusal, expected.refusal);
    assert.deepEqual(row.accepted.map(claim => claim.span.text), expected.accepted);
    assert.deepEqual(row.unknown.map(claim => claim.text), expected.unknown ?? []);
    assert.equal(row.metrics.namedReads, row.reads.length);
    assert.equal(row.metrics.namedResultBytes, row.reads.reduce((sum, entry) => sum + entry.resultBytes, 0));
    for (const claim of row.accepted) {
      assert.equal(claim.conversationId, row.conversationId);
      assert.equal(claim.authorityRevision, row.currentAuthorityRevision);
      assert.equal(claim.role, 'user');
      assert.equal(claim.sourceText.slice(claim.span.start, claim.span.end), claim.span.text);
      const source = chosen(row.sourcePage.rows, 'id', claim.sourceId);
      assert.equal(source.conversationId, row.conversationId);
      assert.equal(source.role, 'user');
      assert.equal(source.excluded, false);
      const range = chosen(row.ranges, 'groupId', claim.groupId);
      const positions = [range.first, claim.sourceId, range.last].map(id => row.sourcePage.rows.findIndex(item => item.id === id));
      assert.ok(positions[0] >= 0 && positions[0] <= positions[1] && positions[1] <= positions[2]);
      assert.ok(!row.exclusions.excluded.includes(claim.sourceId));
      assert.ok(!row.exclusions.quarantined.includes(claim.sourceId));
      accepted++;
    }
  }
}
assert.equal(accepted, 4);

const first = read('before', 'original');
const original = first.accepted[0];
assert.equal(capture.care.originalConversationId, threads.A);
assert.equal(capture.care.correctionConversationId, threads.B);
assert.equal(capture.care.excludedId, original.sourceId);
assert.equal(capture.care.fromRevision, original.authorityRevision);
assert.notEqual(capture.care.authorityRevision, original.authorityRevision);

const stale = ['original-stale', 'layout-stale', 'accessibility-stale'].map(caseId => read('after', caseId));
for (const [index, old] of stale.entries()) {
  const observed = history(['original', 'layout', 'accessibility'][index]).operation;
  assert.equal(old.operation.id, observed.operation_id);
  assert.equal(old.operation.authorityRevision, observed.authority_revision);
  assert.equal(old.currentAuthorityRevision, capture.care.authorityRevision);
  assert.equal(old.operation.status, 'superseded');
  assert.equal(old.operation.resultPresent, false);
  assert.equal(old.operation.checkpointPresent, false);
  assert.equal(old.accepted.length, 0);
  assert.deepEqual(old.operation.events, observed.events);
  assert.ok(old.exclusions.excluded.includes(original.sourceId));
  assert.ok(old.reads.every(entry => entry.port !== 'app.memorySourcePage'));
}

const layoutClause = 'Keep the page number on every page.';
const layoutRead = read('before', 'layout');
assert.ok(layoutRead.accepted[0].sourceText.includes(layoutClause));
assert.ok(!layoutRead.operation.observation.includes(layoutClause));
assert.ok(layoutRead.ranges.length >= 2);
const layoutResult = chosen(capture.comparison.before, 'caseId', 'layout');
assert.deepEqual(layoutResult.omissions, [{
  text: layoutClause, sourceId: layoutRead.accepted[0].sourceId,
  start: layoutRead.accepted[0].sourceText.indexOf(layoutClause), authorityRevision: layoutRead.currentAuthorityRevision,
}]);

const correctionFixture = chosen(fixture.turns, 'id', 'correction');
const correction = read('after', 'correction');
const [newClaim] = correction.accepted;
const [newAssertion] = correctionFixture.observed;
assert.equal(newClaim.sourceText, correctionFixture.user);
assert.equal(newClaim.span.start, correctionFixture.user.indexOf(newAssertion));
assert.equal(newClaim.span.end, newClaim.span.start + newAssertion.length);
assert.equal(newClaim.authorityRevision, capture.care.authorityRevision);
assert.equal(correction.operation.id, settle('correction').operationId);
assert.equal(correction.operation.threadId, 'vict-conv-' + threads.B);
assert.equal(correction.structuredSourceMembership, 'field-absent');
const foreign = read('before', 'foreign-room');
const foreignSource = capture.foreignControlSource;
assert.equal(foreign.scope.roomId, foreignRoomId);
assert.equal(foreign.conversationId, threads.C);
assert.equal(foreign.accepted.length, 0);
assert.deepEqual(foreign.reads.map(entry => entry.port), ['app.getConversation']);
assert.equal(foreignSource.conversationId, threads.C);
assert.equal(foreignSource.role, 'user');
assert.equal(foreignSource.text, newClaim.sourceText);
assert.notEqual(foreignSource.id, newClaim.sourceId);
assert.ok(correction.sourcePage.rows.every(row => row.id !== foreignSource.id));
const priorSeat = read('before', 'accessibility').accepted[0];
const rebuilt = capture.rebuildWitness;
assert.equal(rebuilt.conversationId, threads.B);
assert.equal(rebuilt.currentAuthorityRevision, capture.care.authorityRevision);
assert.equal(rebuilt.operation.status, 'completed');
assert.equal(rebuilt.operation.events.filter(event => event.name === 'published').length, 1);
assert.equal(rebuilt.accepted.length, 1);
const [rebuiltClaim] = rebuilt.accepted;
assert.equal(rebuiltClaim.sourceId, priorSeat.sourceId);
assert.equal(rebuiltClaim.authorityRevision, rebuilt.currentAuthorityRevision);
assert.deepEqual(rebuiltClaim.span, priorSeat.span);
const rebuiltRange = chosen(rebuilt.ranges, 'groupId', rebuiltClaim.groupId);
assert.equal(rebuiltRange.disposition, 'bounded-single-message-range');
assert.equal(rebuiltRange.first, priorSeat.sourceId);
assert.equal(rebuiltRange.last, priorSeat.sourceId);
assert.deepEqual(rebuiltRange.eligibleEndpointIds, [priorSeat.sourceId]);
assert.equal(chosen(correction.ranges, 'groupId', rebuiltClaim.groupId).disposition, 'previous-range');
for (const field of ['shadowModelCalls', 'liveProviderCalls', 'addedSendRoundTrips', 'addedForegroundPromptBytes']) {
  assert.equal(capture.resource[field], 0);
}
const totals = rows => ({ attempts: rows.length,
  namedReads: rows.reduce((sum, row) => sum + row.metrics.namedReads, 0),
  namedResultBytes: rows.reduce((sum, row) => sum + row.metrics.namedResultBytes, 0),
  postgresBytesSent: rows.reduce((sum, row) => sum + row.metrics.postgresWire.sent, 0),
  postgresBytesReceived: rows.reduce((sum, row) => sum + row.metrics.postgresWire.received, 0),
});
const report = {
  source: 'Independent verification of installed local fixture capture',
  fixtureCommit: capture.fixtureCommit, fixtureSha256: capture.fixtureSha256,
  appSha: capture.appSha, designSha: capture.designSha,
  accepted, receiptsChecked: receiptIds.size, observations: Object.fromEntries(observations),
  correction: {
    conversationId: correction.conversationId, sourceId: newClaim.sourceId, role: newClaim.role, span: newClaim.span,
    authorityRevision: newClaim.authorityRevision, foreignConversationId: foreign.conversationId,
    sameTextForeignSourceId: foreignSource.id,
    range: chosen(correction.ranges, 'groupId', newClaim.groupId),
  },
  stale: {
    originalExcludedId: original.sourceId, prevAuthority: original.authorityRevision, newAuthority: capture.care.authorityRevision,
    rows: stale.map(row => ({ caseId: row.caseId, operationId: row.operationId,
      state: row.operation.status, accepted: row.accepted.length })),
  },
  verifiedOmission: layoutClause,
  verifiedUnknown: correction.unknown.map(item => item.text),
  supplementalRebuild: { sourceId: rebuiltClaim.sourceId, span: rebuiltClaim.span,
    authorityRevision: rebuiltClaim.authorityRevision, range: rebuiltRange, repeatedInCorrection: 'previous-range' },
  shadowReadTotals: { before: totals(parts('before')), after: totals(parts('after')), supplemental: totals([rebuilt]) },
  resource: capture.resource,
};
console.log(JSON.stringify(report, null, 2));
