import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const [capturePath, fixturePath] = process.argv.slice(2);
assert.ok(capturePath && fixturePath, 'Pass an installed capture and the frozen fixture');
const fixtureBytes = await readFile(fixturePath);
const fixture = JSON.parse(fixtureBytes);
const capture = JSON.parse(await readFile(capturePath, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(capture.schema, 'quellight.q4-006.installed-replay@1');
assert.equal(capture.status, 'passed', capture.error?.message);
assert.equal(capture.fixtureCommit, '5166198b4a39a59701455aa1532deb3243c34059');
assert.equal(capture.fixtureSha256, sha(fixtureBytes));
assert.equal(capture.appSha, '14b6ccaf6f409eac3e041dc3d9abd0bb9f875344');
assert.equal(capture.designSha, '9dbfd28175d86b28f9a52340aa4939b4ed11db81');
assert.equal(capture.lockSha, '31b606ed8bdffa497bd4621f87877900ed3767f2f0ee0a5681f384e75d75e225');
assert.equal(capture.node, 'v22.23.5');
assert.equal(capture.archives.length, 14);
assert.equal(capture.archives.find(row => row.name === '@victframework/mastra')?.sha256,
  '90b2de7c6515785e23b4e6370c92be019959ffca430a7980f6752d5d104c9b2c');
assert.deepEqual(capture.shadowSqlRole, { can_insert: false, can_rewrite: false, namespaceUpdateBlocked: true });

const { actorId, conversationId } = capture.scope;
const exact = (array, label) => {
  const matches = array.filter(row => row.label === label);
  assert.equal(matches.length, 1, label);
  return matches[0];
};
const before = exact(capture.inventories, 'before-close');
const after = exact(capture.inventories, 'after-forget-before-rebuild');
assert.equal(before.authorityRevision, '0');
assert.notEqual(after.authorityRevision, before.authorityRevision);
assert.equal(capture.care.authorityRevision, after.authorityRevision);
const frozenTexts = new Map(fixture.turns.flatMap(turn => [
  ['SYN_U' + turn.id, { role: 'user', text: turn.user }],
  ['SYN_A' + turn.id, { role: 'assistant', text: turn.assistant }],
]));
const sourceIds = new Map();
for (const inventory of capture.inventories) {
  for (const row of inventory.orderedOriginals) {
    assert.deepEqual({ role: row.role, text: row.text }, frozenTexts.get(row.tag));
    assert.equal(row.conversationId, conversationId);
    if (sourceIds.has(row.tag)) assert.equal(row.id, sourceIds.get(row.tag));
    else sourceIds.set(row.tag, row.id);
  }
  assert.equal(new Set(inventory.orderedOriginals.map(row => row.id)).size, inventory.orderedOriginals.length);
}
assert.deepEqual(before.orderedOriginals.map(row => row.tag), [...frozenTexts.keys()]);
assert.ok(before.orderedOriginals.every(row => !row.excluded));
assert.deepEqual(after.orderedOriginals.map(row => row.id), before.orderedOriginals.map(row => row.id));
const forgottenId = sourceIds.get(fixture.forgetTag);
assert.equal(capture.care.targetId, forgottenId);
assert.ok(after.orderedOriginals.find(row => row.id === forgottenId).excluded);
assert.deepEqual(after.orderedOriginals.filter(row => !row.excluded).map(row => row.tag), fixture.rebuild.expectedTags);
const [outerStart, outerEnd] = fixture.expectations.endpointTagsUnaffectedByInteriorExclusion;
const beforeIndex = id => before.orderedOriginals.findIndex(item => item.id === id);
assert.ok(beforeIndex(sourceIds.get(outerStart)) < beforeIndex(forgottenId));
assert.ok(beforeIndex(forgottenId) < beforeIndex(sourceIds.get(outerEnd)));
assert.ok(after.orderedOriginals.filter(row => row.tag === outerStart || row.tag === outerEnd)
  .every(row => !row.excluded));

assert.deepEqual(capture.settlements.map(row => row.label), fixture.turns.map(turn => turn.id));
for (const settlement of capture.settlements) {
  assert.equal(settlement.status, 'completed');
  assert.equal(settlement.projectionSettled, true);
  assert.equal(settlement.assistantId, settlement.turnId + ':assistant');
}
assert.equal(new Set(capture.settlements.map(row => row.turnId)).size, fixture.turns.length);

const recovered = new Map();
const audits = [];
const invocationIds = new Set();
function checkPublication(plan, kind, orderedSourceIds, expectedLines) {
  const publication = exact(capture.publications, plan.id);
  const { operation, group } = publication;
  const model = exact(capture.models, plan.id);
  assert.equal(publication.kind, kind);
  assert.equal(operation.kind, kind);
  assert.equal(operation.status, 'completed');
  assert.equal(operation.operation_id, 'memory-job:' + model.jobId);
  assert.equal(operation.thread_id, 'vict-conv-' + conversationId);
  assert.equal(operation.resource_id, 'vict-actor-' + actorId);
  assert.equal(operation.authority_revision, model.authorityRevision);
  assert.equal(operation.result.snapshot.authorityRevision, model.authorityRevision);
  assert.equal(operation.result.snapshot.resourceId, operation.resource_id);
  assert.equal(operation.result.snapshot.conversationId, conversationId);
  assert.equal(operation.result.operationId, operation.operation_id);
  assert.equal(operation.result.sourceRevision, operation.source_digest);
  assert.equal(operation.result.configurationRevision, operation.configuration_revision);
  assert.ok(kind === 'reflect' ? operation.result.reflected : operation.result.observed);
  const published = operation.events.filter(event => event.name === 'published');
  const prepared = operation.events.filter(event => event.name === 'prepared');
  assert.equal(published.length, 1);
  assert.equal(prepared.length, 1);
  assert.ok(Date.parse(prepared[0].at) <= Date.parse(published[0].at));
  assert.deepEqual(publication.events.map(event => event.state), ['queued', 'running', 'completed']);
  assert.ok(publication.events.every(event => event.job_id === model.jobId));

  const currentGroups = [...operation.result.snapshot.current.observations.matchAll(
    /<observation-group\b([^>]*)>([\s\S]*?)<\/observation-group>/g,
  )].map(([, attributes, body]) => ({
    id: attributes.match(/\bid="([^"]+)"/)?.[1],
    range: attributes.match(/\brange="([^"]+)"/)?.[1],
    kind: attributes.match(/\bkind="([^"]+)"/)?.[1] ?? 'observe',
    body: body.trim(),
  }));
  const fromSnapshot = currentGroups.filter(item => item.id === group.id);
  assert.deepEqual(fromSnapshot, [group]);
  assert.deepEqual(group.body.split('\n'), expectedLines);
  assert.equal(group.kind, kind === 'reflect' ? 'reflection' : kind);
  assert.deepEqual(model.orderedSourceIds, orderedSourceIds);

  const receipt = exact(capture.receiptAudit.receipts, plan.id);
  const request = {
    actorId, authorityRevision: operation.authority_revision, configurationRevision: operation.configuration_revision,
    conversationId, kind, operationId: operation.operation_id, sourceRevision: operation.source_digest,
  };
  assert.deepEqual(receipt.request, request);
  // The seven flat argument properties are in strict lexicographic order.
  // SHA-256 of those UTF-8 bytes independently reproduces the bridge digest.
  const digest = sha(JSON.stringify(request));
  const { invocation } = receipt;
  assert.equal(invocation.argDigest, digest);
  assert.equal(invocation.actorId, actorId);
  assert.equal(invocation.turnId, receipt.maintenanceTurnId);
  assert.equal(invocation.status, 'completed');
  assert.equal(invocation.effect, 'write');
  assert.equal(invocation.capabilityId, 'quellight.memory.maintain');
  assert.equal(invocation.capabilityRevision, '1');
  assert.ok(!invocationIds.has(invocation.invocationId));
  invocationIds.add(invocation.invocationId);
  recovered.set(plan.id, { kind, expectedIds: orderedSourceIds, group, operation });
  audits.push({ label: plan.id, operationId: operation.operation_id,
    receiptId: invocation.invocationId, argumentDigest: digest, publishedAt: published[0].at });
}

