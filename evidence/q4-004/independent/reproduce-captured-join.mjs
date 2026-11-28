import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2];
assert.ok(root, 'Pass the q4-004 evidence directory');
const json = async (...parts) => JSON.parse(await readFile(join(root, ...parts), 'utf8'));
const [manifest, sourceFile, anchor, audit] = await Promise.all([
  json('fixtures', 'cases.json'),
  json('fixtures', 'sources', 'delegation.json'),
  json('baseline', 'q4-001-cold-anchor.json'),
  json('baseline', 'q4-001-cold-audit.json'),
]);
const [entry] = manifest.cases.filter(candidate => candidate.id === 'delegation');
assert.ok(entry);
assert.equal(entry.origin, 'captured-q4-001-publication-epoch');
assert.equal(manifest.appSha, '14b6ccaf6f409eac3e041dc3d9abd0bb9f875344');
assert.equal(manifest.designSha, '9dbfd28175d86b28f9a52340aa4939b4ed11db81');
assert.equal(manifest.appSha, audit.appSha);
assert.equal(manifest.designSha, audit.designSha);
const { actorId, roomId, conversationId } = sourceFile.scope;
assert.deepEqual(entry.scope, { actorId, roomId, conversationId });
assert.deepEqual(entry.scope, { actorId: anchor.actorId, roomId: anchor.roomId, conversationId: anchor.conversationId });

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// The pinned app's public source hash uses an array in chronological turn order
// and a JSON projection with this field order. Native inference has a separate digest.
function publicRows(messages) {
  return messages.map(({ public: message }) => ({
    id: message.id, turnId: message.turnId, role: message.role, text: message.text, at: message.at,
  }));
}
function matchSource(messages) {
  const calculated = hash(publicRows(messages));
  if (calculated !== entry.job.sourceRevision) return { accepted: false, calculated, reason: 'source-revision-mismatch' };
  return { accepted: true, calculated };
}

assert.equal(sourceFile.messages.length, 2);
const rows = publicRows(sourceFile.messages);
assert.deepEqual(rows, anchor.sourceMessages);
assert.deepEqual(entry.turns, [{ id: anchor.turnId, state: 'settled' }]);
assert.deepEqual(rows.map(({ role }) => role), ['user', 'assistant']);
assert.ok(Date.parse(rows[0].at) < Date.parse(rows[1].at));
for (const row of rows) {
  assert.equal(row.turnId, anchor.turnId);
  assert.equal(row.id, row.turnId + ':' + row.role);
}
assert.deepEqual(rows.map(({ id }) => id), audit.sourceIds);
assert.equal(audit.sourceTurnId, anchor.turnId);

const original = matchSource(sourceFile.messages);
assert.equal(original.accepted, true);
assert.equal(original.calculated, anchor.queued.source_revision);
assert.equal(original.calculated, audit.productSourceRevision);

const { job, operation, receipt, authority } = entry;
assert.equal(job.kind, 'observe');
assert.equal(job.id, anchor.queued.id);
assert.equal(job.id, audit.productJobId);
assert.equal(job.status, anchor.settledJob.state);
assert.equal(job.status, 'completed');
assert.equal(job.configurationRevision, anchor.queued.configuration_revision);
assert.equal(job.configurationRevision, audit.pinnedProductConfiguration);
assert.equal(job.authorityRevision, authority.revision);
assert.equal(job.authorityRevision, anchor.queued.authority_revision);
assert.equal(job.authorityRevision, audit.pinnedAuthorityRevision);
assert.deepEqual(authority.excludedNativeIds, []);
const computedJobKey = hash({ actorId, conversationId, kind: job.kind,
  source: original.calculated, configuration: job.configurationRevision, authority: job.authorityRevision, supersedes: null });
assert.equal(computedJobKey, job.key);
assert.equal(computedJobKey, anchor.queued.job_key);
assert.equal(computedJobKey, audit.jobKey);

