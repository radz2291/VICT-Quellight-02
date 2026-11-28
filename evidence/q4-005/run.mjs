import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { connect, createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createShadow } from './shadow.mjs';

const appSha = '14b6ccaf6f409eac3e041dc3d9abd0bb9f875344';
const designSha = '9dbfd28175d86b28f9a52340aa4939b4ed11db81';
const lockSha = '31b606ed8bdffa497bd4621f87877900ed3767f2f0ee0a5681f384e75d75e225';
const fixtureCommit = 'b588e6ffcd1b648fb42bd20bd8e6909db4db9ed5';
const [appPath, designPath, dsn, outputPath] = process.argv.slice(2);
assert.ok(appPath && designPath && dsn && outputPath, 'Usage: node run.mjs APP DESIGN LOOPBACK_FIXTURE_DSN OUTPUT');
const app = resolve(appPath), design = resolve(designPath), output = resolve(outputPath);
const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { windowsHide: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(git(app, ['rev-parse', 'HEAD']).toString().trim(), appSha);
assert.equal(git(app, ['status', '--porcelain', '--untracked-files=no']).toString(), '');
assert.equal(git(design, ['rev-parse', 'HEAD']).toString().trim(), designSha);
assert.equal(process.version, 'v22.23.5');
assert.equal(hash(git(app, ['show', 'HEAD:package-lock.json'])), lockSha);
const manifest = JSON.parse(await readFile(join(app, 'baseline.json')));
for (const archive of manifest.artifacts) assert.equal(hash(await readFile(join(app, archive.file))), archive.sha256);
const fixtureBytes = await readFile(new URL('./fixture.json', import.meta.url));
const fixture = JSON.parse(fixtureBytes);
const requireApp = createRequire(join(app, 'package.json'));
const use = name => import(pathToFileURL(requireApp.resolve(name)).href);
const { Client } = requireApp('pg');
const { createServer: createVite } = await use('vite');
const { canonicalArgDigest, createDeterministicOfflineModel, createPostgresMastraStore } = await use('@victframework/mastra');
const { createIndexedPostgresStores } = await use('@victframework/store-postgres');
const { indexedSchemaStatements } = await use('@victframework/store-postgres/operator');
const adminUrl = new URL(dsn);
assert.match(adminUrl.protocol, /^postgres(?:ql)?:$/);
assert.equal(adminUrl.hostname, '127.0.0.1');
assert.equal(adminUrl.username, 'q4_fixture');
assert.match(adminUrl.pathname, /^\/q4_005_[a-z0-9]+$/);
assert.ok(adminUrl.port && !adminUrl.password && !adminUrl.search && !adminUrl.hash);
const runtimeUrl = new URL(adminUrl), shadowUrl = new URL(adminUrl);
runtimeUrl.username = 'ql_q5_fixture_writer';
shadowUrl.username = 'ql_q5_fixture_reader';
const config = { schema: 'quellight_ops_v1', namespace: 'quellight-v1', writerEpoch: 1,
  tls: 'disable-loopback-only', maxConnections: 2 };
const product = 'quellight_product_v1', nativeSchema = 'quellight_memory_v2';
const admin = new Client({ connectionString: adminUrl.href });
const open = url => createIndexedPostgresStores({ ...config, connectionString: url.href });
const ownerId = randomUUID();
const owner = { id: ownerId, actorId: ownerId, email: 'beacon@fixture.invalid' };
const roomId = randomUUID(), foreignRoomId = randomUUID();
const threads = { A: randomUUID(), B: randomUUID(), C: randomUUID() };
const report = {
  schema: 'quellight.q4-005.installed-replay@1', status: 'started', appSha, designSha, lockSha, fixtureCommit,
  node: process.version, fixtureSha256: hash(fixtureBytes),
  archives: manifest.artifacts.map(({ name, version, sha256 }) => ({ name, version, sha256 })),
  scope: { actorId: ownerId, roomId, foreignRoomId, threads },
  settlements: [], observations: [], reads: { before: [], after: [] }, models: [],
  evidenceSource: 'Installed application services on synthetic loopback PostgreSQL. Deterministic model seam.',
};
await mkdir(output, { recursive: true });
const checkpoint = () => writeFile(join(output, 'capture.json'), JSON.stringify(report, null, 2) + '\n');

async function provision() {
  await admin.connect();
  report.postgres = (await admin.query('SHOW server_version')).rows[0].server_version;
  assert.equal((await admin.query("SELECT 1 FROM pg_namespace WHERE nspname='quellight_product_v1'")).rowCount, 0,
    'Use a new disposable fixture database');
  for (const role of ['anon', 'authenticated', 'ql_app_runtime', runtimeUrl.username, shadowUrl.username]) {
    const existing = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
    if (!existing.rowCount) await admin.query('CREATE ROLE ' + role + (role.startsWith('ql_q5_') ? ' LOGIN INHERIT' : ''));
  }
  await admin.query('GRANT ql_app_runtime TO ' + runtimeUrl.username);
  await admin.query('CREATE SCHEMA auth; CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz)');
  for (const sql of await indexedSchemaStatements(config.schema)) await admin.query(sql);
  await admin.query("INSERT INTO quellight_ops_v1.namespaces VALUES ('quellight-v1',1); INSERT INTO quellight_ops_v1.callback_admission VALUES ('quellight-v1')");
  for (const name of (await readdir(join(app, 'migrations'))).sort()) {
    if (name.endsWith('.sql') && !name.includes('wakeup')) await admin.query(await readFile(join(app, 'migrations', name), 'utf8'));
  }
  const setup = await open(adminUrl);
  try {
    const native = await createPostgresMastraStore({ coordination: setup.coordination, schemaName: nativeSchema,
      migration: 'apply', memoryProfile: 'native-thread-recoverable' });
    await native.close();
    await setup.actors.upsert({ actorId: ownerId, roles: ['developer', 'operator'], status: 'active', createdAt: Date.now() });
  } finally {
    await setup.close();
  }
  const schemas = [product, config.schema, nativeSchema].join(',');
  await admin.query('GRANT USAGE ON SCHEMA ' + schemas + ' TO ql_app_runtime, ' + shadowUrl.username);
  await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ' + schemas + ' TO ql_app_runtime');
  await admin.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ' + schemas + ' TO ql_app_runtime');
  await admin.query('GRANT SELECT ON ALL TABLES IN SCHEMA ' + schemas + ' TO ' + shadowUrl.username);
  // The indexed store's read setup takes FOR SHARE OF namespaces. PostgreSQL
  // needs a column UPDATE grant for that row lock. The fixture trigger denies
  // actual changes by this login while permitting its existing public reads.
  await admin.query("GRANT UPDATE(writer_epoch) ON quellight_ops_v1.namespaces TO ql_q5_fixture_reader; " +
    "CREATE FUNCTION quellight_ops_v1.q4_005_deny_shadow_writes() RETURNS trigger LANGUAGE plpgsql AS " +
    "$body$ BEGIN IF current_user = 'ql_q5_fixture_reader' THEN RAISE EXCEPTION 'Q4_SHADOW_READ_ONLY'; " +
    "END IF; RETURN NEW; END; $body$; CREATE TRIGGER q4_005_deny_shadow_writes BEFORE UPDATE ON " +
    "quellight_ops_v1.namespaces FOR EACH ROW EXECUTE FUNCTION quellight_ops_v1.q4_005_deny_shadow_writes()");
  for (const { tablename } of (await admin.query(
    'SELECT tablename FROM pg_tables WHERE schemaname=$1 AND rowsecurity', [product])).rows) {
    // Local fixture only. The application still performs its actor and scope checks.
    await admin.query('CREATE POLICY q4_005_shadow ON ' + product + '.' + tablename +
      ' FOR SELECT TO ' + shadowUrl.username + ' USING (true)');
  }
  for (const table of ['conversation_turns', 'turn_fragments']) {
    await admin.query('CREATE POLICY q4_005_writer ON ' + product + '.' + table +
      ' TO ql_app_runtime USING(true) WITH CHECK(true)');
  }
  await admin.query("INSERT INTO quellight_product_v1.rooms(id,actor_id,name,purpose) VALUES($1,$3,'Beacon rehearsals','Synthetic room for cue sheet review'),($2,$3,'Separate rehearsal','Synthetic unrelated room')",
    [roomId, foreignRoomId, ownerId]);
  for (const [tag, id] of Object.entries(threads)) {
    await admin.query('INSERT INTO quellight_product_v1.conversations(id,actor_id,room_id,thread_id,title) VALUES($1,$2,$3,$4,$5)',
      [id, ownerId, tag === 'C' ? foreignRoomId : roomId, 'vict-conv-' + id, 'Rehearsal ' + tag]);
  }
}

async function makeMeter() {
  let counts = { sent: 0, received: 0, connections: 0 };
  const sockets = new Set();
  const server = createServer(client => {
    counts.connections++;
    const upstream = connect({ host: '127.0.0.1', port: Number(adminUrl.port) });
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    }
    client.on('data', data => { counts.sent += data.length; });
    upstream.on('data', data => { counts.received += data.length; });
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.pipe(upstream);
    upstream.pipe(client);
  });
  await new Promise((ok, no) => server.once('error', no).listen(0, '127.0.0.1', ok));
  return { port: server.address().port, reset() { counts = { sent: 0, received: 0, connections: 0 }; },
    read: () => ({ ...counts }), close() { for (const socket of sockets) socket.destroy(); server.close(); } };
}

