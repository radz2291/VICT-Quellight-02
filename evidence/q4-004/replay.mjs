import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const root = new URL('./fixtures/', import.meta.url);
const baseline = new URL('./baseline/', import.meta.url);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const appSha = '14b6ccaf6f409eac3e041dc3d9abd0bb9f875344';
const designSha = '9dbfd28175d86b28f9a52340aa4939b4ed11db81';
const lockSha = '31b606ed8bdffa497bd4621f87877900ed3767f2f0ee0a5681f384e75d75e225';
const mastraSha = '90b2de7c6515785e23b4e6370c92be019959ffca430a7980f6752d5d104c9b2c';

function makeReader() {
  const ledger = [];
  return {
    async json(base, path, kind, caseId) {
      const bytes = await readFile(new URL(path, base));
      ledger.push({ path, kind, ...(caseId ? { caseId } : {}), bytes: bytes.length });
      return JSON.parse(bytes);
    },
    totals() {
      return {
        reads: ledger.length,
        bytes: ledger.reduce((sum, row) => sum + row.bytes, 0),
        sourcePasses: ledger.filter(row => row.kind === 'sources').length,
        sourceBytes: ledger.filter(row => row.kind === 'sources').reduce((sum, row) => sum + row.bytes, 0),
        sourcePassesByCase: Object.fromEntries(ledger
          .filter(row => row.kind === 'sources').map(row => [row.caseId, 1])),
        ledger,
      };
    },
  };
}

const start = performance.now();
const shared = makeReader();
const fixture = await shared.json(root, 'cases.json', 'case-index');
const audit = await shared.json(baseline, 'q4-001-cold-audit.json', 'prior-capture-metadata');
assert.equal(fixture.schema, 'quellight.4r.offline-evidence-fixture@1');
assert.equal(fixture.appSha, appSha);
assert.equal(fixture.designSha, designSha);
assert.equal(audit.appSha, appSha);
assert.equal(audit.designSha, designSha);
assert.equal(audit.lockCanonicalSha256, lockSha);
assert.equal(audit.mastraArchiveSha256, mastraSha);
assert.equal(fixture.deliveries.length, 6);

const cases = new Map(fixture.cases.map(item => [item.id, item]));
const calibration = cases.get('delegation');
assert.equal(calibration.origin, 'captured-q4-001-publication-epoch');
assert.deepEqual(calibration.turns.map(turn => turn.id), [audit.sourceTurnId]);
assert.equal(calibration.job.id, audit.productJobId);
assert.equal(calibration.job.key, audit.jobKey);
assert.equal(calibration.job.sourceRevision, audit.productSourceRevision);
assert.equal(calibration.job.configurationRevision, audit.pinnedProductConfiguration);
assert.equal(calibration.job.authorityRevision, audit.pinnedAuthorityRevision);
assert.equal(calibration.operation.id, audit.nativeOperationId);
assert.equal(calibration.operation.sourceDigest, audit.nativeSourceDigest);
assert.equal(calibration.operation.configurationRevision, audit.nativeConfiguration);
assert.deepEqual(calibration.operation.events, audit.nativeEvents);
assert.equal(calibration.receipt.id, audit.invocationId);
assert.equal(calibration.receipt.capability, audit.invokedCapability);
assert.equal(calibration.receipt.status, audit.receiptStatus);
assert.notEqual(audit.productSourceRevision, audit.nativeSourceDigest);

function observationRange(text) {
  const match = /^<observation-group id="[^"]+" range="([^":]+):([^":]+)">\n([\s\S]+)\n<\/observation-group>$/.exec(text);
  assert.ok(match, 'The fixture must have one explicit native observation range');
  return { first: match[1], last: match[2], body: match[3] };
}
const capturedRange = observationRange(calibration.operation.observation);
assert.deepEqual([capturedRange.first, capturedRange.last], audit.nativeRangeSourceIds);

