import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const sha = data => createHash('sha256').update(data).digest('hex');
const canonical = value => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en'))));
const count = (witness, name) => witness.row.events.filter(event => event.name === name).length;
const modelEvents = child => child.events.filter(event => event.type === 'model');

function scopedOperation(scenario, witness) {
  const { job, row } = witness;
  const operationId = `memory-job:${job.id}`;
  assert.equal(witness.operationId, operationId);
  assert.equal(row.operation_id, operationId);
  assert.equal(row.thread_id, `vict-conv-${job.conversation_id}`);
  assert.equal(row.kind, job.kind);
  assert.equal(row.authority_revision, job.authority_revision);
  assert.ok([scenario.conversationId, scenario.otherConversationId].includes(job.conversation_id));
  const input = {
    conversationId: job.conversation_id, operationId, authorityRevision: row.authority_revision,
    kind: row.kind, configurationRevision: row.configuration_revision,
  };
  assert.equal(row.request_digest, sha(canonical(input)));
  assert.equal(witness.effectiveRevision, job.configuration_revision);
  assert.equal(witness.configurationRevision, row.configuration_revision);
  return input;
}

function receipts(scenario, witness, kindsAndStates) {
  const input = scopedOperation(scenario, witness);
  const indexed = new Map();
  for (const turn of witness.receipts) {
    const [, kind] = /^memory:([^:]+):/.exec(turn.inputSummary) ?? [];
    assert.ok(kind);
    assert.equal(turn.inputSummary, `memory:${kind}:${input.operationId}`);
    assert.equal(turn.invocations.length, 1);
    assert.ok(!indexed.has(kind), kind);
    const [entry] = turn.invocations;
    assert.equal(entry.capabilityId, 'quellight.memory.maintain');
    assert.equal(entry.effect, 'write');
    const digest = sha(canonical({ ...input, actorId: scenario.owner.actorId, kind, sourceRevision: witness.row.source_digest }));
    assert.equal(entry.argDigest, digest);
    indexed.set(kind, { kind, turnId: turn.turnId, turnStatus: turn.status, id: entry.invocationId, status: entry.status, digest });
  }
  assert.deepEqual([...indexed.keys()].sort(), Object.keys(kindsAndStates).sort());
  for (const [kind, completed] of Object.entries(kindsAndStates)) {
    const entry = indexed.get(kind);
    assert.equal(entry.turnStatus === 'completed', completed, kind);
    assert.equal(entry.status === 'completed', completed, kind);
  }
  assert.equal(new Set([...indexed.values()].map(row => row.id)).size, indexed.size);
  return [...indexed.values()];
}

function inputIds(witness, page, model) {
  assert.equal(model.jobId, witness.job.id);
  assert.equal(model.kind, 'observe');
  assert.equal(page.nextCursor, null);
  assert.equal(page.authorityRevision, witness.row.authority_revision);
  for (const row of page.sources) assert.equal(row.conversationId, witness.job.conversation_id);
  const originals = page.sources.filter(source => !source.excluded);
  const tags = originals.map(row => row.text.match(/^SYN_[UA]\d{2}\b/)?.[0]);
  assert.ok(tags.every(Boolean));
  assert.deepEqual(model.tags, tags);
  assert.equal(new Set(tags).size, tags.length);
  return originals.map(row => row.id);
}

function proof(membership, orderedIds) {
  assert.equal(membership.schema, 'vict.mastra-observation-membership@1');
  assert.equal(membership.groups.length, 1);
  const [group] = membership.groups;
  assert.equal(group.status, 'available');
  assert.equal(group.basis, 'observe-input');
  assert.ok(group.groupId);
  assert.deepEqual(group.messageIds, orderedIds);
  assert.equal(new Set(group.messageIds).size, orderedIds.length);
  return group.groupId;
}