const scripted = createDeterministicOfflineModel({ script: Object.fromEntries(
  fixture.turns.map(turn => [turn.user, { kind: 'text', text: turn.assistant }])) });
// B and the foreign thread share exactly the same original. Their deterministic
// replies are kept thread-specific by selecting the frozen per-turn model.
function chatModel(turn) {
  const model = createDeterministicOfflineModel({ script: { [turn.user]: { kind: 'text', text: turn.assistant } } });
  return { ...model, doStream(options) {
    report.models.push({ role: 'foreground', caseId: turn.id });
    return model.doStream(options);
  }, doGenerate(options) {
    report.models.push({ role: 'foreground', caseId: turn.id });
    return model.doGenerate(options);
  } };
}

function memoryModel(job, clauses) {
  const observation = '<observations>\n' + clauses.map(clause => '- ' + clause).join('\n') + '\n</observations>';
  const noteCall = () => report.models.push({ role: 'observer-fixture', jobId: job.id,
    conversationId: job.conversation_id, authorityRevision: job.authority_revision });
  return { ...scripted, async doGenerate(options) {
    noteCall();
    const result = await scripted.doGenerate(options);
    return { ...result, content: [{ type: 'text', text: observation }] };
  }, async doStream() {
    noteCall();
    return { stream: new ReadableStream({ start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });
      controller.enqueue({ type: 'text-start', id: 'observation' });
      controller.enqueue({ type: 'text-delta', id: 'observation', delta: observation });
      controller.enqueue({ type: 'text-end', id: 'observation' });
      controller.enqueue({ type: 'finish', finishReason: 'stop', usage: { inputTokens: 12, outputTokens: 21, totalTokens: 33 } });
      controller.close();
    } }) };
  } };
}

