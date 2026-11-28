import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { sha256 } from './prompt.mjs';

const [app, dsn, file] = process.argv.slice(2);
assert.ok(app && dsn && file, 'Usage: node witness-background.mjs APP LOOPBACK_DSN PASSED_CAPTURE');
const url = new URL(dsn);
assert.equal(url.protocol, 'postgresql:');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.username, 'q4_fixture');
assert.match(url.pathname, /^\/q4_009_[a-z][a-z0-9]*$/);
assert.ok(!url.password && !url.search && !url.hash);
const bytes = await readFile(file);
const report = JSON.parse(bytes);
assert.equal(report.status, 'passed');
const { Client } = createRequire(resolve(app, 'package.json'))('pg');
const client = new Client({ connectionString: url.href });
await client.connect();
const findings = [];
try {
  await client.query('BEGIN READ ONLY');
  for (const { mode, arm, story, maintenance } of report.evidence) {
    for (const { after, calls, jobs } of maintenance) {
      for (const call of calls) {
        const outcome = jobs.find(job => job.id === call.jobId);
        if (outcome?.state === 'completed') continue;
        assert.ok(outcome, `${call.jobId} had no paired worker outcome`);
        const { rows: [product] } = await client.query(`SELECT id,kind,state,attempts,failure_code,source_revision,
          configuration_revision,authority_revision,conversation_id FROM quellight_product_v1.memory_jobs
          WHERE actor_id=$1 AND id=$2`, [story.owner.actorId, call.jobId]);
        assert.ok(product);
        const { rows: events } = await client.query(`SELECT e.state,e.code,e.at FROM quellight_product_v1.memory_job_events e
          WHERE e.job_id=$1 ORDER BY e.id`, [call.jobId]);
        const { rows: [native] } = await client.query(`SELECT kind,status,operation_id,source_digest,configuration_revision,
          authority_revision,events,checkpoint IS NOT NULL AS has_checkpoint,result IS NOT NULL AS has_result
          FROM quellight_memory_v2.vict_memory_recovery WHERE operation_id=$1 AND thread_id=$2`,
        ['memory-job:' + call.jobId, 'vict-conv-' + product.conversation_id]);
        findings.push({ mode, arm, after, call, outcome, product, events, native: native ?? null });
      }
    }
  }
  await client.query('COMMIT');
} finally { await client.end(); }
console.log(JSON.stringify({ schema: 'quellight.q4-009.background-witness@1', captureSha256: sha256(bytes), findings }, null, 2));