function prepared(scenario, witness, page, worker, barrier) {
  const killed = typeof worker.signal === 'string' || (Number.isInteger(worker.code) && worker.code !== 0);
  assert.ok(killed);
  assert.equal(worker.events.some(event => event.type === 'dispatch' || event.type === 'error'), false);
  assert.equal(barrier.pid, worker.pid);
  assert.equal(barrier.position, 'after-commit-before-return');
  assert.equal(barrier.transition, 'prepared');
  assert.equal(barrier.operationId, witness.operationId);
  assert.equal(barrier.nativeSource, witness.row.source_digest);
  assert.equal(barrier.nativeConfig, witness.row.configuration_revision);
  assert.equal(barrier.nativeAuthority, witness.row.authority_revision);
  assert.equal(witness.job.attempts, 1);
  assert.equal(witness.job.state, 'running');
  assert.equal(witness.row.status, 'prepared');
  assert.equal(witness.row.has_checkpoint, true);
  assert.equal(witness.row.has_result, false);
  assert.equal(count(witness, 'prepared'), 1);
  assert.equal(count(witness, 'published'), 0);
  assert.equal(witness.public.status, 'prepared');
  assert.equal(witness.public.exposesCheckpointMembership, false);
  assert.equal(witness.public.sourceMembership, null);
  const calls = modelEvents(worker);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].attempt, 1);
  const ids = inputIds(witness, page, calls[0]);
  const groupId = proof(witness.row.prepared_membership, ids);
  const attempts = receipts(scenario, witness, { observe: false });
  return { ids, groupId, attempts };
}

function published(witness, ids) {
  assert.equal(witness.job.state, 'completed');
  assert.equal(witness.row.status, 'completed');
  assert.equal(witness.public.status, 'completed');
  assert.equal(witness.row.has_result, true);
  assert.equal(count(witness, 'prepared'), 1);
  assert.equal(count(witness, 'published'), 1);
  assert.equal(witness.public.exposesCheckpointMembership, false);
  assert.deepEqual(witness.row.published_membership, witness.public.sourceMembership);
  return proof(witness.public.sourceMembership, ids);
}

function sameBinding(previous, current) {
  for (const key of ['id', 'conversation_id', 'authority_revision', 'configuration_revision', 'source_revision']) {
    assert.equal(previous.job[key], current.job[key], key);
  }
  for (const key of ['operation_id', 'thread_id', 'configuration_revision', 'authority_revision', 'request_digest', 'source_digest']) {
    assert.equal(previous.row[key], current.row[key], key);
  }
}

function claims(child, actorId) {
  assert.equal(child.code, 0);
  const ready = child.events.filter(event => event.type === 'ready');
  assert.equal(ready.length, 1);
  assert.equal(ready[0].actorId, actorId);
  assert.equal(ready[0].pid, child.pid);
  assert.equal(child.events.filter(event => event.type === 'dispatch').length, 1);
  return child.events.filter(event => event.type === 'delivery');
}

function orderedHistory(witness) {
  const ids = witness.history.map(event => BigInt(event.id));
  assert.ok(ids.every((id, index) => index === 0 || ids[index - 1] < id));
  return witness.history.map(({ state, code }) => [state, code]);
}

const [path] = process.argv.slice(2);
assert.ok(path, 'Pass the Q4-008 capture.json');
const bytes = await readFile(path);
const capture = JSON.parse(bytes);
assert.equal(capture.schema, 'quellight.q4-008.worker-recovery@1');
assert.equal(capture.status, 'passed', capture.error?.message);
assert.equal(capture.design, '9dbfd28175d86b28f9a52340aa4939b4ed11db81');
assert.equal(capture.install.app, '14b6ccaf6f409eac3e041dc3d9abd0bb9f875344');
assert.equal(capture.install.adapter, '9f75998297af4755bfa1abe567f198c7b0731dd304fca1c6c06163f480e03184');
assert.equal(capture.install.memory, 'ed2e8db8e55c60afe1dd4eb3b93b3c5308f35d7accaeff939d488724339c0ea6');
assert.equal(capture.install.installLock, '9b9c90361392dd0af0f282834ad231011554f04a3e5ac2ab20eff734874563be');
assert.equal(capture.install.node, 'v22.23.5');

