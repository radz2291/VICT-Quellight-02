import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const [candidatePath, fixturePath, baselinePath] = process.argv.slice(2);
assert.ok(candidatePath && fixturePath && baselinePath, 'Pass candidate capture, Harbor fixture and Q4-006 baseline capture');
const fixtureBytes = await readFile(fixturePath);
const fixture = JSON.parse(fixtureBytes);
const candidateBytes = await readFile(candidatePath);
const baselineBytes = await readFile(baselinePath);
const candidate = JSON.parse(candidateBytes);
const baseline = JSON.parse(baselineBytes);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtureHash = sha(fixtureBytes);
assert.equal(baseline.status, 'passed');
assert.equal(candidate.status, 'passed', candidate.error?.message);
assert.equal(candidate.schema, 'quellight.q4-007.installed-replay@1');
assert.equal(baseline.fixtureSha256, fixtureHash);
assert.equal(candidate.fixtureSha256, fixtureHash);
assert.equal(candidate.appSha, baseline.appSha);
assert.equal(candidate.designSha, baseline.designSha);
assert.equal(candidate.node, 'v22.23.5');
const pick = (rows, label) => {
  const values = rows.filter(row => row.label === label);
  assert.equal(values.length, 1, label);
  return values[0];
};
const frozen = new Map(fixture.turns.flatMap(turn => [
  ['SYN_U' + turn.id, { text: turn.user, role: 'user' }],
  ['SYN_A' + turn.id, { text: turn.assistant, role: 'assistant' }],
]));
const observe = [...fixture.observe, fixture.rebuild];
const reflect = [fixture.reflectBefore, fixture.reflectAfter];
const { actorId, conversationId } = candidate.scope;
const before = pick(candidate.inventories, 'before-close');
const after = pick(candidate.inventories, 'after-forget-before-rebuild');
const sourceIds = new Map();
for (const inventory of candidate.inventories) {
  for (const source of inventory.orderedOriginals) {
    assert.deepEqual({ text: source.text, role: source.role }, frozen.get(source.tag));
    assert.equal(source.conversationId, conversationId);
    if (sourceIds.has(source.tag)) assert.equal(sourceIds.get(source.tag), source.id);
    else sourceIds.set(source.tag, source.id);
  }
}
assert.deepEqual(before.orderedOriginals.map(row => row.tag), [...frozen.keys()]);
assert.deepEqual(after.orderedOriginals.map(row => row.id), before.orderedOriginals.map(row => row.id));
assert.deepEqual(after.orderedOriginals.filter(row => !row.excluded).map(row => row.tag), fixture.rebuild.expectedTags);
const forgottenId = sourceIds.get(fixture.forgetTag);
assert.equal(candidate.care.targetId, forgottenId);
assert.equal(candidate.care.authorityRevision, after.authorityRevision);
assert.notEqual(before.authorityRevision, after.authorityRevision);
assert.equal(after.orderedOriginals.find(source => source.id === forgottenId).excluded, true);

