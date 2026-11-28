import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const [casesFile, packetFile, objectiveFile, aFile, bFile, revealFile] = process.argv.slice(2);
assert.ok(revealFile, 'Usage: node aggregate.mjs CASES PACKET OBJECTIVE REVIEW_A REVIEW_B REVEAL');
const files = [casesFile, packetFile, objectiveFile, aFile, bFile, revealFile];
const bytes = await Promise.all(files.map(file => readFile(file)));
const hashes = bytes.map(value => createHash('sha256').update(value).digest('hex'));
const [frozen, packet, objective, a, b, reveal] = bytes.map(value => JSON.parse(value));
const dimensions = ['handoff', 'gaps', 'interventions', 'owner'];
const reviewers = [a, b];
const expectedKeys = dimensions.toSorted();
const threshold = 2;
const tests = new Map(frozen.cases.map(item => [item.id, new Set(item.checks.map(check => check.id))]));
const artifactCase = new Map(packet.pairs.flatMap(pair => pair.artifacts.map(item => [item.artifactId, pair.caseId])));
const objectiveById = new Map(objective.results.map(item => [item.artifactId, item]));
const compare = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

assert.equal(frozen.purpose, 'development-calibration-only');
assert.equal(packet.casesSha256, hashes[0]);
assert.equal(objective.casesSha256, hashes[0]);
assert.equal(objective.packetSha256, hashes[1]);
assert.equal(reveal.packetSha256, hashes[1]);
assert.equal(objectiveById.size, artifactCase.size);
const rated = reviewers.map((sheet, reviewerIndex) => {
  assert.equal(sheet.reviewer, reviewerIndex ? 'reviewer-b' : 'reviewer-a');
  assert.equal(sheet.packetSha256, hashes[1]);
  assert.ok(Array.isArray(sheet.cues) && sheet.cues.every(cue => typeof cue === 'string'));
  assert.equal(sheet.ratings.length, artifactCase.size);
  const seen = new Map();
  for (const entry of sheet.ratings) {
    assert.equal(artifactCase.get(entry.artifactId), entry.caseId);
    assert.ok(!seen.has(entry.artifactId));
    for (const key of ['scores', 'evidence']) assert.deepEqual(Object.keys(entry[key]).sort(), expectedKeys);
    assert.ok(dimensions.every(d => [0, 1, 2].includes(entry.scores[d]) &&
      typeof entry.evidence[d] === 'string' && entry.evidence[d].trim()));
    const gateIds = new Set(entry.failedGates.map(({ id, reason }) => {
      assert.ok(tests.get(entry.caseId).has(id));
      assert.ok(typeof reason === 'string' && reason.trim());
      return id;
    }));
    assert.equal(gateIds.size, entry.failedGates.length);
    seen.set(entry.artifactId, { ...entry, gateIds,
      total: dimensions.reduce((sum, dimension) => sum + entry.scores[dimension], 0) });
  }
  return seen;
});

function verdict([left, right]) {
  if (!left.eligible && !right.eligible) return { result: 'neither', cause: 'hard-gate' };
  if (left.eligible !== right.eligible) return { result: left.eligible ? left.arm : right.arm, cause: 'hard-gate' };
  const delta = right.total - left.total;
  if (delta === 0) return { result: 'tie', cause: 'exact-score-tie' };
  if (Math.abs(delta) < threshold) return { result: 'tie', cause: 'within-material-margin' };
  return { result: delta > 0 ? right.arm : left.arm, cause: 'material-score-delta' };
}

const differences = [], pending = [], classification = reviewers.map(sheet => ({ reviewer: sheet.reviewer,
  bothPass: 0, bothFail: 0, reviewerOnlyFail: 0, objectiveOnlyFail: 0, exactFailedGateList: 0 }));