const outcomes = [];
for (const label of ['after-prepare', 'cross-thread']) {
  const matches = capture.cases.filter(row => row.label === label);
  assert.equal(matches.length, 1, label);
  const [test] = matches;
  assert.equal(test.status, 'passed');
  const { scope, seed, whileStoppedAtBarrier: stopped, afterDeath: previous, afterDuplicate: duplicate } = test;
  const { current, terminatedWorker, restartedWorker, duplicateDelivery } = test;
  const actor = scope.owner.actorId;
  assert.equal(seed.a.conversationId, scope.conversationId);
  assert.equal(seed.a.job.state, 'queued');
  assert.equal(seed.a.job.attempts, 0);
  assert.equal(seed.a.job.id, previous.job.id);
  assert.equal(seed.a.job.source_revision, previous.job.source_revision);
  assert.equal(seed.a.job.authority_revision, previous.authority);
  assert.equal(stopped.row.status, 'prepared');
  assert.equal(stopped.row.has_result, false);
  assert.equal(count(stopped, 'prepared'), 1);
  assert.equal(count(stopped, 'published'), 0);
  assert.match(stopped.row.checkpoint_digest, /^[0-9a-f]{64}$/);
  assert.equal(stopped.row.checkpoint_digest, previous.row.checkpoint_digest);
  assert.deepEqual(stopped.row.prepared_membership, previous.row.prepared_membership);
  sameBinding(stopped, previous);
  const initial = prepared(scope, previous, seed.a.originals, terminatedWorker, test.barrier);
  const firstClaim = terminatedWorker.events.find(event => event.type === 'delivery');
  assert.equal(firstClaim.jobId, previous.job.id);
  assert.equal(firstClaim.attempt, 1);
  assert.equal(firstClaim.claimExpires, test.claimExpiry.claimExpires);
  assert.equal(firstClaim.productSource, previous.job.source_revision);
  assert.equal(firstClaim.productConfig, previous.job.configuration_revision);
  assert.equal(firstClaim.authority, previous.job.authority_revision);
  const resumedClaims = claims(restartedWorker, actor);
  assert.notEqual(restartedWorker.pid, terminatedWorker.pid);
  const resumedModels = modelEvents(restartedWorker);

  let ids, completedAttempts, extra;
  if (label === 'after-prepare') {
    assert.deepEqual(resumedClaims.map(({ jobId, attempt }) => [jobId, attempt]), [[previous.job.id, 2]]);
    assert.deepEqual(resumedModels, []);
    assert.deepEqual(orderedHistory(current), [
      ['queued', null], ['running', null], ['retryable', 'HOST_INTERRUPTED'], ['running', null], ['completed', null],
    ]);
    assert.ok(Date.parse(current.history[2].at) >= Date.parse(firstClaim.claimExpires));
    sameBinding(previous, current);
    assert.equal(current.row.checkpoint_digest, previous.row.checkpoint_digest);
    assert.deepEqual(current.public.sourceMembership, previous.row.prepared_membership);
    ids = initial.ids;
    assert.equal(published(current, ids), initial.groupId);
    completedAttempts = receipts(scope, current, { observe: false, reconcile: true });
    assert.deepEqual(completedAttempts.find(entry => entry.kind === 'observe'), initial.attempts[0]);
  } else {
    const { afterCareBeforePurge: masked, currentSources, stale } = test;
    const target = seed.b.originals.sources.find(source => source.role === 'user');
    assert.equal(seed.b.conversationId, scope.otherConversationId);
    assert.notEqual(seed.b.conversationId, seed.a.conversationId);
    assert.equal(target.conversationId, seed.b.conversationId);
    assert.ok(!initial.ids.includes(target.id));
    assert.equal(test.care.ok, true);
    assert.equal(test.care.replay, false);
    assert.equal(test.care.value.purgeQueued, 1);
    assert.equal(test.care.value.rebuildQueued, 2);
    const epoch = test.care.value.authorityRevision;
    const { command, request } = test.care;
    const careInput = { conversationId: seed.b.conversationId, expectedAuthorityRevision: previous.authority,
      sourceMessageIds: JSON.stringify([target.id]) };
    assert.deepEqual(request, careInput);
    assert.equal(command.conversation_id, seed.b.conversationId);
    assert.equal(command.action_id, 'memory.forget');
    assert.equal(command.state, 'applied');
    assert.equal(command.expected_authority_revision, previous.authority);
    assert.equal(command.intended_authority_revision, epoch);
    assert.deepEqual(command.result, test.care.value);
    const careDigest = sha(JSON.stringify({ actionId: 'memory.forget', revision: '1', input: careInput }));
    assert.equal(command.argument_digest, careDigest);
    assert.equal(epoch, 'care:' + sha(JSON.stringify([actor, command.command_key, careDigest])));
    assert.equal(command.authority_input.conversationId, seed.b.conversationId);
    assert.equal(command.authority_input.operationId, 'quellight-care:' + sha(JSON.stringify([actor, command.command_key])));
    assert.equal(command.authority_input.expectedRevision, previous.authority);
    assert.equal(command.authority_input.revision, epoch);
    assert.deepEqual(command.authority_input.excludedMessageIds, [target.id]);
    assert.notEqual(epoch, previous.authority);
    assert.equal(masked.authority, epoch);
    sameBinding(previous, masked);
    assert.equal(masked.row.status, 'prepared');
    assert.equal(masked.row.checkpoint_digest, previous.row.checkpoint_digest);
    assert.equal(masked.job.state, 'superseded');
    assert.equal(masked.job.failure_code, 'MEMORY_AUTHORITY_CHANGED');
    assert.equal(masked.job.attempts, 1);
    const absent = { status: 'superseded', hasCheckpoint: false, hasResult: false,
      exposesCheckpointMembership: false, sourceMembership: null };
    assert.deepEqual(masked.public, absent);
    assert.deepEqual(stale.public, absent);
    assert.equal(stale.job.attempts, 1);
    assert.equal(stale.row.status, 'superseded');
    assert.equal(stale.row.has_checkpoint, false);
    assert.equal(stale.row.has_result, false);
    assert.equal(count(stale, 'published'), 0);
    assert.deepEqual(stale.receipts, previous.receipts);
    assert.deepEqual(currentSources.a.sources.map(source => source.id), initial.ids);
    assert.notEqual(current.job.id, previous.job.id);
    assert.equal(current.job.conversation_id, previous.job.conversation_id);
    assert.equal(current.job.configuration_revision, previous.job.configuration_revision);
    assert.equal(current.job.source_revision, previous.job.source_revision);
    assert.notEqual(current.row.source_digest, previous.row.source_digest);
    assert.equal(current.row.thread_id, previous.row.thread_id);
    assert.equal(current.authority, epoch);
    assert.equal(currentSources.a.authorityRevision, epoch);
    assert.equal(currentSources.b.authorityRevision, epoch);
    const currentBTarget = currentSources.b.sources.find(source => source.id === target.id);
    assert.equal(currentBTarget.label, 'Excluded by you');
    assert.equal(currentBTarget.excluded, true);
    assert.ok(resumedClaims.every(claim => claim.jobId !== previous.job.id && claim.authority === epoch));
    assert.equal(resumedClaims.filter(claim => claim.jobId === current.job.id).length, 1);
    assert.equal(resumedModels.length, 1);
    ids = inputIds(current, currentSources.a, resumedModels[0]);
    assert.equal(ids.length, 1);
    assert.equal(currentSources.a.sources.find(row => row.id === ids[0]).role, 'user');
    assert.ok(!ids.includes(target.id));
    published(current, ids);
    completedAttempts = receipts(scope, current, { observe: true });
    extra = { careThread: seed.b.conversationId, forgottenId: target.id,
      careCommandKey: command.command_key, careArgumentDigest: careDigest,
      maskedOldOperation: stale.operationId, maskedOldStatus: stale.public.status,
      stalePublishCount: 0, oldOperationAttempts: initial.attempts };
  }
  sameBinding(current, duplicate);
  assert.notEqual(duplicateDelivery.pid, restartedWorker.pid);
  assert.deepEqual(claims(duplicateDelivery, actor), []);
  assert.deepEqual(modelEvents(duplicateDelivery), []);
  assert.deepEqual(duplicateDelivery.events.find(event => event.type === 'dispatch').result, { handled: 0, busy: false });
  assert.deepEqual(duplicate.history, current.history);
  assert.deepEqual(duplicate.receipts, current.receipts);
  assert.equal(duplicate.row.result_digest, current.row.result_digest);
  assert.equal(published(duplicate, ids), current.public.sourceMembership.groups[0].groupId);
  outcomes.push({ label, roomId: scope.roomId, actorId: actor, interruptedPid: terminatedWorker.pid,
    restartedPid: restartedWorker.pid, jobId: current.job.id, operationId: current.operationId,
    sourceRevision: current.row.source_digest, applicationSourceRevision: current.job.source_revision,
    configurationRevision: current.row.configuration_revision, authorityRevision: current.authority,
    orderedMembership: ids, publishedGroupId: current.public.sourceMembership.groups[0].groupId,
    preparedCount: count(current, 'prepared'), publishedCount: count(current, 'published'),
    originalModelCalls: 1, resumedModelCalls: resumedModels.length, duplicateModelCalls: 0,
    retries: orderedHistory(current), receipts: completedAttempts, ...extra });
}

console.log(JSON.stringify({ captureSha256: sha(bytes), app: capture.install.app, design: capture.design,
  node: capture.install.node, postgres: capture.postgres, adapterSha256: capture.install.adapter,
  memorySha256: capture.install.memory, independentCases: outcomes }, null, 2));
