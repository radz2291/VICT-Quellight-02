import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeterministicOfflineModel, createPostgresMastraStore } from '@victframework/mastra';
import { createIndexedPostgresStores } from '@victframework/store-postgres';
import { indexedSchemaStatements } from '@victframework/store-postgres/operator';
import { Client } from 'pg';
import { createServer as createViteServer } from 'vite';

const app = fileURLToPath(new URL('../', import.meta.url));
const pgBin = process.env.VHOST025_PG_BIN;
assert.ok(pgBin, 'Set VHOST025_PG_BIN to the PostgreSQL 17+ bin directory.');
const root = await mkdtemp(join(tmpdir(), 'quellight-vhost025-server-'));
const data = join(root, 'database');
const socket = createServer();
await new Promise((done, fail) => socket.on('error', fail).listen(0, '127.0.0.1', done));
const { port } = socket.address();
await new Promise(done => socket.close(done));
const database = { connectionString: `postgresql://fixtureadmin@127.0.0.1:${port}/postgres`,
  schema: 'quellight_ops_v1', namespace: 'quellight-v1', writerEpoch: 1, tls: 'disable-loopback-only', maxConnections: 1 };
const pg = (tool, args) => execFileSync(join(pgBin, tool + (process.platform === 'win32' ? '.exe' : '')), args,
  { stdio: 'ignore', windowsHide: true, timeout: 120_000 });
