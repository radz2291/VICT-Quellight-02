import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [coreFile, oldFile, independentFile] = process.argv.slice(2);
assert.ok(coreFile && oldFile && independentFile, 'Usage: node summarize.mjs CORE_CAPTURE OLD_PIN_CAPTURE INDEPENDENT_CAPTURE');
const read = async file => {
  const bytes = await readFile(file);
  const record = JSON.parse(bytes);
  assert.equal(record.status, 'passed', file);
  return { record, digest: createHash('sha256').update(bytes).digest('hex') };
};
const [core, old, review] = await Promise.all([read(coreFile), read(oldFile), read(independentFile)]);

function describe(witness) {
  const { job, row, public: projected, history, receipts } = witness;
  return {
    job: { id: job.id, state: job.state, attempts: job.attempts, sourceRevision: job.source_revision,
      configurationRevision: job.configuration_revision, authorityRevision: job.authority_revision, failure: job.failure_code },
    operation: { id: witness.operationId, status: row?.status ?? null, sourceRevision: row?.source_digest ?? null,
      configurationRevision: row?.configuration_revision ?? null, authorityRevision: row?.authority_revision ?? null,
      requestDigest: row?.request_digest ?? null, checkpointDigest: row?.checkpoint_digest ?? null,
      resultDigest: row?.result_digest ?? null,
      preparations: row?.events.filter(event => event.name === 'prepared').length ?? 0,
      publications: row?.events.filter(event => event.name === 'published').length ?? 0 },
    preparedMembership: row?.prepared_membership ?? null,
    publicProjection: projected,
    history,
    scopes: { activeNativeConfigurationRevision: witness.configurationRevision, activeAuthorityRevision: witness.authority },
    governedReceipts: receipts,
  };
}

const countModels = (run, jobId) => run.events.filter(event => event.type === 'model' && (!jobId || event.jobId === jobId)).length;
function recoveryCases(record) {
  return record.cases.map(item => ({
    case: item.label,
    interruption: item.barrier,
    pausedProcess: item.terminatedWorker.pid,
    restartProcess: item.restartedWorker.pid,
    actualClaimExpiry: item.claimExpiry,
    checkpointSeenBeforeKill: item.whileStoppedAtBarrier.row.checkpoint_digest,
    commitSeenBeforeKill: item.whileStoppedAtBarrier.row.result_digest,
    interrupted: describe(item.afterDeath),
    current: describe(item.current),
    ...(item.stale ? { stale: describe(item.stale), care: item.care } : {}),
    inference: { original: countModels(item.terminatedWorker), repeatedForSameJob: countModels(item.restartedWorker, item.seed.a.job.id),
      currentReplacement: item.stale ? countModels(item.restartedWorker, item.current.job.id) : 0,
      duplicate: countModels(item.duplicateDelivery) },
  }));
}

const { oldQueued: queued, oldPrepared: prepared } = old.record.cases;
console.log(JSON.stringify({
  schema: 'quellight.q4-008.case-table@1',
  pins: old.record.pins,
  captures: { samePin: core.digest, oldPin: old.digest, independent: review.digest },
  samePin: recoveryCases(core.record),
  oldPin: [
    { case: 'queued-without-native-operation', before: describe(queued.before), candidate: describe(queued.after),
      candidateModelCalls: queued.dispatch.modelCalls, disposition: queued.disposition },
    { case: 'prepared-with-old-native-operation', interrupted: describe(prepared.atBarrier),
      candidateRefusal: describe(prepared.candidateRefusal), governedOldPinRetry: prepared.retry,
      oldPinDrain: describe(prepared.candidateReadAfterDrain), final: describe(prepared.afterDuplicate),
      inference: { initialOldPin: prepared.initialModelCalls, candidate: prepared.candidateDispatch.modelCalls,
        oldPinDrain: prepared.drain.modelCalls, duplicate: prepared.duplicateDelivery.modelCalls },
      disposition: prepared.disposition },
  ],
  independent: recoveryCases(review.record),
}, null, 2));