const notice = (plan, inventoryLabel) => {
  const model = exact(capture.models, plan.id);
  assert.equal(model.role, 'observe');
  assert.match(model.promptSection, /^## New Message History to Observe/);
  const textTags = [...model.promptSection.matchAll(/SYN_[UA]\d{2}/g)].map(match => match[0]);
  assert.deepEqual(textTags, plan.expectedTags);
  assert.deepEqual(textTags, model.tags);
  const inventory = exact(capture.inventories, inventoryLabel);
  assert.equal(inventory.authorityRevision, model.authorityRevision);
  const eligibleByTag = new Map(inventory.orderedOriginals.filter(row => !row.excluded).map(row => [row.tag, row.id]));
  assert.ok(textTags.every(tag => eligibleByTag.has(tag)));
  checkPublication(plan, 'observe', textTags.map(tag => eligibleByTag.get(tag)), ['- ' + plan.note]);
};
const reflect = plan => {
  const model = exact(capture.models, plan.id);
  assert.equal(model.role, 'reflect');
  assert.match(model.promptSection, /^## OBSERVATIONS TO REFLECT ON/);
  const inputLines = model.promptSection.split(/\r?\n/);
  const returnedLines = model.reply.split(/\r?\n/).filter(line => line.startsWith('- '));
  const parents = plan.inputParents.map(label => ({ label, ...recovered.get(label) }));
  assert.doesNotMatch(model.promptSection, /<observation-group\b|_range:/);
  assert.ok(parents.every(parent => !model.promptSection.includes(parent.group.id) &&
    !model.promptSection.includes(parent.group.range)));
  const positions = parents.map(parent => inputLines.indexOf(parent.group.body));
  assert.ok(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])));
  assert.deepEqual(model.inputParentIds, parents.map(parent => parent.group.id));
  const copied = parents.filter(parent => returnedLines.includes(parent.group.body));
  assert.deepEqual(copied.map(parent => parent.label), plan.retainedParents);
  assert.deepEqual(model.copiedParentIds, copied.map(parent => parent.group.id));
  assert.deepEqual(returnedLines, copied.map(parent => parent.group.body));
  checkPublication(plan, 'reflect', [...new Set(copied.flatMap(parent => parent.expectedIds))], returnedLines);
  return { inputParents: parents.map(parent => parent.group.id), copiedParents: copied.map(parent => parent.group.id),
    promptGroupMarkupPresent: false };
};

