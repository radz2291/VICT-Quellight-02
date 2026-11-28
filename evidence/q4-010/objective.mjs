import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function evaluate(rule, input) {
  assert.ok(rule && Object.getPrototypeOf(rule) === Object.prototype);
  switch (rule.op) {
    case 'pick':
      assert.ok(typeof rule.field === 'string' && Object.hasOwn(input, rule.field));
      return input[rule.field];
    case 'key':
      assert.ok(Array.isArray(rule.fields) && rule.fields.length);
      return rule.fields.map(field => {
        const value = input[field];
        assert.ok(typeof value === 'string' && !value.includes('|'));
        return value;
      }).join('|');
    case 'table': {
      const key = input[rule.field];
      assert.ok(typeof key === 'string' && Object.hasOwn(rule.cases, key));
      return rule.cases[key];
    }
    default:
      throw new Error('Missing or unsupported declared rule');
  }
}

async function main() {
  const [casesFile, packetFile] = process.argv.slice(2);
  assert.ok(casesFile && packetFile, 'Usage: node objective.mjs CASES.json PACKET.json');
  const [casesBytes, packetBytes] = await Promise.all([readFile(casesFile), readFile(packetFile)]);
  const frozen = JSON.parse(casesBytes);
  const packet = JSON.parse(packetBytes);
  assert.equal(frozen.purpose, 'development-calibration-only');
  assert.equal(packet.casesSha256, digest(casesBytes));
  const byId = new Map(frozen.cases.map(item => [item.id, item]));
  assert.deepEqual(packet.pairs.map(pair => pair.caseId).sort(), [...byId.keys()].sort());
  const results = [];
  for (const pair of packet.pairs) {
    assert.equal(pair.artifacts.length, 2);
    for (const { artifactId, policy } of pair.artifacts) {
      const checks = byId.get(pair.caseId).checks.map(check => {
        const probes = check.probes.map(({ input, expect }) => {
          let actual = null, passed = false;
          try {
            actual = evaluate(policy[check.rule], input);
            assert.deepEqual(actual, expect);
            passed = true;
          } catch (error) {
            if (!(error instanceof Error)) throw error;
          }
          return { input, expect, actual, passed };
        });
        return { id: check.id, gate: check.gate, passed: probes.every(probe => probe.passed), probes };
      });
      results.push({ caseId: pair.caseId, artifactId, passed: checks.every(check => check.passed), checks });
    }
  }
  assert.equal(new Set(results.map(x => x.artifactId)).size, results.length);
  console.log(JSON.stringify({ schema: 'quellight.q4-010.objective@1', casesSha256: digest(casesBytes),
    packetSha256: digest(packetBytes), results }, null, 2));
}

await main();