assert.equal(operation.id, 'memory-job:' + job.id);
assert.equal(operation.id, anchor.settledJob.operation_id);
assert.equal(operation.id, audit.nativeOperationId);
assert.equal(operation.status, 'completed');
assert.equal(operation.status, anchor.settledJob.native_status);
assert.equal(operation.configurationRevision, anchor.settledJob.native_config);
assert.equal(operation.configurationRevision, audit.nativeConfiguration);
assert.equal(operation.authorityRevision, authority.revision);
assert.equal(operation.sourceDigest, anchor.settledJob.native_source_digest);
assert.equal(operation.sourceDigest, audit.nativeSourceDigest);
assert.notEqual(operation.sourceDigest, original.calculated);
assert.deepEqual(operation.events, audit.nativeEvents);
assert.deepEqual(operation.events.map(({ name }) => name), [
  'observe-started', 'observer-started', 'observer-completed', 'prepared', 'published',
]);
const publication = operation.events.at(-1);
assert.ok(Date.parse(operation.events.at(-2).at) <= Date.parse(publication.at));
assert.ok(Date.parse(rows.at(-1).at) <= Date.parse(publication.at));
assert.ok(Date.parse(publication.at) <= Date.parse(anchor.settledJob.updated_at));
assert.equal(anchor.settledJob.result.operationId, operation.id);
assert.equal(anchor.settledJob.result.snapshot.authorityRevision, operation.authorityRevision);
assert.equal(anchor.settledJob.result.snapshot.conversationId, conversationId);
assert.equal(anchor.settledJob.result.snapshot.resourceId, 'vict-actor-' + actorId);
assert.equal(anchor.settledJob.result.observed, true);
assert.equal(operation.observation, anchor.settledJob.result.snapshot.current.observations);

const range = operation.observation.match(/range="([^:"]+):([^"]+)"/)?.slice(1);
assert.deepEqual(range, sourceFile.messages.map(message => message.nativeId));
assert.deepEqual(range, audit.nativeRangeSourceIds);
assert.match(rows[0].text, /I decide who sees unpublished cuts\./);
assert.match(rows[1].text, /You decide who can see unpublished cuts\./);
assert.ok(!rows.some(({ text }) => /internal-only/i.test(text)));
assert.match(operation.observation, /has selected internal-only unpublished cuts\./);

assert.equal(receipt.id, audit.invocationId);
assert.equal(receipt.operationId, operation.id);
assert.equal(receipt.status, 'completed');
assert.equal(receipt.status, audit.receiptStatus);
assert.equal(receipt.capability, 'quellight.memory.maintain@1');
assert.equal(receipt.capability, audit.invokedCapability);
assert.equal(receipt.sourceDigest, operation.sourceDigest);
assert.equal(receipt.configurationRevision, operation.configurationRevision);
assert.equal(receipt.authorityRevision, operation.authorityRevision);
assert.equal(audit.currentNativeStatus, 'superseded');

const edited = structuredClone(sourceFile.messages);
edited[0].public.text = 'I already decided unpublished cuts are public.';
const tampered = matchSource(edited);
assert.deepEqual(tampered, { accepted: false, calculated: hash(publicRows(edited)), reason: 'source-revision-mismatch' });
assert.notEqual(tampered.calculated, original.calculated);
assert.equal(entry.job.sourceRevision, original.calculated);
console.log(JSON.stringify({
  app: manifest.appSha, design: manifest.designSha, tested: 'offline captured publication epoch',
  positive: {
    sourceTurn: anchor.turnId, sourceIds: rows.map(({ id }) => id), nativeIds: range,
    productSourceRevision: original.calculated, computedJobKey, jobId: job.id, nativeOperation: operation.id,
    historicalNativeStatus: operation.status, publishedAt: publication.at, laterNativeStatus: audit.currentNativeStatus,
    knownReceipt: receipt.id, capability: receipt.capability, receiptStatus: receipt.status,
    semanticNegative: 'Visibility was reserved in both source rows. The fixture observation reports an unsupported internal-only decision.',
  },
  negative: { pinnedSourceRevision: entry.job.sourceRevision, alteredSourceRevision: tampered.calculated,
    accepted: tampered.accepted, reason: tampered.reason },
  scope: 'The receipt identification reuses the captured database audit. The native stage source digest cross-checks captured records. No database, model or deployment was contacted.',
}, null, 2));
