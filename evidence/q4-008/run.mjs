import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { designSha, git, openFixture } from './fixture.mjs';

const [app, design, dsn, dir, selected = 'before-prepare,after-prepare,after-publish,cross-thread'] = process.argv.slice(2);
assert.ok(app && design && dsn && dir, 'Usage: node run.mjs CANDIDATE_APP DESIGN LOOPBACK_DSN OUTPUT [CASES]');
assert.equal(git(resolve(design), 'rev-parse', 'HEAD').toString().trim(), designSha);
const cases = selected.split(',');
assert.ok(cases.length && new Set(cases).size === cases.length);
assert.ok(cases.every(label => ['before-prepare', 'after-prepare', 'after-publish', 'cross-thread'].includes(label)));
await mkdir(dir, { recursive: true });
const capture = { schema: 'quellight.q4-008.worker-recovery@1', status: 'started', design: designSha,
  model: 'Deterministic offline fixture. No live providers.', cases: [] };
const save = () => writeFile(join(dir, 'capture.json'), JSON.stringify(capture, null, 2) + '\n');
const model = run => run.events.filter(event => event.type === 'model');
const delivered = run => run.events.filter(event => event.type === 'delivery');
const dispatch = run => run.events.find(event => event.type === 'dispatch').result;
const prepared = state => state.row.events.filter(event => event.name === 'prepared').length;
const published = state => state.row.events.filter(event => event.name === 'published').length;
const members = membership => {
  assert.equal(membership?.schema, 'vict.mastra-observation-membership@1');
  assert.equal(membership.groups.length, 1);
  assert.equal(membership.groups[0].status, 'available');
  assert.equal(membership.groups[0].basis, 'observe-input');
  return membership.groups[0].messageIds;
};

