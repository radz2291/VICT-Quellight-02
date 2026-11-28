import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { jsonBytes, sha256, sharedPrefix, summarizePrompt } from './prompt.mjs';
import { markerText, workload } from './workload.mjs';

const arms = ['control', 'room-block'];
const byCase = new Map([...workload.short, ...workload.long].map(row => [row.caseId, row]));

const metrics = {
  'promptBytes': row => row.prompt.bytes,
  'promptMessages': row => row.prompt.messages.length,
  'roomBlockBytes': row => row.prompt.roomBlockBytes,
  'modelCalls': row => row.foreground?.modelCalls,
  'admittedMs': row => row.foreground?.admittedMs,
  'modelInvocationMs': row => row.foreground?.modelInvocationMs,
  'firstModelDeltaMs': row => row.foreground?.firstModelDeltaMs,
  'postFirstModelDeltaMs': row => Number.isFinite(row.foreground?.firstModelDeltaMs) && Number.isFinite(row.foreground?.settledMs)
    ? row.foreground.settledMs - row.foreground.firstModelDeltaMs : null,
  'firstEventMs': row => row.foreground?.firstEventMs,
  'settledMs': row => row.foreground?.settledMs,
  'dbRequestWireBytes': row => row.foreground?.postgresWire?.sent,
  'dbResponseWireBytes': row => row.foreground?.postgresWire?.received,
  'dbConnections': row => row.foreground?.postgresWire?.connections,
  'dbExecuteFrames': row => row.foreground?.postgresWire?.queryExecutions,
  'dbSelectExecutions': row => row.foreground?.postgresWire?.selectExecutions,
  'namedReads': row => row.foreground?.namedReads,
  'roomSelectionReads': row => row.foreground?.roomSelectionReads,
  'roomSelectionResultBytes': row => row.foreground?.roomSelectionResultBytes,
};

const finite = Number.isFinite;
const n = value => Math.round(value * 100) / 100;
function distribution(values) {
  const sorted = values.filter(finite).sort((left, right) => left - right);
  if (!sorted.length) return { n: 0, minimum: null, p50: null, p95: null, maximum: null, total: null };
  const percentile = fraction => n(sorted[Math.ceil(sorted.length * fraction) - 1]);
  return { n: sorted.length, minimum: n(sorted[0]), p50: percentile(0.5), p95: percentile(0.95),
    maximum: n(sorted.at(-1)), total: n(sorted.reduce((sum, value) => sum + value, 0)) };
}

function verifyPrompt(row, markers) {
  if (!row.prompt || !Array.isArray(row.prompt.messages) || !row.prompt.markers) return 'missing model-bound prompt digest';
  const expectedBytes = 2 + Math.max(0, row.prompt.messages.length - 1) + row.prompt.messages.reduce((sum, message) => sum + message.bytes, 0);
  if (row.prompt.bytes !== expectedBytes || !/^[a-f0-9]{64}$/.test(row.prompt.sha256) ||
      !row.prompt.messages.every(message => typeof message.role === 'string' && /^[a-f0-9]{64}$/.test(message.sha256) &&
        Number.isSafeInteger(message.bytes) && message.bytes > 0)) return 'invalid prompt digest or byte totals';
  if (row.prompt.syntheticMessages) {
    const recaptured = summarizePrompt(row.prompt.syntheticMessages, { markers });
    if (recaptured.sha256 !== row.prompt.sha256 || JSON.stringify(recaptured.messages) !== JSON.stringify(row.prompt.messages) ||
        JSON.stringify(recaptured.markers) !== JSON.stringify(row.prompt.markers) ||
        JSON.stringify(recaptured.roomBlocks) !== JSON.stringify(row.prompt.roomBlocks)) return 'synthetic excerpt differs from recorded model-bound prompt';
  }
  return null;
}

