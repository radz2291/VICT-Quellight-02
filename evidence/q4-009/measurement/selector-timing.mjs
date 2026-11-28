import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { sha256 } from './prompt.mjs';

const [appInput, adminDsn, capturePath, outputPath, overlayPath] = process.argv.slice(2);
assert.ok(appInput && adminDsn && capturePath && outputPath,
  'Usage: node selector-timing.mjs APP LOOPBACK_DSN PASSED_CAPTURE OUTPUT [OVERLAY_MJS]');
assert.equal(process.version, 'v22.23.5');
const app = resolve(appInput), dsn = new URL(adminDsn);
assert.match(dsn.protocol, /^postgres(?:ql)?:$/);
assert.equal(dsn.hostname, '127.0.0.1');
assert.match(dsn.pathname, /^\/q4_009_[a-z][a-z0-9]*$/);
assert.ok(dsn.port && !dsn.password && !dsn.search && !dsn.hash);
dsn.username = 'ql_q9_fixture_writer';

const captureBytes = await readFile(capturePath);
const capture = JSON.parse(captureBytes.toString('utf8'));
assert.equal(capture.status, 'passed', 'Run after the primary measurement has completed');
assert.equal(capture.liveProviderCalls, 0);
const overlay = await readFile(overlayPath ?? new URL('../overlay.mjs', import.meta.url), 'utf8');
assert.equal(sha256(overlay), capture.study['overlay.mjs'], 'Measure the exact selector exercised by the capture');
const match = overlay.match(/stores\.coordination\.pool\.query\(`(SELECT x\.revision,x\.block,x\.source_id[\s\S]*?)`,/);
assert.ok(match && !/[;`]/.test(match[1]) && !match[1].includes('${'));
const sql = match[1];

function storedRead(caseId, expectRevision) {
  const row = capture.rows.find(entry => entry.arm === 'room-block' && entry.caseId === caseId);
  assert.equal(row?.reads?.length, 1);
  const [recorded] = row.reads;
  assert.equal(recorded.revision, expectRevision);
  assert.equal(recorded.actorId, row.ownerId);
  assert.equal(recorded.conversationId, row.thread);
  assert.equal(recorded.roomId, row.admitted.room_id);
  assert.equal(recorded.authority, row.admitted.memory_authority_revision);
  return { caseId, recorded, parameters: [recorded.conversationId, recorded.actorId, recorded.roomId, recorded.authority] };
}
const hit = storedRead('short-first', 'r1');
const miss = storedRead('short-after-exclusion', null);
assert.equal(hit.recorded.conversationId, miss.recorded.conversationId);
assert.equal(hit.recorded.actorId, miss.recorded.actorId);
assert.equal(hit.recorded.roomId, miss.recorded.roomId);
assert.notEqual(hit.recorded.authority, miss.recorded.authority);

const { Client } = createRequire(join(app, 'package.json'))('pg');
const db = new Client({ connectionString: dsn.href, ssl: false });
const rounds = 20, warmup = 5;
const ms = value => Math.round(value * 1000) / 1000;
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { n: sorted.length, minMs: ms(sorted[0]), p50Ms: ms(sorted[Math.ceil(sorted.length * 0.5) - 1]),
    p95Ms: ms(sorted[Math.ceil(sorted.length * 0.95) - 1]), maxMs: ms(sorted.at(-1)) };
}

async function timed(test) {
  const start = performance.now();
  const result = await db.query(sql, test.parameters);
  const wallMs = performance.now() - start;
  const { revision, sourceId, resultBytes } = test.recorded;
  assert.equal(result.rowCount, revision === null ? 0 : 1);
  assert.equal(result.rows[0]?.revision ?? null, revision);
  assert.equal(result.rows[0]?.source_id ?? null, sourceId);
  assert.equal(Buffer.byteLength(JSON.stringify(result.rows)), resultBytes);
  return { wallMs, rows: result.rowCount, serializedResultBytes: resultBytes };
}

let postgres;
const samples = [];
await db.connect();
try {
  await db.query('BEGIN READ ONLY');
  postgres = (await db.query('SHOW server_version')).rows[0].server_version;
  assert.equal((await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'on');
  assert.equal((await db.query('SELECT current_user AS role')).rows[0].role, 'ql_q9_fixture_writer');
  for (let index = 0; index < warmup + rounds; index++) {
    const order = index % 2 === 0 ? ['hit', 'miss'] : ['miss', 'hit'];
    const row = { index: index - warmup + 1, order };
    for (const label of order) row[label] = await timed(label === 'hit' ? hit : miss);
    if (index >= warmup) samples.push(row);
  }
  await db.query('ROLLBACK');
} finally { await db.end(); }

const result = { schema: 'quellight.q4-009.selector-timing@1', captureSha256: sha256(captureBytes),
  overlaySha256: sha256(overlay), sqlSha256: sha256(sql), postgres, node: process.version, rounds, warmup,
  cases: { hit: { caseId: hit.caseId, historicalBindParameters: hit.parameters, revision: hit.recorded.revision },
    miss: { caseId: miss.caseId, currentBindParameters: miss.parameters, revision: miss.recorded.revision } },
  hit: distribution(samples.map(row => row.hit.wallMs)), miss: distribution(samples.map(row => row.miss.wallMs)),
  pairedHitMinusMiss: distribution(samples.map(row => row.hit.wallMs - row.miss.wallMs)),
  samples: samples.map(row => ({ ...row, hit: { ...row.hit, wallMs: ms(row.hit.wallMs) }, miss: { ...row.miss, wallMs: ms(row.miss.wallMs) } })),
  method: 'One warmed standalone loopback client, fixture writer role in read-only transaction, alternating query order, exact captured SQL and bind arguments.',
  scope: 'Query round trip only. The successful row uses historical fixture inputs. This does not authorize that revision for a current reply or estimate total foreground latency.' };
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ hit: result.hit, miss: result.miss, pairedHitMinusMiss: result.pairedHitMinusMiss }, null, 2));