function scenario(delivery, original) {
  const record = structuredClone(original);
  const scope = { ...record.scope };
  switch (delivery.state) {
    case 'as-recorded':
    case 'changed-source':
      break;
    case 'invalidated-after-prepare':
      record.authority = {
        revision: 'synthetic-authority-1',
        excludedNativeIds: [observationRange(record.operation.observation).first],
        invalidatedAt: '2026-11-28T03:01:00.500Z',
      };
      assert.ok(record.authority.invalidatedAt > record.operation.events.find(event => event.name === 'prepared').at);
      // This delivery still refers to the old preparation and its old revisions.
    case 'prepared-only':
      record.job.status = 'running';
      record.operation.status = 'prepared';
      record.operation.events = record.operation.events.filter(event => event.name !== 'published');
      record.receipt.status = 'started';
      break;
    case 'historical-publication':
      assert.equal(record.origin, 'captured-q4-001-publication-epoch');
      record.operation.status = audit.currentNativeStatus;
      break;
    case 'foreign-scope':
      scope.roomId = 'outside-replay-scope';
      break;
    default:
      assert.fail('Unknown replay condition: ' + delivery.state);
  }
  return { record, scope };
}

const sameScope = (a, b) => ['actorId', 'roomId', 'conversationId'].every(key => a[key] === b[key]);

function checkOperation(record, scope) {
  const { job, operation, receipt, authority } = record;
  if (!sameScope(record.scope, scope)) return 'scope-mismatch';
  if (operation.status === 'superseded' ||
      [job, operation, receipt].some(row => row.authorityRevision !== authority.revision)) return 'stale-authority';
  const prepared = operation.events.filter(event => event.name === 'prepared');
  const published = operation.events.filter(event => event.name === 'published');
  if (job.status !== 'completed' || operation.status !== 'completed' || receipt.status !== 'completed' ||
      prepared.length !== 1 || published.length !== 1 || published[0].at <= prepared[0].at) return 'not-published';
  const expectedKey = digest({
    actorId: scope.actorId, conversationId: scope.conversationId, kind: job.kind,
    source: job.sourceRevision, configuration: job.configurationRevision,
    authority: job.authorityRevision, supersedes: null,
  });
  if (job.kind !== 'observe' || job.key !== expectedKey ||
      operation.id !== 'memory-job:' + job.id || receipt.operationId !== operation.id ||
      receipt.capability !== 'quellight.memory.maintain@1' ||
      !/^[a-f0-9]{64}$/.test(operation.sourceDigest) || receipt.sourceDigest !== operation.sourceDigest ||
      receipt.configurationRevision !== operation.configurationRevision) return 'receipt-mismatch';
  return null;
}

function indexSources(bundle, record) {
  assert.ok(sameScope(bundle.scope, record.scope));
  const allowedTurns = new Map(record.turns.map(turn => [turn.id, turn.state]));
  const byPublicId = new Map();
  const byNativeId = new Map();
  const rows = [];
  for (const [position, row] of bundle.messages.entries()) {
    const { nativeId, public: message } = row;
    const { id, turnId, role, text, at } = message;
    const turnState = allowedTurns.get(turnId);
    assert.ok(role === 'user' || role === 'assistant');
    assert.ok(turnState === 'settled' || (turnState === 'interrupted' && role === 'user'));
    assert.equal(id, turnId + ':' + role);
    assert.ok(!byPublicId.has(id) && !byNativeId.has(nativeId), 'Source IDs must be unique');
    const source = { id, turnId, role, text, at };
    rows.push(source);
    byPublicId.set(id, { source, nativeId, position });
    byNativeId.set(nativeId, { source, position });
  }
  return { byPublicId, byNativeId, sourceRevision: digest(rows) };
}