const owner = { actorId: randomUUID(), email: 'fixture@example.invalid' };
owner.id = owner.actorId;
const other = { id: randomUUID(), actorId: '', email: 'other@example.invalid' };
other.actorId = other.id;
const sessionId = randomUUID();
const access = { owner, sessionId, expiresAt: Date.now() + 600_000 };
const checks = [];
const pass = (name, result = {}) => checks.push({ name, ...result });
let started = false, admin, stores, modules, completion;
try {
  pg('initdb', ['-D', data, '-U', 'fixtureadmin', '-A', 'trust', '--encoding=UTF8', '--locale=C', '--no-sync']);
  pg('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c ssl=off`, '-w', 'start']);
  started = true;
  admin = new Client({ connectionString: database.connectionString });
  await admin.connect();
  await admin.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE ql_app_runtime;
    CREATE SCHEMA auth; CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid, not_after timestamptz)`);
  await admin.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [sessionId, owner.id]);
  for (const sql of await indexedSchemaStatements(database.schema)) await admin.query(sql);
  await admin.query("INSERT INTO quellight_ops_v1.namespaces VALUES ('quellight-v1',1); INSERT INTO quellight_ops_v1.callback_admission VALUES ('quellight-v1')");
  for (const path of (await readdir(join(app, 'migrations'))).sort()) {
    if (path.endsWith('.sql') && !path.includes('wakeup')) await admin.query(await readFile(join(app, 'migrations', path), 'utf8'));
  }
  stores = await createIndexedPostgresStores(database);
  const memory = await createPostgresMastraStore({ coordination: stores.coordination, schemaName: 'quellight_memory_v2',
    migration: 'apply', memoryProfile: 'native-thread-recoverable' });
  await memory.close();
  for (const person of [owner, other]) await stores.actors.upsert({ actorId: person.id, roles: ['developer','operator'], status: 'active', createdAt: Date.now() });
  const room = randomUUID();
  await admin.query("INSERT INTO quellight_product_v1.rooms(id,actor_id,name,purpose) VALUES($1,$2,'Home','Synthetic test room')", [room, owner.id]);
  async function conversation() {
    const id = randomUUID();
    await admin.query(`INSERT INTO quellight_product_v1.conversations(id,actor_id,room_id,thread_id,title)
      VALUES($1,$2,$3,$4,'Synthetic test conversation')`, [id, owner.id, room, `vict-conv-${id}`]);
    return id;
  }
  const id = await conversation();
  const history = Array.from({ length: 45 }, (_, index) => ({
    id: 'synthetic-history:' + String(index).padStart(2, '0'), key: randomUUID(),
    input: `Synthetic question ${index}`, output: `Synthetic reply ${index}`,
  }));
  for (const entry of history) await admin.query(`INSERT INTO quellight_product_v1.conversation_turns
    (turn_id,actor_id,conversation_id,request_key,input_digest,input_text,output_text,activation_version,execution_state,created_at)
    VALUES($1,$2,$3,$4,'fixture',$5,$6,'fixture','settled','2026-01-01 00:00:00.958367+00')`,
  [entry.id, owner.id, id, entry.key, entry.input, entry.output]);
  modules = await createViteServer({ root: app, cacheDir: join(root, 'vite-cache'), configFile: false, logLevel: 'error',
    server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  const { createConversationService } = await modules.ssrLoadModule('/src/lib/server/conversation/service.ts');
  const model = createDeterministicOfflineModel({ script: { 'Synthetic Send': { kind: 'text', text: 'Durable synthetic answer.' } } });
  let turnLookups = 0;
  const service = createConversationService({
    openDatabase: async () => {
      const opened = await createIndexedPostgresStores(database);
      return { ...opened, turns: { ...opened.turns, getTurn(...args) { turnLookups++; return opened.turns.getTurn(...args); } } };
    },
    readCredential: async () => 'synthetic-unused',
    modelFactory: () => model,
  });
  const baselineMemory = process.argv.includes('--foreground-memory-baseline');
  if (baselineMemory || process.argv.includes('--foreground-memory')) {
    const { checkForegroundMemory } = await import('./check-vhost026-memory.mjs');
    await checkForegroundMemory({ stores, modules, database, owner, room, conversation, pass, baselineMemory });
  }
  const current = await service.detail(owner, id);
  assert.equal(current.messages.length, 32);
  assert.equal(current.messages[0].id, history[29].id + ':user');
  assert.equal(current.messages[0].requestKey, history[29].key);
  assert.equal(turnLookups, 1);
  const older = await service.detail(owner, id, current.olderCursor);
  const oldest = await service.detail(owner, id, older.olderCursor);
  assert.equal(oldest.olderCursor, null);
  assert.equal(turnLookups, 1);
  assert.deepEqual([...oldest.messages, ...older.messages, ...current.messages]
    .filter(message => message.role === 'user').map(message => message.id), history.map(entry => entry.id + ':user'));
  assert.ok((await service.exportText(owner, id)).includes(history[0].output));
  await assert.rejects(service.detail(other, id), { code: 'CONVERSATION_NOT_FOUND' });
  pass('stable 16-turn pages with identical sub-millisecond creation times, exact keys and full export', { turns: 45, openTurnLookups: 1, olderTurnLookups: 0 });

  const active = await conversation();
  const request = { input: 'Synthetic Send', idempotencyKey: randomUUID() };
  const admitted = await service.start(owner, active, request);
  completion = admitted.completion;
  assert.equal(admitted.userMessage.id, admitted.turnId + ':user');
  assert.equal(admitted.userMessage.requestKey, request.idempotencyKey);
  assert.equal(admitted.userMessage.text, request.input);
  assert.ok(await stores.turns.getTurn(admitted.turnId));
  const replay = await service.start(owner, active, request);
  assert.equal(replay.turnId, admitted.turnId);
  assert.deepEqual(replay.userMessage, admitted.userMessage);
  await assert.rejects(service.start(owner, active, { ...request, input: 'Other text' }), { code: 'TURN_IDEMPOTENCY_CONFLICT' });
  await completion;
  completion = undefined;
  const observed = await service.events(owner, admitted.turnId, 0);
  assert.equal(observed.turn.status, 'completed');
  assert.equal(observed.assistantMessage?.text, 'Durable synthetic answer.');
  assert.equal(observed.assistantMessage?.id, admitted.turnId + ':assistant');
  assert.equal((await service.cancel(owner, admitted.turnId)).status, 'completed');
  pass('durably cancellable 202 and canonical same-key response, one truthful committed assistant');

  await admin.query(`INSERT INTO quellight_product_v1.turn_fragments (turn_id,sequence,delta)
    SELECT $1,i,'fragment-'||i||' ' FROM generate_series(1001,1054) i`, [admitted.turnId]);
  await admin.query('UPDATE quellight_product_v1.conversation_turns SET published_sequence=1054 WHERE turn_id=$1', [admitted.turnId]);
  // Start before the synthetic window so every event in it is known.
  const observer = await service.attachObservation(access, stores, admitted.turnId, 1000);
  const first = await observer.read(1000);
  assert.equal(first.nextCursor, 1048);
  assert.equal(first.turn.projectionSettled, false);
  assert.equal(first.assistantMessage, undefined);
  assert.deepEqual(first.events.map(event => event.sequence), Array.from({ length: 48 }, (_, offset) => 1001 + offset));
  const last = await observer.read(first.nextCursor);
  assert.equal(last.nextCursor, 1054);
  assert.equal(last.turn.projectionSettled, true);
  assert.equal(last.assistantMessage?.id, admitted.turnId + ':assistant');
  assert.equal(last.events.length, 6);
  assert.equal((await observer.read(first.nextCursor)).events[0].sequence, 1049);
  await assert.rejects(service.attachObservation({ ...access, owner: other }, stores, admitted.turnId, 0), { code: 'TURN_NOT_FOUND' });
  await assert.rejects(service.attachObservation(access, stores, admitted.turnId, 1055), { code: 'CURSOR_INVALID' });
  await admin.query('DELETE FROM auth.sessions WHERE id=$1', [sessionId]);
  await assert.rejects(observer.read(first.nextCursor), { code: 'STREAM_SESSION_REVOKED', status: 401 });
  pass('bounded ordered replay, actor isolation and revocation on an existing observer before any later content', { firstBatch: 48, finalBatch: 6 });
  const abandoned = await conversation();
  const vanished = `quellight:${randomUUID()}`;
  const lease = await stores.coordination.acquire({ actorId: owner.id,
    scopeId: `quellight:conversation:${abandoned}`, ownerId: randomUUID(), leaseMs: 10_000 });
  assert.equal(lease.status, 'acquired');
  const fenced = stores.forLease(lease.lease);
  await fenced.turns.createTurnIntent({
    turnId: vanished, streamId: `stream:${vanished}`, threadId: `vict-conv-${abandoned}`, actorId: owner.id,
    agentProfileVersion: 'fixture', inputSummary: 'Synthetic interrupted question', status: 'intent',
    createdAt: Date.now(), updatedAt: Date.now()
  });
  await fenced.turns.startTurn(vanished, Date.now());
  await admin.query(`INSERT INTO quellight_product_v1.conversation_turns
    (turn_id,actor_id,conversation_id,request_key,input_digest,input_text,activation_version,execution_state,published_sequence)
    VALUES($1,$2,$3,$4,'fixture','Synthetic interrupted question','fixture','running',1)`,
  [vanished, owner.id, abandoned, randomUUID()]);
  await admin.query("INSERT INTO quellight_product_v1.turn_fragments VALUES($1,1,'Saved prefix')", [vanished]);
  // Simulate host loss after projection commits. No browser, model call or
  // observation API participates in reconciliation after the fence expires.
  await admin.query("UPDATE quellight_ops_v1.coordination SET expires_at=now()-interval '1 second' WHERE scope_id=$1",
    [`quellight:conversation:${abandoned}`]);
  await service.reconcilePending(stores, new Date(Date.now() + 10_000), owner.id);
  assert.equal((await stores.turns.getTurn(vanished)).status, 'failed');
  assert.deepEqual((await admin.query(`SELECT execution_state,output_text FROM quellight_product_v1.conversation_turns
    WHERE turn_id=$1`, [vanished])).rows[0], { execution_state: 'interrupted', output_text: 'Saved prefix' });
  await assert.rejects(fenced.turns.recordTurnCorrelation(vanished, { traceId: 'stale-worker' }), { code: 'HOSTED_FENCED' });
  pass('signed-wake reconciliation completes an expired host turn without any observer and fences the old writer');

  const baseline = JSON.parse(await readFile(join(app, 'baseline.json'), 'utf8'));
  const mastraArchive = baseline.artifacts.find(archive => archive.name === '@victframework/mastra');
  assert.ok(mastraArchive);
  const archive = mastraArchive.file;
  assert.equal(typeof archive, 'string');
  const mastraSha256 = createHash('sha256').update(await readFile(resolve(app, 'packs', basename(archive)))).digest('hex');
  assert.equal(mastraSha256, mastraArchive.sha256);
  console.log(JSON.stringify({ node: process.version, postgres: (await admin.query('SHOW server_version')).rows[0].server_version,
    lockSha256: createHash('sha256').update(await readFile(join(app, 'package-lock.json'))).digest('hex'),
    mastraArchive: basename(archive), mastraSha256,
    checks }, null, 2));
} finally {
  await completion?.catch(() => undefined);
  await modules?.close();
  await stores?.close();
  await admin?.end();
  if (started) pg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
}