function readUsage(rows) {
  const usage = rows.map(row => row.providerUsage ?? row.foreground?.providerUsage);
  const usageRows = usage.filter(entry => entry?.source === 'provider');
  const roleUsage = key => distribution(usageRows.map(entry => entry[key]));
  return { providerSamples: usageRows.length, fields: { inputTokens: roleUsage('inputTokens'), outputTokens: roleUsage('outputTokens'),
    totalTokens: roleUsage('totalTokens'), cachedInputTokens: roleUsage('cachedInputTokens'),
    uncachedInputTokens: roleUsage('uncachedInputTokens') },
    fixtureUsageSamples: usage.filter(entry => entry?.source === 'fixture').length,
    providerCacheStatus: usageRows.some(entry => finite(entry.cachedInputTokens)) ? 'observed' : 'unavailable' };
}

function armControl(entry) {
  const work = entry.maintenance?.flatMap(batch => batch.calls ?? []) ?? [];
  const roleCounts = Object.fromEntries(['observe', 'reflect'].map(role => [role, work.filter(call => call.kind === role).length]));
  const otherModelCalls = work.length - roleCounts.observe - roleCounts.reflect;
  const jobs = entry.maintenance?.flatMap(batch => batch.jobs ?? []) ?? [];
  const completedJobs = Object.fromEntries(['observe', 'reflect', 'purge'].map(kind => [kind,
    jobs.filter(job => job.kind === kind && job.state === 'completed').length]));
  const unsettledModelCalls = (entry.maintenance ?? []).flatMap(batch => (batch.calls ?? []).flatMap(call => {
    const outcome = (batch.jobs ?? []).find(job => job.id === call.jobId);
    return outcome?.state === 'completed' ? [] : [{ after: batch.after, jobId: call.jobId, kind: call.kind,
      state: outcome?.state ?? null, code: outcome?.code ?? null }];
  }));
  const desk = (entry.desk ?? []).map(({ revision, title, body }) => ({ revision, title, body }));
  const approvals = (entry.approvals ?? []).map(({ revision, block }) => ({ revision, blockSha256: sha256(block) }));
  const maintenance = (entry.maintenance ?? []).map(batch => ({ after: batch.after, reflected: Boolean(batch.reflection) }));
  return { status: entry.status, roleCounts, otherModelCalls, completedJobs, unsettledModelCalls, desk, approvals, maintenance };
}

function normalizeOrdinaryMessages(messages) {
  const uuids = new Map(), groups = new Map();
  const symbol = (lookup, family, value) => {
    if (!lookup.has(value)) lookup.set(value, `${family}_${lookup.size + 1}`);
    return lookup.get(value);
  };
  function visit(value, key, parent) {
    if (typeof value === 'string') return value
      .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, id => symbol(uuids, 'NATIVE_ID', id))
      .replace(/(<observation-group\s+id=")([^"]+)(")/g, (_match, before, id, after) => before + symbol(groups, 'GROUP', id) + after)
      .replace(/(## Group `)([0-9a-f]+|derived-group-\d+)(`)/g, (_match, before, id, after) => before + symbol(groups, 'GROUP', id) + after)
      .replace(/\b\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d)?\b/g, 'NATIVE_TIMESTAMP');
    if (typeof value === 'number' && parent === 'mastra' && key === 'createdAt') return 'NATIVE_TIMESTAMP';
    if (Array.isArray(value)) return value.map(child => visit(child, key, parent));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, visit(child, name, key)]));
    return value;
  }
  return messages.slice(1).map(message => visit(message));
}

