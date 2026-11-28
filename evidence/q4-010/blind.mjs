import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function assign(seed, caseIds) {
  assert.match(seed, /^[a-f0-9]{64}$/);
  assert.equal(caseIds.length, 6);
  assert.equal(new Set(caseIds).size, caseIds.length);
  const keyed = text => createHmac('sha256', Buffer.from(seed, 'hex')).update(text).digest('hex');
  const sorted = [...caseIds].sort((a, b) => keyed(`position/${a}`).localeCompare(keyed(`position/${b}`)));
  const onFirst = new Set(sorted.slice(0, 3));
  const order = [...caseIds].sort((a, b) => keyed(`case/${a}`).localeCompare(keyed(`case/${b}`)));
  return order.map(caseId => ({ caseId, artifacts: (onFirst.has(caseId) ? ['on', 'off'] : ['off', 'on']).map(arm => ({
    arm, artifactId: 'R-' + keyed(`artifact/${caseId}/${arm}`).slice(0, 12),
  })) }));
}

function commitment(seed, casesSha256, packetSha256, freezeCommit) {
  return sha(JSON.stringify({ seed, casesSha256, packetSha256, freezeCommit }));
}

const [verb, casesFile, first, second, third] = process.argv.slice(2);
assert.ok(casesFile && ['assign', 'seal', 'verify'].includes(verb),
  'Usage: node blind.mjs assign CASES SEED | seal CASES PACKET SEED FREEZE_COMMIT | verify CASES PACKET SEAL REVEAL');
const casesBytes = await readFile(casesFile);
const cases = JSON.parse(casesBytes);
assert.equal(cases.purpose, 'development-calibration-only');
const caseIds = cases.cases.map(item => item.id);
const casesSha256 = sha(casesBytes);
if (verb === 'assign') {
  console.log(JSON.stringify(assign(first, caseIds), null, 2));
} else {
  const packetBytes = await readFile(first);
  const packetSha256 = sha(packetBytes), packet = JSON.parse(packetBytes);
  assert.equal(packet.casesSha256, casesSha256);
  const checkPacket = seed => {
    const mapping = assign(seed, caseIds);
    assert.deepEqual(packet.pairs.map(pair => ({ caseId: pair.caseId,
      artifacts: pair.artifacts.map(({ artifactId }) => artifactId) })),
    mapping.map(pair => ({ caseId: pair.caseId, artifacts: pair.artifacts.map(item => item.artifactId) })));
    return mapping;
  };
  if (verb === 'seal') {
    checkPacket(second);
    assert.match(third, /^[a-f0-9]{40}$/);
    console.log(JSON.stringify({ schema: 'quellight.q4-010.blind-seal@1', casesSha256, packetSha256,
      freezeCommit: third, commitmentSha256: commitment(second, casesSha256, packetSha256, third) }, null, 2));
  } else {
    const seal = JSON.parse(await readFile(second));
    const reveal = JSON.parse(await readFile(third));
    assert.equal(seal.casesSha256, casesSha256);
    assert.equal(seal.packetSha256, packetSha256);
    assert.equal(seal.commitmentSha256, commitment(reveal.seed, casesSha256, packetSha256, seal.freezeCommit));
    assert.deepEqual(checkPacket(reveal.seed), reveal.mapping);
    console.log(JSON.stringify({ verified: true, packetSha256, freezeCommit: seal.freezeCommit,
      cases: caseIds.length, revealAfterScoring: reveal.scoreCommit }, null, 2));
  }
}