const inputMembers = new Map();
for (const plan of observe) {
  const sample = pick(candidate.models, plan.id);
  assert.equal(sample.role, 'observe');
  const readTags = [...sample.promptSection.matchAll(/SYN_[UA]\d{2}/g)].map(match => match[0]);
  assert.deepEqual(readTags, plan.expectedTags);
  const inventory = plan.id === fixture.rebuild.id ? after : pick(candidate.inventories, 'before-' + plan.id);
  assert.equal(sample.authorityRevision, inventory.authorityRevision);
  const byTag = new Map(inventory.orderedOriginals.filter(source => !source.excluded).map(source => [source.tag, source.id]));
  assert.ok(readTags.every(tag => byTag.has(tag)));
  inputMembers.set(plan.id, { role: 'observe', tags: readTags, ids: readTags.map(tag => byTag.get(tag)) });
}
for (const plan of reflect) {
  const sample = pick(candidate.models, plan.id);
  assert.equal(sample.role, 'reflect');
  const inLines = sample.promptSection.split(/\r?\n/);
  const outLines = sample.reply.split(/\r?\n/).filter(line => line.startsWith('- '));
  const parents = plan.inputParents.map(label => ({ label, text: '- ' + observe.find(row => row.id === label).note }));
  assert.ok(parents.every(parent => inLines.includes(parent.text)));
  const selected = parents.filter(parent => outLines.includes(parent.text));
  assert.deepEqual(selected.map(parent => parent.label), plan.retainedParents);
  assert.deepEqual(outLines, selected.map(parent => parent.text));
  const tags = [...new Set(selected.flatMap(parent => inputMembers.get(parent.label).tags))];
  inputMembers.set(plan.id, { role: 'reflect', tags, ids: tags.map(tag => sourceIds.get(tag)) });
}
const oldOuter = pick(baseline.comparisons, fixture.reflectBefore.id);
const oldOuterPublication = pick(baseline.publications, fixture.reflectBefore.id);
const oldOriginals = pick(baseline.inventories, 'before-close').orderedOriginals;
const oldSourceTags = new Map(oldOriginals.map(row => [row.id, row.tag]));
const newSourceTags = new Map([...sourceIds].map(([tag, id]) => [id, tag]));
const [first, last] = oldOuterPublication.group.range.split(':');
const firstIndex = oldOriginals.findIndex(source => source.id === first);
const lastIndex = oldOriginals.findIndex(source => source.id === last);
assert.ok(firstIndex >= 0 && firstIndex <= lastIndex);
const baselineInterval = oldOriginals.slice(firstIndex, lastIndex + 1).filter(source => !source.excluded);
assert.deepEqual(baselineInterval.map(row => row.id), oldOuter.apparentEligibleIds);
const outerTags = new Set(inputMembers.get(fixture.reflectBefore.id).tags);
const omittedTags = baselineInterval.filter(source => !outerTags.has(source.tag)).map(source => source.tag);
assert.deepEqual(omittedTags, oldOuter.extras.map(id => oldSourceTags.get(id)));
assert.deepEqual(omittedTags, fixture.expectations.reflectionInteriorOverinclusionTags);
assert.equal(baselineInterval.length, 10);
assert.deepEqual(oldOuterPublication.operation.result.sourceMembership, undefined);
assert.deepEqual(oldOuter.acceptedIds, []);
function normalizeObservation(text, idToTag) {
  for (const [id, tag] of idToTag) text = text.replaceAll(id, tag);
  return text.replace(/(<observation-group id=")[^"]+/g, '$1GROUP')
    .replace(/--- message boundary \([^\n]+\) ---/g, '--- message boundary ---');
}