function compareOrdinaryMessages(pair) {
  const old = pair.control.prompt.syntheticMessages, updated = pair.candidate.prompt.syntheticMessages;
  if (!old || !updated || old[0]?.role !== 'system' || updated[0]?.role !== 'system') return null;
  const control = normalizeOrdinaryMessages(old), roomBlock = normalizeOrdinaryMessages(updated);
  const differing = control.findIndex((message, index) => JSON.stringify(message) !== JSON.stringify(roomBlock[index]));
  const equal = differing < 0 && control.length === roomBlock.length;
  const row = { caseId: pair.caseId, equal, controlMessages: control.length, roomBlockMessages: roomBlock.length,
    normalizedDigests: { control: sha256(JSON.stringify(control)), roomBlock: sha256(JSON.stringify(roomBlock)) } };
  if (equal) return row;
  const index = differing < 0 ? control.length : differing;
  const left = JSON.stringify(control[index]) ?? '', right = JSON.stringify(roomBlock[index]) ?? '';
  let offset = 0;
  while (offset < Math.min(left.length, right.length) && left[offset] === right[offset]) offset++;
  return { ...row, difference: { messageIndex: index + 1, controlRole: control[index]?.role ?? null,
    roomBlockRole: roomBlock[index]?.role ?? null, reason: control.length !== roomBlock.length
      ? 'different ordinary message counts' : control[index]?.role !== roomBlock[index]?.role
        ? 'different ordinary role order' : 'ordinary message text or structure differs after known identity normalization',
    controlExcerpt: left.slice(Math.max(0, offset - 25), offset + 65),
    roomBlockExcerpt: right.slice(Math.max(0, offset - 25), offset + 65) } };
}