let meter, vite, writer, reader;
try {
  await provision();
  writer = await open(runtimeUrl);
  meter = await makeMeter();
  shadowUrl.port = meter.port;
  reader = await open(shadowUrl);
  const roles = (await reader.coordination.pool.query("SELECT has_table_privilege(current_user,'quellight_product_v1.conversation_turns','INSERT') AS can_insert, has_table_privilege(current_user,'quellight_memory_v2.mastra_messages','UPDATE') AS can_rewrite")).rows[0];
  assert.deepEqual(roles, { can_insert: false, can_rewrite: false });
  await assert.rejects(reader.coordination.pool.query("UPDATE quellight_ops_v1.namespaces SET writer_epoch=writer_epoch WHERE namespace='quellight-v1'"),
    error => error.code === 'P0001' && error.message === 'Q4_SHADOW_READ_ONLY');
  report.shadowSqlRole = { ...roles, namespaceUpdateBlocked: true };
  vite = await createVite({ root: app, configFile: false, logLevel: 'error', cacheDir: join(output, 'vite'),
    server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  const load = module => vite.ssrLoadModule('/src/lib/server/' + module + '.ts');
  const { createConversationService } = await load('conversation/service');
  const { createMemoryJobProcessor } = await load('memory/worker');
  const { createMemoryDispatcher } = await load('memory/dispatcher');
  const { executeMemoryCareAction } = await load('memory/care-actions');
  const { memoryActivity } = await load('memory/jobs');
  const { getConversation } = await load('domain/queries');
  const { loadEffectiveMemorySettings } = await load('memory/settings');
  const { openQuellightMemory } = await load('memory/native');
  const { memorySourcePage } = await load('memory/inspection-views');
  const { policyIdentity } = await load('memory/inspection');
  const clauses = new Map();
  const processJob = createMemoryJobProcessor({ modelFactory: async job => {
    assert.ok(clauses.has(job.conversation_id), 'Fixture must name the expected job thread');
    return () => memoryModel(job, clauses.get(job.conversation_id));
  } });
  const dispatch = createMemoryDispatcher({ actorId: ownerId, openDatabase: () => open(runtimeUrl), process: processJob });
  const shadow = createShadow({ stores: reader, owner, roomId,
    ports: { getConversation, loadEffectiveMemorySettings, openQuellightMemory, memorySourcePage, policyIdentity }, meter });
  const activity = conversationId => memoryActivity(writer.coordination.pool, ownerId, conversationId);
  const opened = new Map();

  async function settle(turn) {
    const conversationId = threads[turn.thread];
    const before = new Set((await activity(conversationId)).map(event => event.job_id));
    clauses.set(conversationId, turn.observed);
    const talk = createConversationService({ openDatabase: () => open(runtimeUrl),
      readCredential: async () => 'fixture-unused', modelFactory: () => chatModel(turn) });
    const started = await talk.start(owner, conversationId, { input: turn.user, idempotencyKey: randomUUID() });
    await started.completion;
    const projected = await talk.events(owner, started.turnId, 0);
    assert.equal(projected.turn.status, 'completed');
    assert.equal(projected.turn.projectionSettled, true);
    assert.equal(projected.assistantMessage.text, turn.assistant);
    const queued = (await activity(conversationId)).filter(event => event.kind === 'observe' && !before.has(event.job_id));
    assert.equal(queued.length, 1);
    assert.equal(queued[0].state, 'queued');
    const receipt = { caseId: turn.id, conversationId, turnId: started.turnId,
      assistantId: projected.assistantMessage.id, assistantText: projected.assistantMessage.text,
      status: projected.turn.status, projectionSettled: projected.turn.projectionSettled,
      jobId: queued[0].job_id, operationId: 'memory-job:' + queued[0].job_id, queuedAt: queued[0].at };
    report.settlements.push(receipt);
    opened.set(turn.id, receipt);
    await dispatch();
    const events = (await activity(conversationId)).filter(event => event.job_id === receipt.jobId).reverse();
    assert.deepEqual(events.map(event => event.state), ['queued', 'running', 'completed']);
    const effective = await loadEffectiveMemorySettings(writer.coordination.pool, ownerId,
      turn.thread === 'C' ? foreignRoomId : roomId);
    const memory = await openQuellightMemory({ stores: writer, ownerActorId: ownerId, conversationId, effective });
    try {
      const operation = await memory.service.operation(conversationId, receipt.operationId);
      assert.ok(operation.result?.observed && operation.status === 'completed');
      report.observations.push({ caseId: turn.id, operation, activity: events });
    } finally {
      await memory.hosted.close();
    }
  }
  const read = (caseId, sourceCase = caseId) => {
    const { conversationId, operationId } = opened.get(sourceCase);
    return shadow({ caseId, conversationId, operationId });
  };

  for (const turn of fixture.turns.filter(turn => turn.id !== 'correction')) await settle(turn);
  const beforeU = report.models.length;
  for (const [caseId, input] of [['original'], ['layout'], ['accessibility'], ['duplicate', 'original'], ['foreign-room', 'foreign']]) {
    report.reads.before.push(await read(caseId, input));
  }
  assert.equal(report.models.length, beforeU);
  const earlier = report.reads.before.find(row => row.caseId === 'original');
  const excludedId = earlier.accepted[0]?.sourceId;
  assert.ok(excludedId, 'Original source must be resolved from the installed path before the care action');
  const care = await executeMemoryCareAction(writer, owner, 'memory.forget', {
    conversationId: threads.A, expectedAuthorityRevision: earlier.currentAuthorityRevision,
    sourceMessageIds: JSON.stringify([excludedId]),
  }, randomUUID());
  assert.equal(care.ok, true);
  assert.notEqual(care.value.authorityRevision, earlier.currentAuthorityRevision);
  report.care = { excludedId, originalConversationId: threads.A, correctionConversationId: threads.B,
    fromRevision: earlier.currentAuthorityRevision, ...care.value };
  // Drain the already due care work before the distinct corrective turn.
  // All model calls here are from the unchanged fixture worker.
  for (const tag of ['A', 'B', 'C']) clauses.set(threads[tag], fixture.turns.find(turn =>
    turn.id === ({ A: 'layout', B: 'accessibility', C: 'foreign' })[tag]).observed);
  const jobsBeforeRebuild = new Set((await activity(threads.B)).filter(event => event.state === 'completed').map(event => event.job_id));
  const rebuildStart = report.models.length;
  report.care.dispatch = await dispatch();
  report.care.fixtureModelCalls = report.models.length - rebuildStart;
  const rebuild = (await activity(threads.B)).filter(event => event.kind === 'observe' &&
    event.state === 'completed' && !jobsBeforeRebuild.has(event.job_id));
  assert.equal(rebuild.length, 1);
  const beforeRebuildRead = report.models.length;
  // Supplemental scope after observing the current epoch's real singleton range.
  // The prespecified before/after cases are validated separately below.
  report.rebuildWitness = await shadow({ caseId: 'B-rebuilt-accessibility', conversationId: threads.B,
    operationId: 'memory-job:' + rebuild[0].job_id });
  assert.equal(report.models.length, beforeRebuildRead);
  const retained = report.rebuildWitness.accepted[0];
  const earlierAccessibility = report.reads.before.find(row => row.caseId === 'accessibility').accepted[0];
  assert.equal(report.rebuildWitness.accepted.length, 1);
  assert.equal(retained.sourceId, earlierAccessibility.sourceId);
  assert.equal(retained.span.text, earlierAccessibility.span.text);
  assert.equal(retained.authorityRevision, report.care.authorityRevision);
  assert.ok(report.rebuildWitness.ranges.some(range => range.disposition === 'bounded-single-message-range'));

  await settle(fixture.turns.find(turn => turn.id === 'correction'));
  const afterU = report.models.length;
  for (const [caseId, input] of [['original-stale', 'original'], ['layout-stale', 'layout'],
    ['accessibility-stale', 'accessibility'], ['correction'], ['correction-duplicate', 'correction']]) {
    report.reads.after.push(await read(caseId, input));
  }
  assert.equal(report.models.length, afterU);

  // Separate fixture audit. listTurns() is unfiltered at the installed store
  // boundary, so the room reader deliberately does not use it to get provenance.
  const witnessTurns = await writer.turns.listTurns();
  assert.equal(typeof canonicalArgDigest, 'function');
  report.receiptAudit = { namespaceTurnRecordsRead: witnessTurns.length, receipts: [] };
  for (const entry of report.observations) {
    const operation = entry.operation;
    const settlement = opened.get(entry.caseId);
    const turn = witnessTurns.filter(record => record.actorId === ownerId && record.threadId === operation.thread_id
      && record.inputSummary === 'memory:observe:' + operation.operation_id);
    assert.equal(turn.length, 1);
    assert.equal(turn[0].status, 'completed');
    const invocations = await writer.invocations.listInvocationsForTurn(turn[0].turnId);
    const receipt = invocations.find(record => record.actorId === ownerId && record.capabilityId === 'quellight.memory.maintain');
    assert.ok(receipt && receipt.status === 'completed' && receipt.effect === 'write' && receipt.capabilityRevision === '1');
    const request = { kind: 'observe', actorId: ownerId, conversationId: settlement.conversationId, operationId: operation.operation_id,
      configurationRevision: operation.configuration_revision, sourceRevision: operation.source_digest,
      authorityRevision: operation.authority_revision };
    const args = canonicalArgDigest(request);
    assert.equal(receipt.argDigest, args);
    report.receiptAudit.receipts.push({ caseId: entry.caseId, request, receipt, maintenanceTurnId: turn[0].turnId });
  }
  const foreignPage = await memorySourcePage(writer, owner, threads.C);
  const foreignSource = foreignPage.sources.find(item => item.role === 'user' && !item.excluded);
  assert.ok(foreignSource);
  report.foreignControlSource = foreignSource;
  report.controlOrigin = { duplicate: 'redelivery authored by fixture', foreignRoom: 'actual separate room and capture',
    stale: 'actual governed source exclusion and observed public superseded projection' };
  const expected = fixture.expected;
  report.comparison = {};
  for (const phase of ['before', 'after']) {
    assert.equal(report.reads[phase].length, expected[phase].length);
    report.comparison[phase] = report.reads[phase].map((row, index) => {
      const want = expected[phase][index];
      assert.equal(row.caseId, want.case);
      assert.equal(row.conversationId, threads[want.thread]);
      assert.deepEqual(row.accepted.map(item => item.span.text), want.accepted, row.caseId);
      assert.equal(row.refusal, want.refusal, row.caseId);
      assert.deepEqual(row.unknown.map(item => item.text), want.unknown ?? [], row.caseId);
      if (want.refusal) assert.ok(!row.reads.some(read => read.port === 'app.memorySourcePage'));
      const omissions = (want.omitted ?? []).map(text => {
        const claim = row.accepted.find(item => item.sourceText.includes(text));
        assert.ok(claim && !row.operation.observation.includes(text), 'Expected omitted span has to be absent from native prose');
        return { text, sourceId: claim.sourceId, start: claim.sourceText.indexOf(text), authorityRevision: claim.authorityRevision };
      });
      return { caseId: row.caseId, expected: want, accepted: row.accepted, refusal: row.refusal, unknown: row.unknown,
        omissions, structuredSourceMembership: row.structuredSourceMembership };
    });
  }
  const correction = report.reads.after.find(row => row.caseId === 'correction').accepted[0];
  assert.ok(correction && correction.sourceId !== foreignSource.id && correction.sourceText === foreignSource.text);
  assert.equal(correction.authorityRevision, report.care.authorityRevision);
  const stale = report.reads.after.find(row => row.caseId === 'original-stale');
  assert.ok(stale.exclusions.excluded.includes(excludedId) && stale.operation.status === 'superseded' &&
    !stale.operation.resultPresent && !stale.operation.checkpointPresent);
  assert.ok(report.reads.before.find(row => row.caseId === 'layout').ranges.length > 1);
  report.resource = { fixtureForegroundCalls: report.models.filter(model => model.role === 'foreground').length,
    fixtureObserverCalls: report.models.filter(model => model.role === 'observer-fixture').length,
    shadowModelCalls: 0, liveProviderCalls: 0, addedSendRoundTrips: 0, addedForegroundPromptBytes: 0 };
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = { name: error.name, code: error.code, message: error.message, stack: error.stack };
  console.error(error);
  process.exitCode = 1;
} finally {
  await checkpoint();
  await vite?.close();
  await writer?.close();
  await reader?.close();
  meter?.close();
  await admin.end();
}