const members = [];
const inheritedFrom = new Map();
const invocationIds = new Set();
for (const [label, expected] of inputMembers) {
  const { operation, group } = pick(candidate.publications, label);
  assert.equal(operation.status, 'completed');
  assert.equal(operation.kind, expected.role);
  assert.equal(operation.authority_revision, pick(candidate.models, label).authorityRevision);
  assert.equal(operation.thread_id, 'vict-conv-' + conversationId);
  assert.equal(operation.resource_id, 'vict-actor-' + actorId);
  assert.equal(operation.result.operationId, operation.operation_id);
  assert.equal(operation.result.configurationRevision, operation.configuration_revision);
  assert.equal(operation.result.sourceRevision, operation.source_digest);
  assert.equal(operation.result.snapshot.authorityRevision, operation.authority_revision);
  assert.equal(operation.events.filter(event => event.name === 'published').length, 1);
  const oldObservations = pick(baseline.publications, label).operation.result.snapshot.current.observations;
  assert.equal(normalizeObservation(operation.result.snapshot.current.observations, newSourceTags),
    normalizeObservation(oldObservations, oldSourceTags));
  const membership = operation.result.sourceMembership;
  assert.equal(membership.schema, 'vict.mastra-observation-membership@1');
  assert.equal(new Set(membership.groups.map(row => row.groupId)).size, membership.groups.length);
  const publishedIds = [...operation.result.snapshot.current.observations.matchAll(/<observation-group\s+[^>]*\bid="([^"]+)"/g)]
    .map(match => match[1]);
  assert.deepEqual(membership.groups.map(row => row.groupId), publishedIds);
  const [member] = membership.groups.filter(row => row.groupId === group.id);
  const expectedBasis = expected.role === 'observe' ? 'observe-input' : 'retained-parents';
  assert.equal(member.status, 'available', label);
  assert.equal(member.basis, expectedBasis);
  assert.deepEqual(member.messageIds, expected.ids);
  assert.equal(new Set(member.messageIds).size, member.messageIds.length);
  if (expected.role === 'observe') {
    const inherited = inheritedFrom.get(operation.authority_revision) ?? [];
    assert.deepEqual(membership.groups, [...inherited, member]);
    inheritedFrom.set(operation.authority_revision, membership.groups);
  } else assert.deepEqual(membership.groups, [member]);
  const read = pick(candidate.consumerReads, label);
  assert.equal(read.operation.id, operation.operation_id);
  assert.deepEqual(read.operation.sourceMembership, membership);
  assert.equal(read.operation.containsMembershipInPrivateFields, false);
  assert.equal(read.disposition, 'typed-publication');
  const groupRead = read.groups.find(item => item.groupId === group.id);
  assert.deepEqual(groupRead.acceptedIds, expected.ids);
  assert.ok(read.reads.every(item => item.port !== 'app.memorySourcePage'));
  const { sourceMembership: _sourceMembership, ...withoutMembership } = operation.result;
  const bytes = Buffer.byteLength(JSON.stringify(operation)) -
    Buffer.byteLength(JSON.stringify({ ...operation, result: withoutMembership }));
  assert.equal(read.operationMembershipDeltaBytes, bytes, label);
  if (label === fixture.reflectBefore.id) {
    assert.equal(member.messageIds.length, 8);
    assert.ok(omittedTags.every(tag => !member.messageIds.includes(sourceIds.get(tag))));
  }
  if (operation.authority_revision === after.authorityRevision) {
    assert.equal(member.messageIds.length, 4);
    assert.ok(!member.messageIds.includes(forgottenId));
  }
  const request = {
    actorId, authorityRevision: operation.authority_revision, configurationRevision: operation.configuration_revision,
    conversationId, kind: operation.kind, operationId: operation.operation_id, sourceRevision: operation.source_digest,
  };
  const receipt = pick(candidate.receiptAudit.receipts, label);
  assert.deepEqual(receipt.request, request);
  const digest = sha(JSON.stringify(request));
  assert.equal(receipt.invocation.argDigest, digest);
  assert.equal(receipt.invocation.actorId, actorId);
  assert.equal(receipt.invocation.turnId, receipt.maintenanceTurnId);
  assert.equal(receipt.invocation.capabilityId, 'quellight.memory.maintain');
  assert.equal(receipt.invocation.capabilityRevision, '1');
  assert.equal(receipt.invocation.status, 'completed');
  assert.ok(!invocationIds.has(receipt.invocation.invocationId));
  invocationIds.add(receipt.invocation.invocationId);
  members.push({ label, groupId: group.id, operationId: operation.operation_id, authority: operation.authority_revision,
    sourceTags: expected.tags, orderedNativeIds: member.messageIds, basis: member.basis,
    receiptId: receipt.invocation.invocationId, receiptArgumentDigest: digest });
}
assert.equal(invocationIds.size, 6);

const stale = ['old-observe', 'old-reflect'].map(label => {
  const read = pick(candidate.consumerReads, label);
  assert.equal(read.operation.status, 'superseded');
  assert.equal(read.operation.resultPresent, false);
  assert.equal(read.operation.checkpointPresent, false);
  assert.equal(read.operation.sourceMembership, null);
  assert.equal(read.operation.containsMembershipInPrivateFields, false);
  assert.equal(read.authority.revision, after.authorityRevision);
  assert.deepEqual(read.acceptedIds, []);
  return { label, operationId: read.operationId, acceptedIds: [] };
});
const controls = candidate.controls;
const firstReflectRead = pick(candidate.consumerReads, fixture.reflectAfter.id);
const reopened = pick(controls.reads, 'reopened-reflect');
assert.equal(reopened.operation.id, firstReflectRead.operation.id);
assert.deepEqual(reopened.operation.sourceMembership, firstReflectRead.operation.sourceMembership);
assert.deepEqual(reopened.acceptedIds, firstReflectRead.acceptedIds);
assert.deepEqual(reopened.operation.publicationEvents, firstReflectRead.operation.publicationEvents);

