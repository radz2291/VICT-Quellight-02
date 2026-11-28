import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const schema = 'quellight.q4-008.old-pin-qualification@1';
const conflictCode = 'MEMORY_NATIVE_OPERATION_CONFLICT';
const membershipSchema = 'vict.mastra-observation-membership@1';

function countNativeEvents(witness, name) {
  return (witness.row?.events ?? []).filter(event => event.name === name).length;
}

function modelCalls(worker) {
  return worker.events.filter(event => event.type === 'model').length;
}

function jobBinding(job) {
  return { id: job.id, sourceRevision: job.source_revision, configurationRevision: job.configuration_revision,
    authorityRevision: job.authority_revision };
}

function assertBinding(before, after) {
  assert.deepEqual(jobBinding(after.job), jobBinding(before.job));
}

function nativeBinding(native) {
  return { operation: native.operation_id, thread: native.thread_id, config: native.configuration_revision,
    source: native.source_digest, authority: native.authority_revision, request: native.request_digest };
}

function membershipOf(witness) {
  const membership = witness.public?.sourceMembership;
  assert.equal(membership?.schema, membershipSchema);
  return membership.groups;
}

async function dispatch(fixture, scenario, options = {}) {
  const worker = await fixture.launch(scenario, options);
  const receipt = await worker.done();
  return { receipt, modelCalls: modelCalls(worker), events: worker.events };
}