const pairs = reveal.mapping.toSorted((left, right) => left.caseId.localeCompare(right.caseId)).map(pair => {
  const artifacts = pair.artifacts.toSorted((left, right) => left.arm.localeCompare(right.arm)).map(item => {
    const objectiveResult = objectiveById.get(item.artifactId);
    assert.equal(objectiveResult.caseId, pair.caseId);
    assert.equal(artifactCase.get(item.artifactId), pair.caseId);
    assert.deepEqual(new Set(objectiveResult.checks.map(check => check.id)), tests.get(pair.caseId));
    const objectiveFailed = objectiveResult.checks.filter(check => !check.passed).map(check => check.id);
    assert.equal(objectiveResult.passed, objectiveFailed.length === 0);
    const votes = rated.map(sheet => sheet.get(item.artifactId));
    const agreedManual = [...votes[0].gateIds].filter(id => votes[1].gateIds.has(id) && !objectiveFailed.includes(id));
    const differingManual = [...new Set(votes.flatMap(vote => [...vote.gateIds]))]
      .filter(id => !objectiveFailed.includes(id) && !agreedManual.includes(id));
    if (differingManual.length) pending.push({ caseId: pair.caseId, artifactId: item.artifactId, hardChecks: differingManual });
    for (const dimension of dimensions) {
      const values = votes.map(vote => vote.scores[dimension]);
      if (values[0] !== values[1]) differences.push({ caseId: pair.caseId, artifactId: item.artifactId, dimension, values,
        evidence: votes.map(vote => vote.evidence[dimension]) });
    }
    votes.forEach((vote, index) => {
      const counts = classification[index];
      const objectivePass = objectiveFailed.length === 0;
      const manualPass = vote.gateIds.size === 0;
      counts[objectivePass ? manualPass ? 'bothPass' : 'reviewerOnlyFail' : manualPass ? 'objectiveOnlyFail' : 'bothFail']++;
      if (compare(vote.gateIds, objectiveFailed)) counts.exactFailedGateList++;
    });
    const total = (votes[0].total + votes[1].total) / 2;
    return { artifactId: item.artifactId, arm: item.arm, eligible: !objectiveFailed.length && !agreedManual.length,
      total, objectiveFailed, agreedManual, differingManual,
      reviewers: votes.map((vote, index) => ({ reviewer: reviewers[index].reviewer, total: vote.total,
        scores: vote.scores, failedGates: vote.failedGates })) };
  });
  assert.deepEqual(artifacts.map(item => item.arm), ['off', 'on']);
  return { caseId: pair.caseId, artifacts, scoreDeltaOnMinusOff: artifacts[1].total - artifacts[0].total,
    reviewerVerdicts: reviewers.map((sheet, index) => ({ reviewer: sheet.reviewer,
      ...verdict(artifacts.map(item => ({ arm: item.arm, eligible: !item.reviewers[index].failedGates.length,
        total: item.reviewers[index].total }))) })),
    combined: artifacts.some(item => item.differingManual.length) ? { result: 'pending', cause: 'disputed-manual-gate' } : verdict(artifacts) };
});

const counts = Object.fromEntries(['on', 'off', 'tie', 'neither', 'pending'].map(result => [result,
  pairs.filter(pair => pair.combined.result === result).length]));
const comparisons = artifactCase.size * dimensions.length;
const judgedProbes = objective.results.flatMap(item => item.checks.flatMap(check => check.probes));
console.log(JSON.stringify({ schema: 'quellight.q4-010.calibration-results@1',
  packetSha256: hashes[1], objectiveSha256: hashes[2], scoreSha256: hashes.slice(3, 5),
  scale: 'four dimensions, 0–2 each', materialMargin: threshold, counts,
  attemptedArtifacts: artifactCase.size, probeExecutions: judgedProbes.length,
  failedProbes: judgedProbes.filter(probe => !probe.passed).length,
  agreement: { exactDimensionScores: comparisons - differences.length, comparedDimensionScores: comparisons,
    exactPairVerdicts: pairs.filter(pair => pair.reviewerVerdicts[0].result === pair.reviewerVerdicts[1].result).length,
    comparedPairVerdicts: pairs.length, objectiveVersusIndependent: classification },
  cues: reviewers.map(({ reviewer, cues }) => ({ reviewer, cues })),
  pendingManualGateDisputes: pending, differences, pairs }, null, 2));