function unavailable(read) {
  const fields = read.operation.sourceMembership;
  assert.equal(fields.schema, 'vict.mastra-observation-membership@1');
  assert.ok(fields.groups.length > 0);
  assert.ok(fields.groups.every(group => group.status === 'unavailable' && !Object.hasOwn(group, 'messageIds')));
  assert.deepEqual(read.acceptedIds, []);
}
const legacy = pick(controls.reads, 'legacy-without-field');
assert.equal(pick(controls.fixtureAuthoredRecords, legacy.label).resultHasMembership, false);
unavailable(legacy);
const prepared = pick(controls.reads, 'prepared-with-private-members');
assert.equal(pick(controls.fixtureAuthoredRecords, prepared.label).privateCheckpointHasMembership, true);
assert.equal(prepared.operation.status, 'prepared');
assert.equal(prepared.operation.sourceMembership, null);
assert.equal(prepared.operation.containsMembershipInPrivateFields, false);
assert.equal(prepared.operation.resultPresent, false);
assert.deepEqual(prepared.acceptedIds, []);

const ambiguous = pick(controls.reads, 'ambiguous-ordinal-control');
const ambiguousPub = pick(candidate.publications, ambiguous.label);
const ambiguousTrace = pick(candidate.models, ambiguous.label);
const prior = pick(candidate.publications, fixture.reflectAfter.id).group;
assert.equal(ambiguousPub.group.range, prior.range);
assert.ok(ambiguousTrace.promptSection.includes(prior.body));
assert.ok(!ambiguousTrace.reply.includes(prior.body));
unavailable(ambiguous);
assert.equal(controls.extraDeterministicReflectCalls, 1);
const comparable = new Set([...fixture.turns.map(turn => turn.id), ...inputMembers.keys()]);
const modelCalls = capture => Object.fromEntries(['chat', 'observe', 'reflect']
  .map(role => [role, capture.models.filter(model => model.role === role && comparable.has(model.label)).length]));
assert.deepEqual(modelCalls(candidate), modelCalls(baseline));
assert.equal(candidate.resource.consumerModelCalls, 0);
assert.equal(candidate.resource.liveProviderCalls, 0);
const totals = capture => ({
  attempts: capture.consumerReads.length,
  namedReads: capture.consumerReads.reduce((sum, row) => sum + row.metrics.namedReads, 0),
  namedBytes: capture.consumerReads.reduce((sum, row) => sum + row.metrics.namedBytes, 0),
  sent: capture.consumerReads.reduce((sum, row) => sum + row.metrics.postgresWire.sent, 0),
  received: capture.consumerReads.reduce((sum, row) => sum + row.metrics.postgresWire.received, 0),
});
const membershipOnlyJsonBytes = candidate.consumerReads.reduce((sum, row) => sum + row.operationMembershipDeltaBytes, 0);
assert.equal(membershipOnlyJsonBytes, candidate.resource.reader.membershipOnlyJsonBytes);
console.log(JSON.stringify({
  candidateCaptureSha256: sha(candidateBytes), baselineCaptureSha256: sha(baselineBytes),
  fixtureSha256: fixtureHash, app: candidate.appSha, design: candidate.designSha,
  baselineOuterIntervalCount: baselineInterval.length, baselineOuterAcceptedIds: oldOuter.acceptedIds,
  omittedMiddleTags: omittedTags,
  candidateMembers: members, stale, forgottenId, currentAuthority: after.authorityRevision,
  controls: { durableReopened: reopened.operation.id, legacy: 'unavailable',
    preparedMembershipMasked: true, ambiguous: 'unavailable', extraDeterministicReflectCalls: 1 },
  baselineModelCalls: modelCalls(baseline), candidateModelCalls: modelCalls(candidate),
  baselineReadTotals: totals(baseline), candidateReadTotals: totals(candidate), membershipOnlyJsonBytes,
}, null, 2));