for (const plan of fixture.observe) notice(plan, 'before-' + plan.id);
const reflectBefore = reflect(fixture.reflectBefore);
notice(fixture.rebuild, after.label);
const reflectAfter = reflect(fixture.reflectAfter);
assert.equal(invocationIds.size, 6);

const table = [];
const compare = label => {
  const witness = recovered.get(label);
  const read = exact(capture.consumerReads, label);
  const seen = read.groups.filter(group => group.groupId === witness.group.id);
  assert.equal(seen.length, 1);
  const [group] = seen;
  const inventory = read.authority.revision === '0' ? before : after;
  assert.equal(read.authority.revision, witness.operation.authority_revision);
  assert.equal(group.range, witness.group.range);
  const endpoints = group.range.split(':');
  assert.equal(endpoints.length, 2);
  const positions = endpoints.map(id => inventory.orderedOriginals.findIndex(source => source.id === id));
  assert.ok(positions[0] >= 0 && positions[0] <= positions[1]);
  const interval = inventory.orderedOriginals.slice(positions[0], positions[1] + 1);
  const accepted = label === 'middle' || label === 'close' ? witness.expectedIds : [];
  const actual = interval.filter(source => !source.excluded).map(source => source.id);
  const missing = witness.expectedIds.filter(id => !actual.includes(id));
  const extra = actual.filter(id => !witness.expectedIds.includes(id));
  assert.deepEqual(missing, []);
  assert.deepEqual(group.apparentAllIds, interval.map(source => source.id));
  assert.deepEqual(group.apparentEligibleIds, actual);
  assert.deepEqual(group.rejectedIds, interval.filter(source => source.excluded).map(source => source.id));
  assert.deepEqual(group.acceptedIds, accepted);
  if (label === fixture.reflectBefore.id) {
    assert.deepEqual(extra, fixture.expectations.reflectionInteriorOverinclusionTags.map(tag => sourceIds.get(tag)));
    assert.equal(actual.length, 10);
    assert.equal(witness.expectedIds.length, 8);
    assert.equal(group.disposition, 'reflected-membership-unverified');
  } else {
    assert.deepEqual(actual, witness.expectedIds);
  }
  if (label === 'open') {
    assert.equal(group.disposition, 'observe-interior-membership-unverified');
    assert.equal(witness.expectedIds.length, 6);
    assert.ok(witness.expectedIds.length >= fixture.expectations.longObserveMinimumMembers);
  }
  if (read.authority.revision !== '0') {
    assert.ok(group.apparentAllIds.includes(forgottenId) && group.rejectedIds.includes(forgottenId));
    assert.ok(!actual.includes(forgottenId) && !read.acceptedIds.includes(forgottenId));
    assert.equal(actual.length, 4);
  }
  table.push({ label, publicationId: witness.operation.operation_id, groupId: witness.group.id,
    expectedIds: witness.expectedIds, intervalIds: group.apparentAllIds, intervalEligibleIds: actual,
    extra, rejectedIds: group.rejectedIds, acceptedIds: group.acceptedIds, disposition: group.disposition });
};
for (const label of recovered.keys()) compare(label);
const stale = [];
for (const [label, earlier] of [['old-observe', 'open'], ['old-reflect', fixture.reflectBefore.id]]) {
  const current = exact(capture.consumerReads, label);
  const previous = recovered.get(earlier).operation;
  assert.equal(current.operationId, previous.operation_id);
  assert.equal(current.operation.status, 'superseded');
  assert.equal(current.operation.authorityRevision, previous.authority_revision);
  assert.deepEqual(current.operation.publicationEvents, previous.events.filter(event => event.name === 'published'));
  assert.equal(current.authority.revision, after.authorityRevision);
  assert.equal(current.operation.resultPresent, false);
  assert.equal(current.operation.checkpointPresent, false);
  assert.deepEqual(current.acceptedIds, []);
  assert.ok(current.reads.every(read => read.port !== 'app.memorySourcePage'));
  stale.push({ label, operationId: current.operationId, status: current.operation.status,
    accepted: current.acceptedIds.length, preservedPublicationEvents: current.operation.publicationEvents.length });
}
const readTotals = { attempts: capture.consumerReads.length, namedReads: 0, namedBytes: 0, sent: 0, received: 0 };
for (const row of capture.consumerReads) {
  assert.equal(row.metrics.namedReads, row.reads.length);
  assert.equal(row.metrics.namedBytes, row.reads.reduce((total, item) => total + item.jsonBytes, 0));
  readTotals.namedReads += row.metrics.namedReads;
  readTotals.namedBytes += row.metrics.namedBytes;
  readTotals.sent += row.metrics.postgresWire.sent;
  readTotals.received += row.metrics.postgresWire.received;
}
assert.equal(readTotals.attempts, 8);
assert.equal(capture.models.filter(model => model.role === 'chat').length, 5);
assert.equal(capture.models.filter(model => model.role === 'observe').length, 4);
assert.equal(capture.models.filter(model => model.role === 'reflect').length, 2);
assert.deepEqual(capture.resource, { chatFixtureCalls: 5, observeFixtureCalls: 4, reflectFixtureCalls: 2,
  consumerModelCalls: 0, liveProviderCalls: 0, addedSendRoundTrips: 0 });
console.log(JSON.stringify({
  pinnedApp: capture.appSha, pinnedDesign: capture.designSha, fixtureCommit: capture.fixtureCommit,
  fixtureSha256: capture.fixtureSha256, node: capture.node, postgres: capture.postgres,
  forgottenId, retainedSurroundingUserIds: [outerStart, outerEnd].map(tag => sourceIds.get(tag)),
  oldAuthority: before.authorityRevision, currentAuthority: after.authorityRevision,
  reflected: { before: reflectBefore, after: reflectAfter }, sourceComparisons: table,
  stale, receipts: audits, readTotals, resource: capture.resource,
}, null, 2));