function checkAcceptanceRun(artifact) {
  assert.equal(artifact.caseId, 'verified-outcome');
  const first = artifact.submissions.find(row => row.requestId === 'R1');
  const retry = artifact.submissions.find(row => row.requestId === 'R2');
  assert.ok(first && retry && first.intentId === 'INT-1' && first.intentId === retry.intentId);
  const stored = artifact.storedComments.filter(row => row.intentId === first.intentId);
  const duplicateIsSame = first.cutVersion === retry.cutVersion && stored.length === 1 &&
    stored[0].cutVersion === first.cutVersion &&
    [first, retry].every(row => row.returnedCommentId === stored[0].id);
  const reopen = artifact.reopenResults.find(row => row.commentId === first.returnedCommentId);
  assert.ok(reopen && stored.length > 0);
  return {
    'retry-one-comment': { verified: duplicateIsSame, requestIds: [first.requestId, retry.requestId],
      storedCommentIds: stored.map(row => row.id) },
    'reopen-wrong-version': {
      verified: stored[0].cutVersion === first.cutVersion && reopen.renderedCutVersion !== first.cutVersion,
      commentId: reopen.commentId, expected: first.cutVersion, actual: reopen.renderedCutVersion,
    },
  };
}

function resolveLabel(label, sources, record, range, artifactChecks) {
  const match = sources.byPublicId.get(label.sourceId);
  assert.ok(match && match.source.role === label.role, 'A claim needs an original source and its correct role');
  assert.ok(!record.authority.excludedNativeIds.includes(match.nativeId), 'Source is excluded');
  if (range) assert.ok(match.position >= range.start && match.position <= range.end);
  const start = match.source.text.indexOf(label.quote);
  assert.ok(label.quote && start >= 0, 'The quoted source span must occur verbatim');
  const artifact = label.check && artifactChecks[label.check];
  if (label.check) assert.equal(artifact?.verified, true, 'The independent artifact check must support the label');
  else assert.equal(label.role, 'user', 'Assistant opinion cannot authorize a claim');
  return {
    claim: label.claim, sourceId: match.source.id, nativeSourceId: match.nativeId, role: label.role,
    sourceSpan: { start, end: start + label.quote.length, text: label.quote },
    authority: label.authority, uncertainty: label.uncertainty,
    ...(artifact ? { artifact: { file: 'fixtures/acceptance-run.json', ...artifact } } : {}),
  };
}

async function compare(name) {
  const begin = performance.now();
  const io = makeReader();
  const labels = await io.json(root, name + '-labels.json', 'annotation-file');
  const acceptedOperations = new Set();
  const readScopes = new Set();
  async function replay(delivery) {
    const original = cases.get(delivery.case);
    assert.ok(original, 'Unknown source cohort');
    const { record, scope } = scenario(delivery, original);
    const { job, operation, receipt } = record;
    const identity = { turnIds: record.turns.map(turn => turn.id), jobId: job.id,
      operationId: operation.id, receiptId: receipt.id, authorityRevision: record.authority.revision };
    const rejected = (reason, detail = {}) => ({
      id: delivery.id, sourceCohort: original.id, identity, reason, accepted: [], diagnostics: [], ...detail,
    });
    const refusal = checkOperation(record, scope);
    if (refusal) return rejected(refusal);
    const occurrence = JSON.stringify([scope.actorId, scope.roomId, scope.conversationId, operation.id]);
    if (delivery.state === 'as-recorded' && acceptedOperations.has(occurrence)) return rejected('duplicate-operation');
    const sourcePath = delivery.sourceOverride ?? record.source;
    assert.ok(!readScopes.has(sourcePath), 'A source fixture may be read once per arm');
    readScopes.add(sourcePath);
    const scoped = await io.json(root, sourcePath, 'sources', delivery.id);
    const sources = indexSources(scoped, record);
    if (sources.sourceRevision !== job.sourceRevision) return rejected('source-revision-mismatch', {
      expectedSourceRevision: job.sourceRevision, observedSourceRevision: sources.sourceRevision,
    });

    let range;
    let body;
    if (name === 'native') {
      const observed = observationRange(operation.observation);
      range = { start: sources.byNativeId.get(observed.first)?.position,
        end: sources.byNativeId.get(observed.last)?.position };
      assert.ok(Number.isInteger(range.start) && Number.isInteger(range.end) && range.start <= range.end);
      body = observed.body;
    }
    const artifactChecks = original.id === 'verified-outcome'
      ? checkAcceptanceRun(await io.json(root, 'acceptance-run.json', 'independent-outcome', delivery.id))
      : {};
    const accepted = [];
    const diagnostics = [];
    for (const label of labels[original.id]) {
      if (name === 'native') {
        assert.ok(body.includes(label.nativeSpan), 'Native claim must appear in the published text');
        if (label.status === 'attributable') {
          accepted.push({ key: label.key, ...resolveLabel(label.support, sources, record, range, artifactChecks),
            nativeSpan: label.nativeSpan });
        } else {
          assert.ok(label.status === 'unsupported' || label.status === 'ambiguous');
          diagnostics.push(label);
        }
      } else {
        const claim = { key: label.key, ...resolveLabel(label, sources, record, range, artifactChecks) };
        if (label.uncertainty === 'confirmed') accepted.push(claim);
        else {
          assert.equal(label.uncertainty, 'unknown');
          diagnostics.push({ ...claim, status: 'unknown' });
        }
      }
    }
    acceptedOperations.add(occurrence);
    return { id: delivery.id, sourceCohort: original.id, identity,
      observedSourceRevision: sources.sourceRevision, reason: accepted.length ? 'eligible' : 'no-change',
      accepted, diagnostics, ...(Object.keys(artifactChecks).length ? { artifactChecks } : {}) };
  }

  const rows = [];
  for (const delivery of fixture.deliveries) rows.push(await replay(delivery));
  const controls = [];
  for (const delivery of fixture.controls) controls.push(await replay(delivery));
  assert.deepEqual(controls.map(row => [row.id, row.reason, row.accepted.length]), [
    ['prepared-only', 'not-published', 0],
    ['invalidated-after-prepare', 'stale-authority', 0],
    ['changed-source', 'source-revision-mismatch', 0],
    ['historical-publication', 'stale-authority', 0],
    ['foreign-scope', 'scope-mismatch', 0],
  ]);
  assert.equal(rows.find(row => row.id === 'duplicate-delivery').reason, 'duplicate-operation');
  const usage = io.totals();
  assert.equal(usage.sourcePasses, 6);
  assert.equal(usage.sourcePassesByCase['changed-source'], 1);
  for (const row of [...rows, ...controls]) {
    const takesSources = ['eligible', 'no-change', 'source-revision-mismatch'].includes(row.reason);
    assert.equal(usage.sourcePassesByCase[row.id] ?? 0, Number(takesSources));
  }
  return { rows, controls, usage, elapsedMs: Number((performance.now() - begin).toFixed(3)) };
}

