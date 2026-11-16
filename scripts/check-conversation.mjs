import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createPostgresStores } from '@victframework/store-postgres';
import { createPostgresMastraStore, createDeterministicOfflineModel, MastraConversationExportPort, MastraSanitizedLogger } from '@victframework/mastra';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = resolve(app, '..');
const runId = randomUUID();
const scratchRoot = join(app, '.local');
const scratch = join(scratchRoot, `conversation-${runId}`);
const pgData = join(scratch, 'database');
const pgBin = resolve(workspace, '../261116-VICT-Vercel/.hosted-local/tools/embedded-pg/package/native/bin');
const evidence = join(workspace, 'qualification/phase1-conversation/evidence', runId);
await mkdir(scratch, { recursive: true });
await mkdir(evidence, { recursive: true });
await writeFile(join(scratch, 'owned-by-conversation-proof'), runId);
const report = { schema: 'quellight.phase1-conversation-proof@1', at: new Date().toISOString(), node: process.version,
  scope: 'real temporary PostgreSQL; installed public VICT/Mastra; deterministic offline model', cloud: false, providerCalls: 0, passed: false, checks: [] };
const diagnosticSites = new Set();
const safeLoggerError = MastraSanitizedLogger.prototype.error;
// Static caller locations only. Upstream error text and arguments are never inspected.
MastraSanitizedLogger.prototype.error = function (...args) {
  diagnosticSites.add(new Error().stack?.split('\n').slice(2, 6).map(line => line.replaceAll(app.replaceAll('\\', '/'), '<app>')).join('\n'));
  safeLoggerError.apply(this, args);
};
function command(executable, args, name) {
  const path = join(evidence, `${name}.log`);
  const fd = openSync(path, 'w');
  let result;
  try { result = spawnSync(executable, args, { cwd: app, windowsHide: true, stdio: ['ignore', fd, fd], timeout: 60_000 }); }
  finally { closeSync(fd); }
  assert.equal(result.status, 0, `${name}: ${result.error?.code ?? ''} ${readFileSync(path, 'utf8').slice(0, 2000)}`);
}
async function freePort() {
  const socket = createServer();
  await new Promise((yes, no) => { socket.once('error', no); socket.listen(0, '127.0.0.1', yes); });
  const port = socket.address().port;
  await new Promise(yes => socket.close(yes));
  return port;
}
async function eventually(fn) {
  const deadline = Date.now() + 10_000; // Test watchdog only; no product inference cutoff.
  while (Date.now() < deadline) { const result = await fn(); if (result) return result; await new Promise(yes => setTimeout(yes, 25)); }
  assert.fail('test observation did not arrive');
}
function passed(name) { report.checks.push(name); console.log(name); }
let started = false;
let stores;
let releaseSlow;
let releaseSettlement;
let releaseDuplicate;
let pending;
try {
  assert.equal(process.version, 'v22.23.5');
  command(process.execPath, ['node_modules/typescript/bin/tsc', 'src/lib/server/conversation/service.ts', '--outDir', join(scratch, 'compiled'),
    '--rootDir', 'src/lib/server', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--strict', '--skipLibCheck', '--resolveJsonModule'], 'compile');
  const { createConversationService } = await import(pathToFileURL(join(scratch, 'compiled/conversation/service.js')).href);
  const { conversationActivation } = await import(pathToFileURL(join(scratch, 'compiled/conversation/activation.js')).href);
  const profile = conversationActivation('A space for planning.');
  assert.deepEqual(profile.activation.profile.profile.generation, {});
  assert.equal(profile.activation.profile.profile.turnPolicy.mode, 'until-completion-or-cancel');
  assert.equal(profile.activation.profile.profile.modelProfile.routerModel, 'zai-coding-plan/glm-5.3-flash');
  const port = await freePort();
  command(join(pgBin, 'initdb.exe'), ['-D', pgData, '-U', 'vict', '-A', 'trust', '--encoding=UTF8', '--locale=C'], 'init');
  command(join(pgBin, 'pg_ctl.exe'), ['-D', pgData, '-l', join(evidence, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c ssl=off`, '-w', 'start'], 'start');
  started = true;
  const database = { connectionString: `postgresql://vict@127.0.0.1:${port}/postgres`, schema: 'quellight_ops_v1', namespace: 'quellight-v1',
    tls: 'disable-loopback-only', maxConnections: 1 };
  stores = await createPostgresStores({ ...database, migrate: true });
  await stores.coordination.pool.query('CREATE ROLE ql_app_runtime');
  const { readdir } = await import('node:fs/promises');
  const migrations = await readdir(join(app, 'migrations'));
  const productMigration = migrations.find(name => name.includes('product') && name.endsWith('.sql'));
  assert.ok(productMigration);
  await stores.coordination.pool.query(await readFile(join(app, 'migrations', productMigration), 'utf8'));
  await stores.coordination.pool.query(await readFile(join(app, 'src/lib/server/conversation/schema.sql'), 'utf8'));
  const memory = await createPostgresMastraStore({ coordination: stores.coordination, schemaName: 'quellight_memory_v1', migration: 'apply' });
  await memory.close();
  const owner = { id: randomUUID(), actorId: randomUUID(), email: 'fixture@example.invalid' };
  owner.id = owner.actorId;
  const other = { id: randomUUID(), actorId: randomUUID(), email: 'other@example.invalid' };
  other.id = other.actorId;
  for (const actor of [owner, other]) await stores.actors.upsert({ actorId: actor.actorId, status: 'active', roles: [],
    scopes: ['app.data.read', 'agent.turn.start', 'agent.turn.cancel', 'agent.stream.read', 'run.read', 'conversation.read'], createdAt: 0 });
  const roomId = randomUUID();
  await stores.coordination.pool.query('INSERT INTO quellight_product_v1.rooms(id,actor_id,name,purpose) VALUES($1,$2,$3,$4)', [roomId, owner.actorId, 'Home', 'A space for planning.']);
  async function newConversation() {
    const id = randomUUID();
    await stores.coordination.pool.query('INSERT INTO quellight_product_v1.conversations(id,actor_id,room_id,thread_id,title) VALUES($1,$2,$3,$4,$5)', [id, owner.actorId, roomId, `vict-conv-${id}`, 'Test conversation']);
    return id;
  }
  const fixture = createDeterministicOfflineModel({ script: {
    first: { kind: 'text', text: 'A saved first reply.' }, second: { kind: 'text', text: 'A saved second reply.' },
    slow: { kind: 'text', text: 'Partial response.' }, fail: { kind: 'throw', message: 'PRIVATE_FAILURE_CANARY' },
  } });
  let sawPriorHistory = false;
  let sawPurpose = false;
  let aborted = false;
  const slowGate = new Promise(resolve => { releaseSlow = resolve; });
  const model = { ...fixture, async doStream(options) {
    const prompt = JSON.stringify(options.prompt);
    sawPriorHistory ||= prompt.includes('A saved first reply.') && prompt.includes('second');
    sawPurpose ||= prompt.includes('A space for planning.');
    const output = await fixture.doStream(options);
    if (!prompt.includes('slow')) return output;
    options.abortSignal?.addEventListener('abort', () => { aborted = true; releaseSlow(); }, { once: true });
    let held = false;
    return { ...output, stream: output.stream.pipeThrough(new TransformStream({ async transform(part, controller) {
      controller.enqueue(part);
      if (part.type === 'text-delta' && !held) { held = true; await slowGate; }
    } })) };
  } };
  let credentialsRead = 0;
  const options = { openDatabase: () => createPostgresStores({ ...database, migrate: false }),
    readCredential: async () => { credentialsRead++; return 'synthetic-unused-key'; }, modelFactory: () => model };
  const worker = createConversationService(options);
  const observer = createConversationService(options);
  const conversation = await newConversation();
  const request = { input: 'first', idempotencyKey: randomUUID() };
  const first = await worker.start(owner, conversation, request);
  await first.completion;
  let detail = await observer.detail(owner, conversation);
  assert.equal(detail.lastTurn.status, 'completed');
  assert.equal(detail.activeTurn, null);
  assert.deepEqual(detail.messages.map(message => message.text), ['first', 'A saved first reply.']);
  const events = await observer.events(owner, first.turnId, 0);
  assert.equal(events.events.filter(event => event.kind === 'text.delta').map(event => event.delta).join(''), 'A saved first reply.');
  assert.ok(events.events.some(event => event.kind === 'response.completed'));
  assert.deepEqual((await observer.events(owner, first.turnId, events.nextCursor)).events, []);
  assert.equal(fixture.invocationCount(), 1);
  assert.ok(sawPurpose);
  assert.equal(fixture.recordedCallOptions()[0].maxOutputTokens, undefined);
  passed('durable text, lifecycle, room purpose and provider generation defaults');
  const replay = await observer.start(owner, conversation, request);
  await replay.completion;
  assert.equal(replay.turnId, first.turnId);
  assert.equal(fixture.invocationCount(), 1);
  assert.equal(credentialsRead, 1);
  await assert.rejects(observer.start(owner, conversation, { ...request, input: 'changed' }), error => error.code === 'TURN_IDEMPOTENCY_CONFLICT');
  passed('same-request replay has no provider execution; conflicting replay refused');
  await assert.rejects(observer.detail(other, conversation), error => error.code === 'CONVERSATION_NOT_FOUND');
  await assert.rejects(observer.events(other, first.turnId, 0), error => error.code === 'TURN_NOT_FOUND');
  await assert.rejects(observer.cancel(other, first.turnId), error => error.code === 'TURN_NOT_FOUND');
  passed('owner isolation below UI for transcript, events and cancellation');
  const second = await worker.start(owner, conversation, { input: 'second', idempotencyKey: randomUUID() });
  await second.completion;
  assert.ok(sawPriorHistory);
  const exportedStore = await createPostgresMastraStore({ coordination: stores.coordination, schemaName: 'quellight_memory_v1', migration: 'verify' });
  const exportPort = new MastraConversationExportPort({ store: exportedStore.store, actorId: owner.actorId, threadCoordinator: exportedStore.coordinator });
  const exported = await exportPort.exportConversationThread(conversation);
  assert.deepEqual(exported.messages.map(message => message.text), ['first', 'A saved first reply.', 'second', 'A saved second reply.']);
  await exportedStore.close();
  assert.match(await observer.exportText(owner, conversation), /A saved second reply\./);
  passed('stable Mastra thread retains both user and assistant history across requests');
  const slowConversation = await newConversation();
  const slowRequest = { input: 'slow', idempotencyKey: randomUUID() };
  const slow = await worker.start(owner, slowConversation, slowRequest);
  pending = slow.completion;
  const partial = await eventually(async () => {
    const value = await observer.events(owner, slow.turnId, 0);
    return value.events.some(event => event.kind === 'text.delta') ? value : undefined;
  });
  assert.equal(partial.turn.status, 'running');
  assert.equal((await observer.detail(owner, slowConversation)).activeTurn.id, slow.turnId);
  const replaySlow = await observer.start(owner, slowConversation, slowRequest);
  assert.equal(replaySlow.turnId, slow.turnId);
  await assert.rejects(observer.start(owner, slowConversation, { input: 'second', idempotencyKey: randomUUID() }), error => error.code === 'CONVERSATION_BUSY');
  assert.deepEqual((await observer.events(owner, slow.turnId, 0)).events, partial.events);
  passed('reopen from separate service observes running text; concurrent send refused');
  assert.equal((await observer.cancel(owner, slow.turnId)).status, 'cancelled');
  await pending;
  pending = undefined;
  assert.ok(aborted);
  detail = await observer.detail(owner, slowConversation);
  assert.equal(detail.lastTurn.status, 'cancelled');
  assert.equal(detail.activeTurn, null);
  assert.equal(fixture.invocationCount(), 3);
  passed('durable remote stop aborts running provider; no duplicate invocation');
  const failureConversation = await newConversation();
  const failed = await worker.start(owner, failureConversation, { input: 'fail', idempotencyKey: randomUUID() });
  await failed.completion;
  const failure = await observer.detail(owner, failureConversation);
  assert.equal(failure.lastTurn.status, 'failed');
  assert.equal(JSON.stringify(failure).includes('PRIVATE_FAILURE_CANARY'), false);
  passed('provider failure is truthful and safe after reopen');
  const abandonedConversation = await newConversation();
  const abandonedTurn = `quellight:${randomUUID()}`;
  const abandonedKey = randomUUID();
  await stores.coordination.pool.query(`INSERT INTO quellight_product_v1.conversation_turns(turn_id,actor_id,conversation_id,request_key,input_digest,input_text,activation_version,execution_state)
    VALUES($1,$2,$3,$4,$5,'lost', $6,'queued')`, [abandonedTurn, owner.actorId, abandonedConversation, abandonedKey, createHash('sha256').update('lost').digest('hex'), profile.activation.activationVersion]);
  const before = fixture.invocationCount();
  const recovered = await observer.detail(owner, abandonedConversation);
  assert.equal(recovered.lastTurn.status, 'failed');
  assert.equal(recovered.lastTurn.errorCode, 'TURN_START_INTERRUPTED');
  assert.equal(recovered.activeTurn, null);
  const recoveredReplay = await observer.start(owner, abandonedConversation, { input: 'lost', idempotencyKey: abandonedKey });
  assert.equal(recoveredReplay.turnId, abandonedTurn);
  assert.equal(fixture.invocationCount(), before);
  passed('abandoned admission reconciles honestly without restarting the model');
  const vanishedConversation = await newConversation();
  const vanishedTurn = `quellight:${randomUUID()}`;
  const vanishedStream = `stream:${vanishedTurn}`;
  await stores.coordination.pool.query(`INSERT INTO quellight_product_v1.conversation_turns(turn_id,actor_id,conversation_id,request_key,input_digest,input_text,activation_version,execution_state)
    VALUES($1,$2,$3,$4,$5,'vanished', $6,'running')`, [vanishedTurn, owner.actorId, vanishedConversation, randomUUID(), createHash('sha256').update('vanished').digest('hex'), profile.activation.activationVersion]);
  await stores.turns.createTurnIntent({ turnId: vanishedTurn, streamId: vanishedStream, threadId: `vict-conv-${vanishedConversation}`,
    actorId: owner.actorId, agentProfileVersion: profile.activation.agentProfileVersion, inputSummary: 'vanished', status: 'intent', createdAt: Date.now(), updatedAt: Date.now() });
  await stores.turns.startTurn(vanishedTurn, Date.now());
  const stillLive = await stores.coordination.acquire({ scopeId: `quellight:conversation:${vanishedConversation}`, actorId: owner.actorId, ownerId: randomUUID(), leaseMs: 300_000 });
  assert.equal(stillLive.status, 'acquired');
  assert.equal((await observer.detail(owner, vanishedConversation)).activeTurn.status, 'running');
  // Simulate the database-observed expiry after a host has vanished, without sleeping five minutes.
  await stores.coordination.pool.query('UPDATE quellight_ops_v1.coordination SET expires_at=now()-interval \'1 second\' WHERE scope_id=$1', [`quellight:conversation:${vanishedConversation}`]);
  const interrupted = await observer.detail(owner, vanishedConversation);
  assert.equal(interrupted.activeTurn, null);
  assert.equal(interrupted.lastTurn.status, 'failed');
  assert.equal(interrupted.lastTurn.errorCode, 'VICT_TURN_INTERRUPTED');
  assert.equal(fixture.invocationCount(), before);
  passed('live lease is not reconciled; expired running VICT turn becomes interrupted without replay');
  const heldConversation = await newConversation();
  let terminalRecorded;
  const terminalGate = new Promise(resolve => { terminalRecorded = resolve; });
  const settlementGate = new Promise(resolve => { releaseSettlement = resolve; });
  // Decorate only the installed public turn store, after its real DB terminal write.
  // This deterministically exposes the otherwise brief cross-request interleaving.
  const heldWorker = createConversationService({ ...options, async openDatabase() {
    const source = await options.openDatabase();
    return { ...source, forLease(lease) {
      const ports = source.forLease(lease);
      return { ...ports, turns: new Proxy(ports.turns, { get(target, prop) {
        if (prop === 'completeTurn') return async command => {
          const value = await target.completeTurn(command);
          terminalRecorded();
          await settlementGate;
          return value;
        };
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      } }) };
    } };
  } });
  const held = await heldWorker.start(owner, heldConversation, { input: 'first', idempotencyKey: randomUUID() });
  pending = held.completion;
  await terminalGate;
  const heldEvents = await observer.events(owner, held.turnId, 0);
  assert.equal(heldEvents.turn.status, 'completed');
  assert.equal(heldEvents.turn.projectionSettled, false);
  assert.equal(heldEvents.events.filter(event => event.kind === 'text.delta').map(event => event.delta).join(''), 'A saved first reply.');
  const heldView = await observer.detail(owner, heldConversation);
  assert.equal(heldView.activeTurn.status, 'completed');
  assert.equal(heldView.activeTurn.projectionSettled, false);
  releaseSettlement();
  await pending;
  pending = undefined;
  assert.equal((await observer.events(owner, held.turnId, heldEvents.nextCursor)).turn.projectionSettled, true);
  assert.equal((await observer.detail(owner, heldConversation)).messages.at(-1).text, 'A saved first reply.');
  passed('terminal-before-projection interleaving preserves streamed text until saved snapshot is ready');
  const duplicateConversation = await newConversation();
  const duplicateRequest = { input: 'first', idempotencyKey: randomUUID() };
  let duplicateRead;
  const duplicateReadGate = new Promise(resolve => { duplicateRead = resolve; });
  const duplicateResumeGate = new Promise(resolve => { releaseDuplicate = resolve; });
  const delayedDuplicateWorker = createConversationService({ ...options, async openDatabase() {
    const source = await options.openDatabase();
    let held = false;
    const coordination = new Proxy(source.coordination, { get(target, prop) {
      if (prop === 'pool') return new Proxy(target.pool, { get(pool, key) {
        if (key === 'query') return async (sql, values) => {
          const result = await pool.query(sql, values);
          if (!held && typeof sql === 'string' && sql.includes('request_key=$3')) {
            held = true; duplicateRead(); await duplicateResumeGate;
          }
          return result;
        };
        const value = pool[key]; return typeof value === 'function' ? value.bind(pool) : value;
      } });
      const value = target[prop]; return typeof value === 'function' ? value.bind(target) : value;
    } });
    return { ...source, coordination };
  } });
  const delayed = delayedDuplicateWorker.start(owner, duplicateConversation, duplicateRequest);
  await duplicateReadGate;
  const original = await worker.start(owner, duplicateConversation, duplicateRequest);
  await original.completion;
  const callsBeforeDuplicateResumes = fixture.invocationCount();
  releaseDuplicate();
  const delayedReplay = await delayed;
  await delayedReplay.completion;
  assert.equal(delayedReplay.turnId, original.turnId);
  assert.equal(delayedReplay.status, 'completed');
  assert.equal(fixture.invocationCount(), callsBeforeDuplicateResumes);
  passed('delayed duplicate after original lease release returns original turn without execution');
  await stores.coordination.pool.query('UPDATE quellight_product_v1.rooms SET archived_at=now() WHERE id=$1', [roomId]);
  await assert.rejects(worker.start(owner, conversation, { input: 'first', idempotencyKey: randomUUID() }), error => error.code === 'ROOM_ARCHIVED');
  assert.equal((await observer.detail(owner, conversation)).messages.length, 4);
  passed('archived rooms remain readable and refuse new turns');
  report.passed = true;
} catch (error) {
  report.failure = { name: error.name, message: error.message };
  console.error(error);
  process.exitCode = 1;
} finally {
  releaseSlow?.();
  releaseSettlement?.();
  releaseDuplicate?.();
  await pending?.catch(() => undefined);
  await stores?.close();
  if (started) command(join(pgBin, 'pg_ctl.exe'), ['-D', pgData, '-m', 'immediate', '-w', 'stop'], 'stop');
  const finalPath = await realpath(scratch);
  assert.ok(finalPath.startsWith((await realpath(scratchRoot)) + sep));
  assert.equal(await readFile(join(finalPath, 'owned-by-conversation-proof'), 'utf8'), runId);
  await rm(finalPath, { recursive: true });
  report.temporaryClusterRemoved = true;
  report.safeDiagnosticSites = [...diagnosticSites];
  MastraSanitizedLogger.prototype.error = safeLoggerError;
  await writeFile(join(evidence, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(workspace, 'qualification/phase1-conversation/latest.json'), JSON.stringify({ passed: report.passed, evidence: relative(workspace, evidence) }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, evidence: relative(workspace, evidence) }));
}