/** Analyze measured manifest rows. Exact prefix bytes require retained synthetic arrays on both rows. */
export function summarize(rows, { markers = markerText, expectedLong = workload.long.length, evidence = [],
  expectedPlacement = { index: 0, role: 'system' } } = {}) {
  assert.ok(Array.isArray(rows) && Number.isSafeInteger(expectedLong) && (expectedLong === 0 || expectedLong >= 100));
  const cases = new Map(), problems = [], placement = [], prefixes = [], blockByRevision = new Map(), declaredEchoes = new Map();
  for (const row of rows) {
    const name = `${row.arm}:${row.caseId}`;
    if (!arms.includes(row.arm) || typeof row.caseId !== 'string' || !['short', 'long'].includes(row.scenario)) {
      problems.push({ name, detail: 'invalid or missing arm, case ID or scenario' });
      continue;
    }
    if (!cases.has(row.caseId)) cases.set(row.caseId, {});
    const pair = cases.get(row.caseId);
    if (pair[row.arm]) {
      problems.push({ name, detail: 'duplicate case and arm' });
      continue;
    }
    const invalid = verifyPrompt(row, markers);
    if (invalid) {
      problems.push({ name, detail: invalid });
      continue;
    }
    pair[row.arm] = row;
    const configured = byCase.get(row.caseId);
    // An explicitly missing eligible revision is null. An absent field is only
    // inferable for the exact frozen synthetic case IDs shipped with this probe.
    const desired = Object.hasOwn(row, 'expectedRevision') ? row.expectedRevision : configured?.expectedRevision;
    const expected = row.arm === 'control' ? null : desired;
    const expectedKnown = expected === null || Object.hasOwn(markers, expected);
    const observed = [];
    const placementEntries = [];
    let allMarkerPositionsValid = true;
    for (const revision of Object.keys(markers)) {
      const hits = row.prompt.markers[revision];
      if (!Array.isArray(hits)) {
        allMarkerPositionsValid = false;
        continue;
      }
      if (hits.length) observed.push({ revision, occurrences: hits.length });
      for (const hit of hits) {
        placementEntries.push({ revision, ...hit });
        allMarkerPositionsValid &&= Number.isSafeInteger(hit.index) && hit.index >= 0 &&
          hit.index < row.prompt.messages.length && row.prompt.messages[hit.index].role === hit.role &&
          Number.isSafeInteger(hit.byteOffsetInContent) && hit.byteOffsetInContent >= 0;
      }
    }
    const blocks = row.prompt.roomBlocks;
    const [block] = blocks ?? [];
    const validBlocks = Array.isArray(blocks) && row.prompt.roomBlockBytes === blocks.reduce((sum, entry) => sum + entry.bytes, 0);
    const isInBlock = hit => block && block.index === hit.index && hit.byteOffsetInContent >= block.byteOffsetInContent &&
      hit.byteOffsetInContent < block.byteOffsetInContent + block.bytes;
    const blockMarkers = placementEntries.filter(isInBlock);
    const carryMarkers = placementEntries.filter(hit => !isInBlock(hit));
    const allowedCarry = new Set([row.requiredCarry, ...(row.allowedCarry ?? [])].filter(revision => revision != null));
    // The only implicit carry allowance comes from an earlier scripted echo
    // in this same thread and arm, while that revision remains current in the fixture.
    const threadKey = row.thread ? JSON.stringify([row.arm, row.scenario, row.thread]) : null;
    const earlierEchoes = declaredEchoes.get(threadKey) ?? new Set();
    if (desired != null && earlierEchoes.has(desired)) allowedCarry.add(desired);
    const carriesValid = carryMarkers.every(hit => hit.index > 0 && allowedCarry.has(hit.revision)) &&
      (!row.requiredCarry || carryMarkers.some(hit => hit.revision === row.requiredCarry)) &&
      !(row.confirmedAbsent ?? []).some(revision => observed.some(hit => hit.revision === revision));
    if (threadKey && row.echo != null && Object.hasOwn(markers, row.echo)) {
      earlierEchoes.add(row.echo);
      declaredEchoes.set(threadKey, earlierEchoes);
    }
    const matchesMarker = expected !== null && blockMarkers.length === 1 && blockMarkers[0].revision === expected;
    const exact = allMarkerPositionsValid && validBlocks && expectedKnown && (expected === null
      ? blocks.length === 0 && carriesValid
      : matchesMarker && carriesValid && blocks.length === 1 && block.revision === expected &&
        block.index === expectedPlacement.index && block.role === expectedPlacement.role && Number.isSafeInteger(block.byteOffsetInContent) &&
        block.byteOffsetInContent >= 0 && Number.isSafeInteger(block.bytes) && block.bytes > 0 && /^[a-f0-9]{64}$/.test(block.sha256));
    if (!exact) problems.push({ name, detail: 'unexpected, repeated, stale or unverified room revision in model-bound prompt' });
    if (!expectedKnown) problems.push({ name, detail: 'expected revision was undefined or not in the marker inventory' });
    if (row.selectedRevision !== undefined && row.selectedRevision !== expected) {
      problems.push({ name, detail: 'admission selection differs from the intended revision' });
    }
    if (configured && row.inputSha256 !== undefined && row.inputSha256 !== sha256(configured.input)) {
      problems.push({ name, detail: 'recorded input does not match the frozen case' });
    }
    if (exact && block) {
      const before = blockByRevision.get(block.revision);
      if (before && before !== block.sha256) problems.push({ name, detail: 'room block bytes changed under the same revision' });
      blockByRevision.set(block.revision, block.sha256);
    }
    placement.push({ caseId: row.caseId, arm: row.arm, scenario: row.scenario, expected: expected ?? null,
      selected: row.selectedRevision ?? null, selectedRecorded: Object.hasOwn(row, 'selectedRevision'), observed, placements: placementEntries,
      blocks: blocks ?? [], carry: { required: row.requiredCarry ?? null, allowed: [...allowedCarry], observed: carryMarkers }, exact,
      modelPromptSha256: row.prompt.sha256 });
  }

  const paired = [], unmatched = [];
  for (const [caseId, pair] of cases) {
    const control = pair.control, candidate = pair['room-block'];
    if (!control || !candidate) {
      unmatched.push({ caseId, missing: control ? 'room-block' : 'control' });
      continue;
    }
    if (control.scenario !== candidate.scenario ||
        (control.scenario === 'long' && (control.index ?? byCase.get(caseId)?.index) !== (candidate.index ?? byCase.get(caseId)?.index)) ||
        (control.inputSha256 && candidate.inputSha256 && control.inputSha256 !== candidate.inputSha256) ||
        (control.replySha256 && candidate.replySha256 && control.replySha256 !== candidate.replySha256) ||
        (control.firstSystem?.baseInstructionSha256 && candidate.firstSystem?.baseInstructionSha256 &&
          control.firstSystem.baseInstructionSha256 !== candidate.firstSystem.baseInstructionSha256) ||
        (control.admitted?.memory_settings && candidate.admitted?.memory_settings &&
          control.admitted.memory_settings !== candidate.admitted.memory_settings)) {
      problems.push({ name: caseId, detail: 'arms differ in matched request, reply, scenario, authored instructions or ordinary memory settings' });
      continue;
    }
    paired.push({ caseId, scenario: control.scenario, control, candidate });
  }

  const aggregates = {};
  const controls = {};
  for (const scenario of ['short', 'long']) {
    const matches = paired.filter(pair => pair.scenario === scenario);
    const capturedByArm = Object.fromEntries(arms.map(arm => [arm,
      [...cases.values()].filter(pair => pair[arm]?.scenario === scenario).length]));
    const measurements = Object.fromEntries(Object.entries(metrics).map(([label, project]) => [label, {
      control: distribution(matches.map(pair => project(pair.control))),
      roomBlock: distribution(matches.map(pair => project(pair.candidate))),
      pairedDelta: distribution(matches.map(pair => {
        const left = project(pair.control), right = project(pair.candidate);
        return finite(left) && finite(right) ? right - left : null;
      })),
    }]));
    aggregates[scenario] = { matchedCases: matches.length, capturedByArm, metrics: measurements,
      providerUsage: { control: readUsage(matches.map(pair => pair.control)), roomBlock: readUsage(matches.map(pair => pair.candidate)) } };
    const earlier = evidence.find(entry => entry.mode === scenario && entry.arm === 'control');
    const later = evidence.find(entry => entry.mode === scenario && entry.arm === 'room-block');
    const compare = { authoredInstructionDigestPairs: matches.filter(pair => pair.control.firstSystem?.baseInstructionSha256 &&
      pair.candidate.firstSystem?.baseInstructionSha256).length,
    ordinaryMemorySettingsPairs: matches.filter(pair => pair.control.admitted?.memory_settings && pair.candidate.admitted?.memory_settings).length };
    const sampledMessages = matches.map(compareOrdinaryMessages).filter(Boolean);
    compare.ordinaryMessagesAfterFirstSystem = { samples: sampledMessages.length, equal: sampledMessages.filter(row => row.equal).length,
      differences: sampledMessages.filter(row => !row.equal), rows: sampledMessages.map(({ caseId, equal, normalizedDigests }) =>
        ({ caseId, equal, normalizedDigests })), normalization: 'UUID and observation-group IDs (first-appearance aliases per arm), ISO timestamps and Mastra createdAt epoch metadata' };
    if (earlier) compare.control = armControl(earlier);
    if (later) compare.roomBlock = armControl(later);
    if (earlier?.status === 'passed' && later?.status === 'passed') {
      compare.matchedControlState = ['desk', 'approvals', 'maintenance'].every(key =>
        JSON.stringify(compare.control[key]) === JSON.stringify(compare.roomBlock[key]));
      compare.backgroundModelCallDelta = Object.fromEntries(['observe', 'reflect'].map(role => [role,
        compare.roomBlock.roleCounts[role] - compare.control.roleCounts[role]]));
      compare.backgroundModelCallDelta.other = compare.roomBlock.otherModelCalls - compare.control.otherModelCalls;
      compare.completedJobParity = JSON.stringify(compare.control.completedJobs) === JSON.stringify(compare.roomBlock.completedJobs);
      compare.maintainedParity = compare.matchedControlState && compare.completedJobParity &&
        Object.values(compare.backgroundModelCallDelta).every(delta => delta === 0);
      if (!compare.matchedControlState) problems.push({ name: scenario, detail: 'arms differ in Desk revisions, approved payloads or maintenance schedule' });
    }
    controls[scenario] = compare;
  }

  const longPairs = paired.filter(pair => pair.scenario === 'long');
  const indices = row => row.index ?? byCase.get(row.caseId)?.index;
  const orderedPairs = [...longPairs].sort((left, right) => indices(left.control) - indices(right.control));
  const longPositions = new Set(orderedPairs.map(pair => indices(pair.control)));
  for (const arm of arms) {
    const ordered = orderedPairs.map(pair => pair[arm === 'control' ? 'control' : 'candidate']);
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1], current = ordered[index];
      if (indices(current) - indices(previous) !== 1) continue;
      const before = previous.expectedRevision ?? byCase.get(previous.caseId)?.expectedRevision;
      const after = current.expectedRevision ?? byCase.get(current.caseId)?.expectedRevision;
      prefixes.push({ arm, previous: previous.caseId, current: current.caseId,
        plannedRevisionChanged: before !== after, ...sharedPrefix(previous.prompt, current.prompt) });
    }
  }
  const prefixDistribution = Object.fromEntries(arms.map(arm => [arm, Object.fromEntries([false, true].map(changed => {
    const entries = prefixes.filter(prefix => prefix.arm === arm && prefix.plannedRevisionChanged === changed);
    return [changed ? 'changedRevision' : 'unchangedRevision', {
      leadingMessages: distribution(entries.map(prefix => prefix.leadingMessages)),
      leadingMessageBytes: distribution(entries.map(prefix => prefix.leadingMessageBytes)),
      exactJsonPrefixBytes: distribution(entries.map(prefix => prefix.exactJsonPrefixBytes)),
    }];
  }))]));

  const samplePairs = [...paired.filter(pair => pair.scenario === 'short'),
    ...orderedPairs.filter(pair => workload.sampleIndices.includes(indices(pair.control)))];
  const sample = row => ({ expectedRevision: row.expectedRevision ?? null, selection: row.selectedRevision ?? null,
    markers: row.prompt.markers, promptSha256: row.prompt.sha256, promptBytes: row.prompt.bytes,
    roomBlockBytes: row.prompt.roomBlockBytes,
    modelCalls: row.foreground?.modelCalls ?? null, ms: row.foreground?.settledMs ?? null,
    postgresWire: row.foreground?.postgresWire ?? null });

  return { schema: 'quellight.q4-009.delivery-measurement@1', capturedRows: rows.length, pairedCases: paired.length, unmatched,
    longCompletion: { target: expectedLong, paired: orderedPairs.length, observedIndices: [...longPositions],
      complete: expectedLong ? Array.from({ length: expectedLong }, (_, i) => i + 1).every(index => longPositions.has(index)) : null },
    placement, aggregates, controls, prefixDistribution, prefixes,
    samples: samplePairs.map(pair => ({ caseId: pair.caseId, scope: pair.scenario, control: sample(pair.control), roomBlock: sample(pair.candidate) })),
    problems };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [input, output] = process.argv.slice(2);
  assert.ok(input && output, 'Usage: node summarize.mjs INPUT_MANIFEST_JSON OUTPUT_SUMMARY_JSON');
  const manifest = JSON.parse(await readFile(input, 'utf8'));
  const result = summarize(manifest.rows, { markers: manifest.markers, expectedLong: manifest.expectedLong, evidence: manifest.evidence,
    expectedPlacement: manifest.expectedPlacement });
  result.manifest = { pins: manifest.pins ?? null, captureDigest: sha256(JSON.stringify(manifest.rows)),
    serializedRowsBytes: jsonBytes(manifest.rows) };
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  const { target, paired, complete } = result.longCompletion;
  console.log(JSON.stringify({ capturedRows: result.capturedRows, pairedCases: result.pairedCases,
    long: { target, paired, complete, capturedByArm: result.aggregates.long.capturedByArm },
    unmatched: result.unmatched.length, problems: result.problems }, null, 2));
  if (result.problems.length) process.exitCode = 1;
}