let fixture;
try {
  fixture = await openFixture({ app, dsn, dir });
  capture.install = fixture.identity;
  capture.postgres = fixture.postgres;
  assert.equal(fixture.identity.installedBinding, 'candidate');
  await fixture.provision();
  for (const label of cases) {
    const report = { label, status: 'started', phase: 'seed' };
    capture.cases.push(report);
    const cross = label === 'cross-thread';
    const scope = await fixture.createScenario(label, { twoThreads: cross });
    report.scope = scope;
    const a = await fixture.settle(scope, 'A');
    report.seed = { a, ...(cross ? { b: await fixture.settle(scope, 'B') } : {}) };
    const originalIds = a.originals.sources.map(entry => entry.id);
    const jobId = a.job.id;
    const interrupted = fixture.launch(scope, { barrier: cross ? 'after-prepare' : label });
    report.phase = 'barrier';
    try {
      report.barrier = await interrupted.waitForBarrier();
      assert.equal(report.barrier.operationId, 'memory-job:' + jobId);
      report.whileStoppedAtBarrier = await fixture.rawWitness(scope, jobId);
      assert.equal(report.whileStoppedAtBarrier.job.state, 'running');
      const seen = report.whileStoppedAtBarrier;
      if (label === 'before-prepare') {
        assert.equal(seen.row.status, 'running');
        assert.equal(seen.row.has_checkpoint, false);
        assert.equal(prepared(seen), 0);
      } else {
        assert.equal(seen.row.status, label === 'after-publish' ? 'completed' : 'prepared');
        assert.equal(prepared(seen), 1);
        assert.equal(published(seen), label === 'after-publish' ? 1 : 0);
        assert.deepEqual(members(seen.row.prepared_membership), originalIds);
      }
    } finally { report.terminatedWorker = await interrupted.kill(); }
    assert.ok(report.terminatedWorker.signal || report.terminatedWorker.code !== 0);
    assert.equal(model(report.terminatedWorker).length, 1);
    assert.deepEqual(model(report.terminatedWorker)[0].tags, ['SYN_U01', 'SYN_A01']);
    assert.equal(report.terminatedWorker.events.some(event => event.type === 'dispatch'), false);
    report.phase = 'after-process-death';
    report.afterDeath = await fixture.witness(scope, jobId);
    assert.equal(report.afterDeath.row.checkpoint_digest, report.whileStoppedAtBarrier.row.checkpoint_digest);
    assert.equal(report.afterDeath.public.exposesCheckpointMembership, false);
    if (label !== 'after-publish') assert.equal(report.afterDeath.public.hasResult, false);
    await save();
    report.claimExpiry = await fixture.waitForClaimExpiry(jobId);

    if (cross) {
      report.phase = 'care';
      const b = report.seed.b;
      const target = b.originals.sources[0].id;
      assert.equal(b.conversationId, scope.otherConversationId);
      assert.notEqual(b.conversationId, a.conversationId);
      report.care = await fixture.care(scope, 'memory.forget', { conversationId: b.conversationId,
        expectedAuthorityRevision: report.afterDeath.authority, sourceMessageIds: [target] });
      assert.equal(report.care.ok, true, JSON.stringify(report.care));
      const currentAuthority = report.care.value.authorityRevision;
      assert.notEqual(currentAuthority, report.afterDeath.authority);
      report.afterCareBeforePurge = await fixture.witness(scope, jobId);
      assert.equal(report.afterCareBeforePurge.job.state, 'superseded');
      assert.equal(report.afterCareBeforePurge.row.status, 'prepared');
      assert.equal(report.afterCareBeforePurge.row.checkpoint_digest, report.afterDeath.row.checkpoint_digest);
      assert.deepEqual(report.afterCareBeforePurge.public, { status: 'superseded', hasCheckpoint: false,
        hasResult: false, exposesCheckpointMembership: false, sourceMembership: null });
      assert.equal(report.afterCareBeforePurge.authority, currentAuthority);
      report.currentSources = { a: await fixture.sourcePage(scope), b: await fixture.sourcePage(scope, b.conversationId) };
      for (const one of Object.values(report.currentSources)) assert.equal(one.authorityRevision, currentAuthority);
      assert.deepEqual(report.currentSources.a.sources.map(entry => entry.id), originalIds);
      assert.ok(report.currentSources.b.sources.find(entry => entry.id === target)?.excluded);
      const eligibleA = report.currentSources.a.sources.filter(entry => !entry.excluded).map(entry => entry.id);
      assert.deepEqual(eligibleA, [originalIds[0]]);
      report.phase = 'current-dispatch';
      report.restartedWorker = await fixture.launch(scope).done();
      assert.ok(delivered(report.restartedWorker).every(item => item.jobId !== jobId && item.authority === currentAuthority));
      assert.equal(model(report.restartedWorker).length, 1);
      assert.deepEqual(model(report.restartedWorker)[0].tags, ['SYN_U01']);
      report.jobsAfterCareDelivery = await fixture.listJobs(scope);
      const currentA = report.jobsAfterCareDelivery.find(job => job.conversation_id === a.conversationId &&
        job.authority_revision === currentAuthority && job.kind === 'observe');
      assert.ok(currentA && currentA.id !== jobId);
      report.stale = await fixture.witness(scope, jobId);
      assert.equal(published(report.stale), 0);
      assert.equal(report.stale.job.attempts, 1);
      assert.equal(report.stale.row.status, 'superseded');
      report.current = await fixture.witness(scope, currentA.id);
      assert.equal(report.current.job.state, 'completed');
      assert.equal(published(report.current), 1);
      assert.deepEqual(members(report.current.public.sourceMembership), eligibleA);
      assert.equal(report.current.authority, currentAuthority);
    } else {
      report.phase = 'reclaim';
      report.restartedWorker = await fixture.launch(scope).done();
      assert.notEqual(report.restartedWorker.pid, report.terminatedWorker.pid);
      assert.deepEqual(delivered(report.restartedWorker).map(entry => [entry.jobId, entry.attempt]), [[jobId, 2]]);
      assert.equal(model(report.restartedWorker).length, label === 'before-prepare' ? 1 : 0);
      report.current = await fixture.witness(scope, jobId);
      assert.deepEqual(report.current.history.map(item => [item.state, item.code]), [
        ['queued', null], ['running', null], ['retryable', 'HOST_INTERRUPTED'], ['running', null], ['completed', null],
      ]);
      assert.equal(report.current.job.state, 'completed');
      assert.equal(report.current.row.status, 'completed');
      assert.equal(prepared(report.current), 1);
      assert.equal(published(report.current), 1);
      assert.deepEqual(members(report.current.public.sourceMembership), originalIds);
      assert.deepEqual(report.current.row.published_membership, report.current.public.sourceMembership);
      if (label !== 'before-prepare') {
        assert.equal(report.current.row.checkpoint_digest, report.afterDeath.row.checkpoint_digest);
        assert.deepEqual(report.current.public.sourceMembership, report.afterDeath.row.prepared_membership);
      }
      if (label === 'after-publish') assert.equal(report.current.row.result_digest, report.afterDeath.row.result_digest);
    }

    report.phase = 'duplicate-notification';
    report.duplicateDelivery = await fixture.launch(scope).done();
    assert.deepEqual(dispatch(report.duplicateDelivery), { handled: 0, busy: false });
    assert.equal(model(report.duplicateDelivery).length, 0);
    report.afterDuplicate = await fixture.witness(scope, report.current.job.id);
    assert.equal(report.afterDuplicate.row.result_digest, report.current.row.result_digest);
    assert.deepEqual(report.afterDuplicate.history, report.current.history);
    assert.equal(published(report.afterDuplicate), 1);
    report.status = 'passed';
    report.phase = 'complete';
    await save();
    console.log(`Passed ${label}`);
  }
  capture.status = 'passed';
} catch (error) {
  capture.status = 'failed';
  capture.error = { name: error.name, message: error.message, stack: error.stack };
  process.exitCode = 1;
  console.error(error);
} finally {
  await save();
  await fixture?.close();
}