const native = await compare('native');
const sourceOnly = await compare('source-only');
const paired = native.rows.map((row, i) => {
  const reference = sourceOnly.rows[i];
  assert.equal(row.id, reference.id);
  assert.equal(row.observedSourceRevision, reference.observedSourceRevision);
  const observed = new Set(row.accepted.map(claim => claim.key));
  const expected = new Set(reference.accepted.map(claim => claim.key));
  assert.ok([...observed].every(key => expected.has(key)), 'Unexpected accepted native claim: ' + row.id);
  return {
    id: row.id, sourceCohort: row.sourceCohort, disposition: row.reason,
    nativeAttributable: row.accepted.length,
    nativeUnsupported: row.diagnostics.filter(item => item.status === 'unsupported').length,
    nativeAmbiguous: row.diagnostics.filter(item => item.status === 'ambiguous').length,
    sourceOnlySupported: reference.accepted.length, sourceOnlyUnknown: reference.diagnostics.length,
    omittedFromNative: reference.accepted.filter(claim => !observed.has(claim.key)).map(claim => claim.key),
  };
});
assert.equal(paired.reduce((sum, row) => sum + row.nativeAttributable, 0), 5);
assert.equal(paired.reduce((sum, row) => sum + row.sourceOnlySupported, 0), 10);
const report = {
  schema: 'quellight.4r.offline-evidence-result@1', appSha, designSha, lockSha, mastraSha, node: process.version,
  scope: 'One captured historical calibration and pre-labelled synthetic case replay using local JSON inputs.',
  resources: { shared: shared.totals(), additionalModelRequests: 0, additionalForegroundPromptBytes: 0,
    additionalSendRoundTrips: 0, durationMs: Number((performance.now() - start).toFixed(3)) },
  paired, native, sourceOnly,
};
console.log(JSON.stringify(report, null, 2));
