import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { connect, createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createConsumer, observationGroups } from './consumer.mjs';

const appSha = '14b6ccaf6f409eac3e041dc3d9abd0bb9f875344';
const designSha = '9dbfd28175d86b28f9a52340aa4939b4ed11db81';
const lockSha = '31b606ed8bdffa497bd4621f87877900ed3767f2f0ee0a5681f384e75d75e225';
const fixtureCommit = '5166198b4a39a59701455aa1532deb3243c34059';
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
assert.match(adminUrl.pathname, /^\/q4_006_[a-z0-9]+$/);
assert.ok(adminUrl.port && !adminUrl.password && !adminUrl.search && !adminUrl.hash);
const runtimeUrl = new URL(adminUrl), shadowUrl = new URL(adminUrl);
runtimeUrl.username = 'ql_q6_fixture_writer';
shadowUrl.username = 'ql_q6_fixture_reader';
const config = { schema: 'quellight_ops_v1', namespace: 'quellight-v1', writerEpoch: 1,
  tls: 'disable-loopback-only', maxConnections: 2 };
const product = 'quellight_product_v1', nativeSchema = 'quellight_memory_v2';
const admin = new Client({ connectionString: adminUrl.href });
const open = url => createIndexedPostgresStores({ ...config, connectionString: url.href });
const ownerId = randomUUID();
const owner = { id: ownerId, actorId: ownerId, email: 'harbor@fixture.invalid' };
const roomId = randomUUID(), conversationId = randomUUID();
const report = {
  schema: 'quellight.q4-006.installed-replay@1', status: 'started', appSha, designSha, lockSha, fixtureCommit,
  node: process.version, fixtureSha256: hash(fixtureBytes),
  archives: manifest.artifacts.map(({ name, version, sha256 }) => ({ name, version, sha256 })),
  scope: { actorId: ownerId, roomId, conversationId },
  settlements: [], publications: [], models: [], inventories: [], consumerReads: [],
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
    if (!existing.rowCount) await admin.query('CREATE ROLE ' + role + (role.startsWith('ql_q6_') ? ' LOGIN INHERIT' : ''));
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
  await admin.query("GRANT UPDATE(writer_epoch) ON quellight_ops_v1.namespaces TO ql_q6_fixture_reader; " +
    "CREATE FUNCTION quellight_ops_v1.q4_006_deny_shadow_writes() RETURNS trigger LANGUAGE plpgsql AS " +
    "$body$ BEGIN IF current_user = 'ql_q6_fixture_reader' THEN RAISE EXCEPTION 'Q4_SHADOW_READ_ONLY'; " +
    "END IF; RETURN NEW; END; $body$; CREATE TRIGGER q4_006_deny_shadow_writes BEFORE UPDATE ON " +
    "quellight_ops_v1.namespaces FOR EACH ROW EXECUTE FUNCTION quellight_ops_v1.q4_006_deny_shadow_writes()");
  for (const { tablename } of (await admin.query(
    'SELECT tablename FROM pg_tables WHERE schemaname=$1 AND rowsecurity', [product])).rows) {
    // Local fixture only. The application still performs its actor and scope checks.
    await admin.query('CREATE POLICY q4_006_shadow ON ' + product + '.' + tablename +
      ' FOR SELECT TO ' + shadowUrl.username + ' USING (true)');
  }
  for (const table of ['conversation_turns', 'turn_fragments']) {
    await admin.query('CREATE POLICY q4_006_writer ON ' + product + '.' + table +
      ' TO ql_app_runtime USING(true) WITH CHECK(true)');
  }
  await admin.query('INSERT INTO quellight_product_v1.rooms(id,actor_id,name,purpose) VALUES($1,$2,$3,$4)',
    [roomId, ownerId, fixture.room, 'Synthetic harbor observation membership fixture']);
  await admin.query('INSERT INTO quellight_product_v1.conversations(id,actor_id,room_id,thread_id,title) VALUES($1,$2,$3,$4,$5)',
    [conversationId, ownerId, roomId, 'vict-conv-' + conversationId, fixture.room]);
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

const tagPattern = /\bSYN_[UA]\d{2}\b/g;
const mainTags = fixture.turns.flatMap(turn => [turn.user.match(tagPattern)[0], turn.assistant.match(tagPattern)[0]]);
const sourceByTag = new Map();
const originals = new Map();
const publications = new Map();
let activePlan;
const scripted = createDeterministicOfflineModel({ script: {} });
const texts = value => typeof value === 'string' ? value : value.map(item => item.text ?? '').join('\n');

function chatModel(turn) {
  const model = createDeterministicOfflineModel({ script: { [turn.user]: { kind: 'text', text: turn.assistant } } });
  return { ...model, doStream(options) {
    report.models.push({ role: 'chat', label: turn.id });
    return model.doStream(options);
  } };
}

function maintenanceModel(job, plan) {
  assert.equal(job.kind, plan.kind);
  function capture(options) {
    const userMessages = options.prompt.filter(message => message.role === 'user').map(message => texts(message.content));
    const heading = plan.kind === 'reflect' ? '## OBSERVATIONS TO REFLECT ON' : '## New Message History to Observe';
    const prompt = userMessages.find(message => message.includes(heading));
    assert.ok(prompt, 'Actual native ' + plan.kind + ' input section required');
    const section = prompt.slice(prompt.indexOf(heading)).split(/^\s*---\s*$/m)[0];
    let associations, reply;
    if (plan.kind === 'observe') {
      const tags = [...section.matchAll(tagPattern)].map(match => match[0]);
      assert.deepEqual(tags, plan.expectedTags, 'Actual Observer input order differs from the frozen fixture');
      associations = { tags, orderedSourceIds: tags.map(tag => {
        const source = sourceByTag.get(tag);
        assert.ok(source && !source.excluded, 'Observer input lacks an eligible native source binding');
        return source.id;
      }) };
      reply = '<observations>\n- ' + plan.note + '\n</observations>';
    } else {
      const memberships = plan.inputParents.map(label => {
        const prior = publications.get(label);
        const note = '- ' + prior.plan.note;
        return { label, id: prior.group.id, note, ids: prior.groundTruth.orderedSourceIds,
          position: section.indexOf(note) };
      });
      assert.ok(memberships.every(parent => parent.position >= 0), 'A frozen parent note was not delivered to Reflector');
      const retained = memberships.filter(parent => plan.retainedParents.includes(parent.label));
      assert.ok(retained.length > 0);
      associations = {
        inputParentIds: memberships.map(parent => parent.id),
        copiedParentIds: retained.map(parent => parent.id),
        orderedSourceIds: [...new Set(retained.flatMap(parent => parent.ids))],
      };
      reply = '<observations>\n## Group ' + plan.id + '\n' + retained.map(parent => parent.note).join('\n') + '\n</observations>';
    }
    report.models.push({ role: plan.kind, label: plan.id, jobId: job.id, authorityRevision: job.authority_revision,
      promptSection: section, reply, ...associations });
    return reply;
  }
  return { ...scripted, async doGenerate(options) {
    const text = capture(options);
    const result = await scripted.doGenerate(options);
    return { ...result, content: [{ type: 'text', text }] };
  }, async doStream(options) {
    const text = capture(options);
    return { stream: new ReadableStream({ start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });
      controller.enqueue({ type: 'text-start', id: 'fixture' });
      controller.enqueue({ type: 'text-delta', id: 'fixture', delta: text });
      controller.enqueue({ type: 'text-end', id: 'fixture' });
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
  const { memoryActivity, publicConversationSources, enqueueMemoryJob } = await load('memory/jobs');
  const { getConversation } = await load('domain/queries');
  const { loadEffectiveMemorySettings } = await load('memory/settings');
  const { openQuellightMemory } = await load('memory/native');
  const { memorySourcePage } = await load('memory/inspection-views');
  const { policyIdentity } = await load('memory/inspection');
  const processJob = createMemoryJobProcessor({ modelFactory: async job => () => maintenanceModel(job, activePlan) });
  const dispatch = createMemoryDispatcher({ actorId: ownerId, openDatabase: () => open(runtimeUrl), process: processJob });
  const consumer = createConsumer({ stores: reader, owner, roomId,
    ports: { getConversation, loadEffectiveMemorySettings, openQuellightMemory, memorySourcePage, policyIdentity }, meter });
  const activity = () => memoryActivity(writer.coordination.pool, ownerId, conversationId);
  const effective = () => loadEffectiveMemorySettings(writer.coordination.pool, ownerId, roomId);
  const openMemory = async () => openQuellightMemory({ stores: writer, ownerActorId: ownerId, conversationId,
    effective: await effective() });

  async function inventory(label) {
    const page = await memorySourcePage(writer, owner, conversationId);
    assert.equal(page.nextCursor, null);
    assert.equal(page.sources.length, 2 * report.settlements.length);
    sourceByTag.clear();
    for (const source of page.sources) {
      const tags = source.text.match(tagPattern);
      assert.equal(tags?.length, 1);
      const [tag] = tags;
      assert.ok(mainTags.includes(tag) && !sourceByTag.has(tag));
      assert.equal(source.role, tag.startsWith('SYN_U') ? 'user' : 'assistant');
      if (originals.has(tag)) assert.equal(originals.get(tag), source.id, 'Original native identity changed');
      else originals.set(tag, source.id);
      sourceByTag.set(tag, source);
    }
    report.inventories.push({ label, authorityRevision: page.authorityRevision,
      orderedOriginals: [...sourceByTag].map(([tag, source]) => ({ tag, ...source })) });
    return page.authorityRevision;
  }

  async function settle(turn) {
    const talking = createConversationService({ openDatabase: () => open(runtimeUrl),
      readCredential: async () => 'fixture-unused', modelFactory: () => chatModel(turn) });
    const started = await talking.start(owner, conversationId, { input: turn.user, idempotencyKey: randomUUID() });
    await started.completion;
    const projected = await talking.events(owner, started.turnId, 0);
    assert.equal(projected.turn.status, 'completed');
    assert.equal(projected.turn.projectionSettled, true);
    assert.equal(projected.assistantMessage.text, turn.assistant);
    report.settlements.push({ label: turn.id, turnId: started.turnId, assistantId: projected.assistantMessage.id,
      status: projected.turn.status, projectionSettled: true });
  }

  async function enqueueReflection(authorityRevision) {
    const policy = await effective();
    const source = await publicConversationSources(writer.coordination.pool, ownerId, conversationId);
    const lease = await writer.coordination.acquire({ scopeId: 'quellight:conversation:' + conversationId,
      actorId: ownerId, ownerId: randomUUID(), leaseMs: 30_000 });
    assert.equal(lease.status, 'acquired');
    try {
      return await writer.coordination.withFence(lease.lease, client => enqueueMemoryJob(client, {
        actorId: ownerId, conversationId, kind: 'reflect', sourceRevision: source.revision, configuration: policy,
        authorityRevision,
      }));
    } finally {
      await writer.coordination.release(lease.lease);
    }
  }

  async function collect(plan, fixtureQueuedJob) {
    activePlan = plan;
    const before = report.models.length;
    const delivery = await dispatch();
    const additions = report.models.slice(before);
    assert.equal(additions.length, 1, 'Exactly one deterministic maintenance call is expected: ' + plan.id);
    const [groundTruth] = additions;
    assert.equal(groundTruth.role, plan.kind);
    if (fixtureQueuedJob) assert.equal(fixtureQueuedJob.id, groundTruth.jobId);
    const operationId = 'memory-job:' + groundTruth.jobId;
    const events = (await activity()).filter(event => event.job_id === groundTruth.jobId).reverse();
    assert.deepEqual(events.map(event => event.state), ['queued', 'running', 'completed']);
    const memory = await openMemory();
    try {
      const operation = await memory.service.operation(conversationId, operationId);
      assert.equal(operation?.status, 'completed');
      assert.equal(operation.kind, plan.kind);
      assert.equal(operation.result?.[plan.kind === 'reflect' ? 'reflected' : 'observed'], true);
      assert.equal(operation.events.filter(event => event.name === 'published').length, 1);
      const groups = observationGroups(operation.result.snapshot.current.observations);
      const hits = plan.kind === 'reflect'
        ? groups.filter(group => group.kind === 'reflection')
        : groups.filter(group => group.body.split('\n').includes('- ' + plan.note));
      assert.equal(hits.length, 1, plan.id);
      if (plan.kind === 'reflect') {
        const expectedBody = groundTruth.reply.split('\n').filter(line => line.startsWith('- '));
        assert.deepEqual(hits[0].body.split('\n'), expectedBody);
      }
      const result = { label: plan.id, kind: plan.kind, operation, group: hits[0], delivery, events };
      report.publications.push(result);
      publications.set(plan.id, { ...result, plan, groundTruth });
    } finally {
      await memory.hosted.close();
    }
  }

  async function readPublication(label, publicationLabel) {
    const before = report.models.length;
    const { operation } = publications.get(publicationLabel);
    const result = await consumer({ label, conversationId, operationId: operation.operation_id });
    assert.equal(report.models.length, before, 'The consumer cannot invoke an inference seam');
    report.consumerReads.push(result);
    return result;
  }

  for (const plan of fixture.observe) {
    for (const id of plan.turnIds) await settle(fixture.turns.find(turn => turn.id === id));
    assert.equal(await inventory('before-' + plan.id), '0');
    await collect({ ...plan, kind: 'observe' });
    await readPublication(plan.id, plan.id);
  }
  const reflectionBefore = fixture.reflectBefore;
  await collect({ ...reflectionBefore, kind: 'reflect' }, await enqueueReflection('0'));
  await readPublication(reflectionBefore.id, reflectionBefore.id);

  // This ID is frozen by the pre-model native inventory and the existing source
  // projection. No observation range is used to locate the message to Forget.
  const targetId = originals.get(fixture.forgetTag);
  const care = await executeMemoryCareAction(writer, owner, 'memory.forget', {
    conversationId, expectedAuthorityRevision: '0', sourceMessageIds: JSON.stringify([targetId]),
  }, randomUUID());
  assert.equal(care.ok, true);
  assert.equal(care.value.rebuildQueued, 1);
  assert.equal(care.value.purgeQueued, 1);
  report.care = { targetId, tag: fixture.forgetTag, ...care.value };
  const authorityAfter = await inventory('after-forget-before-rebuild');
  assert.notEqual(authorityAfter, '0');
  assert.equal(authorityAfter, report.care.authorityRevision);
  assert.equal(sourceByTag.get(fixture.forgetTag).excluded, true);
  assert.deepEqual([...sourceByTag].filter(([, source]) => !source.excluded).map(([tag]) => tag), fixture.rebuild.expectedTags);
  for (const tag of fixture.expectations.endpointTagsUnaffectedByInteriorExclusion) assert.equal(sourceByTag.get(tag).excluded, false);
  await readPublication('old-observe', 'open');
  await readPublication('old-reflect', reflectionBefore.id);
  await collect({ ...fixture.rebuild, kind: 'observe' });
  await readPublication(fixture.rebuild.id, fixture.rebuild.id);
  const reflectionAfter = fixture.reflectAfter;
  await collect({ ...reflectionAfter, kind: 'reflect' }, await enqueueReflection(authorityAfter));
  await readPublication(reflectionAfter.id, reflectionAfter.id);

  // Receipt census is outside the measured consumer. The public store list is
  // unfiltered. This audit validates the operation without granting the reader
  // an out-of-band receipt pointer or a membership envelope.
  const turns = await writer.turns.listTurns();
  report.receiptAudit = { namespaceTurnsRead: turns.length, receipts: [] };
  for (const item of report.publications) {
    const { operation } = item;
    const matches = turns.filter(turn => turn.actorId === ownerId && turn.threadId === operation.thread_id &&
      turn.inputSummary === 'memory:' + item.kind + ':' + operation.operation_id);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].status, 'completed');
    const receipts = await writer.invocations.listInvocationsForTurn(matches[0].turnId);
    const invocation = receipts.find(receipt => receipt.actorId === ownerId &&
      receipt.capabilityId === 'quellight.memory.maintain' && receipt.capabilityRevision === '1');
    assert.ok(invocation?.status === 'completed' && invocation.effect === 'write');
    const request = { kind: item.kind, actorId: ownerId, conversationId, operationId: operation.operation_id,
      configurationRevision: operation.configuration_revision, sourceRevision: operation.source_digest,
      authorityRevision: operation.authority_revision };
    assert.equal(invocation.argDigest, canonicalArgDigest(request));
    report.receiptAudit.receipts.push({ label: item.label, request, invocation, maintenanceTurnId: matches[0].turnId });
  }

  report.comparisons = report.consumerReads.map(row => {
    if (row.label === 'old-observe' || row.label === 'old-reflect') {
      assert.equal(row.disposition, 'stale-authority');
      assert.equal(row.operation.resultPresent, false);
      assert.equal(row.operation.checkpointPresent, false);
      assert.equal(row.operation.publicationEvents.length, 1);
      assert.deepEqual(row.acceptedIds, []);
      assert.ok(!row.reads.some(read => read.port === 'app.memorySourcePage'));
      return { label: row.label, acceptedIds: [], disposition: row.disposition,
        operationId: row.operationId, publishedAuthority: row.operation.authorityRevision,
        readAuthority: row.authority.revision };
    }
    const { groundTruth, group } = publications.get(row.label);
    const actual = row.groups.find(item => item.groupId === group.id);
    assert.ok(actual);
    const expectedIds = groundTruth.orderedSourceIds;
    const extras = actual.apparentEligibleIds.filter(id => !expectedIds.includes(id));
    const omissions = expectedIds.filter(id => !actual.apparentEligibleIds.includes(id));
    assert.deepEqual(omissions, []);
    if (row.label === reflectionBefore.id) {
      assert.deepEqual(extras, fixture.expectations.reflectionInteriorOverinclusionTags.map(tag => originals.get(tag)));
    } else {
      assert.deepEqual(actual.apparentEligibleIds, expectedIds);
    }
    if (row.label === 'middle' || row.label === 'close') assert.deepEqual(actual.acceptedIds, expectedIds);
    else assert.deepEqual(actual.acceptedIds, []);
    if (row.authority.revision !== '0') {
      assert.ok(!expectedIds.includes(targetId) && !row.acceptedIds.includes(targetId));
      assert.ok(!actual.apparentEligibleIds.includes(targetId));
      assert.ok(actual.apparentAllIds.includes(targetId) && actual.rejectedIds.includes(targetId));
    }
    return { label: row.label, groupId: group.id, operationId: row.operationId,
      authorityRevision: row.authority.revision, expectedIds, ...actual, extras, omissions };
  });
  assert.ok(report.comparisons.find(row => row.label === 'open').expectedIds.length >= fixture.expectations.longObserveMinimumMembers);
  report.resource = { chatFixtureCalls: report.models.filter(model => model.role === 'chat').length,
    observeFixtureCalls: report.models.filter(model => model.role === 'observe').length,
    reflectFixtureCalls: report.models.filter(model => model.role === 'reflect').length,
    consumerModelCalls: 0, liveProviderCalls: 0, addedSendRoundTrips: 0 };
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
