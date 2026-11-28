import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const [path] = process.argv.slice(2);
assert.ok(path, 'Usage: node summarize.mjs /path/to/candidate/capture.json');
const capture = JSON.parse(await readFile(path, 'utf8'));
const concise = { schema: 'quellight.q4-007-summary@1', status: capture.status, capture: basename(path),
  source: { app: capture.appSha, candidateApp: capture.candidateAppSha, design: capture.designSha,
    fixture: capture.fixtureCommit, fixtureSha256: capture.fixtureSha256, baselineLockSha256: capture.lockSha,
    candidateCheckoutLockSha256: capture.candidateCheckoutLockSha256,
    baselineCaptureSha256: capture.baselineCaptureSha256, baselineMastraArchive: capture.baselineMastraArchive,
    candidateMastraArchive: capture.candidateMastraArchive, candidateInstalledNativeMemoryJs: capture.candidateInstalledNativeMemoryJs,
    candidateNativeMemoryArchive: capture.candidateNativeMemoryArchive, node: capture.node, postgres: capture.postgres },
  scope: capture.scope, resource: capture.resource, error: capture.error ?? null };
if (capture.status === 'passed') {
  assert.equal(capture.comparisons.length, 8);
  assert.equal(capture.controls.reads.length, 4);
  concise.originals = capture.inventories.at(-1).orderedOriginals.map(({ id, tag, role, excluded }) => ({ id, tag, role, excluded }));
  concise.comparisons = capture.comparisons.map(({ label, groupId, operationId, authorityRevision, expectedIds, expectedTags,
    acceptedIds, acceptedTags, basis, status, baselineApparentEligibleTags, baselineAcceptedTags, observationTextEquivalent }) =>
    ({ label, groupId, operationId, authorityRevision, expectedIds, expectedTags, acceptedIds, acceptedTags,
      basis, status, baselineApparentEligibleTags, baselineAcceptedTags, observationTextEquivalent }));
  concise.controls = { fixtureAuthoredRecords: capture.controls.fixtureAuthoredRecords, extraDeterministicReflectCalls: capture.controls.extraDeterministicReflectCalls,
    reads: capture.controls.reads.map(({ label, operation, disposition, groups }) => ({ label, operation, disposition, groups })) };
}
await writeFile(join(dirname(path), 'summary.json'), JSON.stringify(concise, null, 2) + '\n');
console.log(JSON.stringify({ ...concise, originals: undefined, comparisons: concise.comparisons?.map(({ label, expectedTags, acceptedTags }) =>
  ({ label, expectedTags, acceptedTags })), controls: concise.controls?.reads.map(({ label, operation, groups }) =>
  ({ label, operationStatus: operation?.status, publishedGroups: groups.map(group => ({ status: group.status, count: group.acceptedIds.length })) })) }, null, 2));