export async function qualifyOldPins({ baseline, candidate, candidateApp, save = async () => {} }) {
  const result = { schema, status: 'started', cases: {}, liveProviderCalls: 0, postgres: baseline.postgres,
    pins: { baseline: baseline.identity, candidate: candidate.identity } };
  try {
    assert.equal(baseline.identity.installedBinding, 'baseline');
    assert.equal(candidate.identity.installedBinding, 'candidate');
    const queuedStory = await baseline.createScenario('old-pin-queued');
    const queued = { scenario: queuedStory, seed: await baseline.settle(queuedStory, 'A') };
    result.cases.oldQueued = queued;
    const queuedId = queued.seed.job.id;
    queued.before = await baseline.witness(queuedStory, queuedId);
    assert.equal(queued.before.job.state, 'queued');
    assert.equal(queued.before.job.attempts, 0);
    assert.ok(queued.before.row == null, 'Queued case must have no existing native operation');

    const preparedStory = await baseline.createScenario('old-pin-prepared');
    const prepared = { scenario: preparedStory, seed: await baseline.settle(preparedStory, 'A') };
    result.cases.oldPrepared = prepared;
    const preparedId = prepared.seed.job.id;
    const oldWorker = await baseline.launch(preparedStory, { barrier: 'after-prepare' });
    try {
      prepared.barrier = await oldWorker.waitForBarrier();
      prepared.atBarrier = await baseline.witness(preparedStory, preparedId);
      assert.equal(prepared.atBarrier.job.state, 'running');
      assert.equal(prepared.atBarrier.job.attempts, 1);
      assert.equal(prepared.atBarrier.row?.status, 'prepared');
      assert.equal(prepared.atBarrier.row.configuration_revision, prepared.atBarrier.configurationRevision);
      assert.match(prepared.atBarrier.row.checkpoint_digest, /^[a-f0-9]{64}$/, 'A real old-pin checkpoint must be durable');
      assert.equal(prepared.atBarrier.row.prepared_membership, null);
      assert.equal(prepared.atBarrier.row.has_result, false);
      assert.equal(countNativeEvents(prepared.atBarrier, 'prepared'), 1);
      assert.equal(countNativeEvents(prepared.atBarrier, 'published'), 0);
    } finally {
      prepared.interrupt = await oldWorker.kill();
      prepared.initialModelCalls = modelCalls(oldWorker);
      prepared.initialEvents = oldWorker.events;
    }
    assert.equal(prepared.initialModelCalls, 1);
    assert.ok(prepared.interrupt.signal === 'SIGKILL' || prepared.interrupt.code !== 0);
    await save(result);

    // The candidate handles another actor's untouched job while the old
    // prepared job's genuine delivery claim reaches its normal expiry.
    queued.dispatch = await dispatch(baseline, queuedStory, { app: candidateApp });
    assert.equal(queued.dispatch.modelCalls, 1);
    queued.after = await candidate.witness(queuedStory, queuedId);
    assertBinding(queued.before, queued.after);
    assert.equal(queued.after.job.state, 'completed');
    assert.equal(queued.after.job.attempts, 1);
    assert.equal(queued.after.row?.status, 'completed');
    assert.equal(queued.after.row.operation_id, 'memory-job:' + queuedId);
    assert.equal(queued.after.row.authority_revision, queued.before.job.authority_revision);
    assert.equal(queued.after.row.configuration_revision, queued.after.configurationRevision);
    assert.notEqual(queued.after.configurationRevision, queued.before.configurationRevision);
    assert.equal(queued.after.effectiveRevision, queued.before.effectiveRevision);
    assert.equal(queued.after.effectiveRevision, queued.before.job.configuration_revision);
    assert.equal(countNativeEvents(queued.after, 'prepared'), 1);
    assert.equal(countNativeEvents(queued.after, 'published'), 1);
    const [newGroup] = membershipOf(queued.after);
    assert.equal(newGroup.status, 'available');
    assert.equal(newGroup.basis, 'observe-input');
    assert.deepEqual(newGroup.messageIds, queued.seed.originals.sources.map(source => source.id));
    queued.disposition = 'same-product-job-adopted-by-current-native-pin';
    await save(result);

    prepared.expiry = await baseline.waitForClaimExpiry(preparedId);
    prepared.candidateDispatch = await dispatch(baseline, preparedStory, { app: candidateApp });
    assert.equal(prepared.candidateDispatch.modelCalls, 0);
    prepared.candidateRefusal = await candidate.witness(preparedStory, preparedId);
    assertBinding(prepared.atBarrier, prepared.candidateRefusal);
    assert.equal(prepared.candidateRefusal.job.state, 'blocked');
    assert.equal(prepared.candidateRefusal.job.failure_code, conflictCode);
    assert.equal(prepared.candidateRefusal.job.attempts, 2);
    assert.deepEqual(prepared.candidateRefusal.row, prepared.atBarrier.row);
    assert.equal(prepared.candidateRefusal.row.status, 'prepared');
    assert.notEqual(prepared.candidateRefusal.configurationRevision, prepared.candidateRefusal.row.configuration_revision);
    assert.equal(prepared.candidateRefusal.effectiveRevision, prepared.atBarrier.effectiveRevision);
    assert.equal(prepared.candidateRefusal.row.has_result, false);
    assert.equal(countNativeEvents(prepared.candidateRefusal, 'published'), 0);
    assert.equal(prepared.candidateRefusal.public?.hasResult, false);
    assert.equal(prepared.candidateRefusal.public?.sourceMembership, null);
    assert.deepEqual(prepared.candidateRefusal.receipts, prepared.atBarrier.receipts,
      'Candidate must refuse the old pin before creating a new native execution receipt');
    prepared.disposition = 'blocked-by-existing-native-configuration-pin';
    await save(result);

    prepared.retry = await baseline.care(preparedStory, 'memory.retry', {
      expectedAuthorityRevision: prepared.atBarrier.job.authority_revision,
    });
    assert.equal(prepared.retry.ok, true);
    assert.equal(prepared.retry.value.retryQueued, 1);
    prepared.drain = await dispatch(baseline, preparedStory);
    assert.equal(prepared.drain.modelCalls, 0, 'Old-pin drain must reuse the exact saved checkpoint');
    prepared.candidateReadAfterDrain = await candidate.witness(preparedStory, preparedId);
    assertBinding(prepared.atBarrier, prepared.candidateReadAfterDrain);
    assert.equal(prepared.candidateReadAfterDrain.job.state, 'completed');
    assert.equal(prepared.candidateReadAfterDrain.job.attempts, 3);
    assert.equal(prepared.candidateReadAfterDrain.row.status, 'completed');
    assert.equal(countNativeEvents(prepared.candidateReadAfterDrain, 'prepared'), 1);
    assert.equal(countNativeEvents(prepared.candidateReadAfterDrain, 'published'), 1);
    assert.deepEqual(nativeBinding(prepared.candidateReadAfterDrain.row), nativeBinding(prepared.atBarrier.row));
    assert.equal(prepared.candidateReadAfterDrain.row.checkpoint_digest, prepared.atBarrier.row.checkpoint_digest);
    assert.equal(prepared.candidateReadAfterDrain.row.has_result, true);
    assert.equal(prepared.candidateReadAfterDrain.row.published_membership, null);
    assert.ok(prepared.candidateReadAfterDrain.receipts.some(receipt => receipt.status === 'completed' &&
      receipt.inputSummary === 'memory:reconcile:' + prepared.candidateReadAfterDrain.operationId && receipt.invocations.some(invocation =>
      invocation.status === 'completed' && invocation.capabilityId === 'quellight.memory.maintain')));
    assert.deepEqual(prepared.candidateReadAfterDrain.history.map(({ state, code }) => [state, code]), [
      ['queued', null], ['running', null], ['retryable', 'HOST_INTERRUPTED'], ['running', null],
      ['blocked', conflictCode], ['retryable', 'OWNER_RETRY'], ['running', null], ['completed', null],
    ]);
    const legacyGroups = membershipOf(prepared.candidateReadAfterDrain);
    assert.ok(legacyGroups.length > 0);
    assert.ok(legacyGroups.every(group => group.status === 'unavailable' && !Object.hasOwn(group, 'messageIds')));

    prepared.duplicateDelivery = await dispatch(baseline, preparedStory, { app: candidateApp });
    assert.equal(prepared.duplicateDelivery.modelCalls, 0);
    prepared.afterDuplicate = await candidate.witness(preparedStory, preparedId);
    assert.equal(prepared.afterDuplicate.job.attempts, 3);
    assert.equal(countNativeEvents(prepared.afterDuplicate, 'published'), 1);
    assert.match(prepared.candidateReadAfterDrain.row.result_digest, /^[a-f0-9]{64}$/);
    assert.deepEqual(prepared.afterDuplicate.row, prepared.candidateReadAfterDrain.row);
    assert.deepEqual(prepared.afterDuplicate.history, prepared.candidateReadAfterDrain.history);

    result.status = 'passed';
    result.recommendation = 'Drain eligible prepared operations on their exact old package pin before cutover. ' +
      'Carry never-started queued jobs into the candidate only after checking there is no native operation and source and authority remain current. ' +
      'Treat any blocked old native operation as a pin conflict requiring controlled old-pin drainage, or an explicit separately qualified replacement.';
  } catch (error) {
    result.status = 'failed';
    result.error = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    await save(result);
  }
  return result;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [app, candidateApp, dsn, dirInput, option] = process.argv.slice(2);
  assert.ok(app && candidateApp && dsn && dirInput && (option === undefined || option === '--provision'),
    'Usage: node run.mjs BASELINE_APP CANDIDATE_APP LOOPBACK_FIXTURE_DSN OUTPUT [--provision]');
  const { openFixture } = await import('../fixture.mjs');
  const dir = resolve(dirInput);
  await mkdir(dir, { recursive: true });
  const baseline = await openFixture({ app: resolve(app), dsn, dir: join(dir, 'baseline-worker') });
  let candidate;
  try {
    if (option === '--provision') await baseline.provision();
    candidate = await openFixture({ app: resolve(candidateApp), dsn, dir: join(dir, 'candidate-reader') });
    await qualifyOldPins({ baseline, candidate, candidateApp: resolve(candidateApp),
      save: report => writeFile(join(dir, 'old-pin.json'), JSON.stringify(report, null, 2) + '\n') });
  } finally {
    await candidate?.close();
    await baseline.close();
  }
}
