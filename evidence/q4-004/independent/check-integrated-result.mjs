import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const [reportPath, evidencePath] = process.argv.slice(2);
assert.ok(reportPath && evidencePath, 'Pass the integrated replay JSON and evidence directory');
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const expected = {
  delegation: [2, 1, 0, 3, 1, ['visibility-reserved']],
  correction: [1, 1, 0, 2, 0, ['retain-comments']],
  greeting: [0, 1, 0, 0, 0, []],
  contradiction: [1, 1, 1, 3, 1, ['current-internal', 'permanent-reserved']],
  'duplicate-delivery': [0, 0, 0, 0, 0, []],
  'verified-outcome': [1, 1, 0, 2, 0, ['reopen-wrong-version']],
};
const totals = [0, 0, 0, 0, 0];
assert.deepEqual(report.paired.map(row => row.id), Object.keys(expected));
for (const row of report.paired) {
  const actual = [
    row.nativeAttributable, row.nativeUnsupported, row.nativeAmbiguous,
    row.sourceOnlySupported, row.sourceOnlyUnknown, row.omittedFromNative,
  ];
  assert.deepEqual(actual, expected[row.id]);
  for (let index = 0; index < totals.length; index++) totals[index] += actual[index];
}
assert.deepEqual(totals, [5, 5, 1, 10, 2]);
for (const field of ['additionalModelRequests', 'additionalForegroundPromptBytes', 'additionalSendRoundTrips']) {
  assert.equal(report.resources[field], 0);
}

const decisions = [
  ['prepared-only', 'not-published'],
  ['invalidated-after-prepare', 'stale-authority'],
  ['changed-source', 'source-revision-mismatch'],
  ['historical-publication', 'stale-authority'],
  ['foreign-scope', 'scope-mismatch'],
];
const resourceDirectories = { 'prior-capture-metadata': 'baseline' };
async function verifyLedger(usage) {
  let bytes = 0;
  for (const item of usage.ledger) {
    const rawBytes = (await stat(join(evidencePath, resourceDirectories[item.kind] ?? 'fixtures', item.path))).size;
    assert.equal(rawBytes, item.bytes, item.path);
    bytes += rawBytes;
  }
  assert.equal(bytes, usage.bytes);
  assert.equal(usage.ledger.length, usage.reads);
  return { reads: usage.reads, bytes };
}
const measured = { shared: await verifyLedger(report.resources.shared) };
for (const arm of ['native', 'sourceOnly']) {
  const { rows, controls, usage } = report[arm];
  assert.deepEqual(controls.map(row => [row.id, row.reason]), decisions);
  assert.ok(controls.every(row => row.accepted.length === 0));
  const duplicate = rows.find(row => row.id === 'duplicate-delivery');
  assert.equal(duplicate.reason, 'duplicate-operation');
  assert.deepEqual(duplicate.accepted, []);
  const changed = controls.find(row => row.id === 'changed-source');
  assert.notEqual(changed.observedSourceRevision, changed.expectedSourceRevision);
  const sourceFiles = usage.ledger.filter(row => row.kind === 'sources');
  assert.equal(sourceFiles.length, 6);
  assert.equal(usage.sourcePasses, sourceFiles.length);
  assert.equal(new Set(sourceFiles.map(row => row.path)).size, 6);
  assert.ok(sourceFiles.every(row => row.caseId in expected
    ? row.path === 'sources/' + row.caseId + '.json'
    : row.caseId === 'changed-source'));
  assert.equal(usage.sourcePassesByCase['duplicate-delivery'], undefined);
  assert.equal(sourceFiles.find(row => row.caseId === 'changed-source')?.path,
    'sources/changed-source.json');
  assert.equal(rows.find(row => row.id === 'verified-outcome').artifactChecks['retry-one-comment'].verified, true);
  const reopen = rows.find(row => row.id === 'verified-outcome').artifactChecks['reopen-wrong-version'];
  assert.ok(reopen.verified && reopen.expected === 'v1' && reopen.actual === 'v2');
  measured[arm] = { ...await verifyLedger(usage), sourcePasses: sourceFiles.length };
}
console.log(JSON.stringify({
  paired: { nativeAttributable: totals[0], nativeUnsupported: totals[1], nativeAmbiguous: totals[2],
    sourceOnlySupported: totals[3], sourceOnlyUnknown: totals[4] },
  acceptedFromDuplicateOrControls: 0,
  measured,
  additionalModelRequests: report.resources.additionalModelRequests,
  additionalForegroundPromptBytes: report.resources.additionalForegroundPromptBytes,
  additionalSendRoundTrips: report.resources.additionalSendRoundTrips,
}, null, 2));
