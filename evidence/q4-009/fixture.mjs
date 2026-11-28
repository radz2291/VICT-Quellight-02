import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer, connect } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyApp } from '../q4-008/fixture.mjs';
import { testRoomComposition, roomBlock } from './overlay.mjs';

const config = { schema: 'quellight_ops_v1', namespace: 'quellight-v1', writerEpoch: 1,
  tls: 'disable-loopback-only', maxConnections: 3 };
const product = 'quellight_product_v1', native = 'quellight_memory_v2';
const writerRole = 'ql_q9_fixture_writer';

async function wireMeter(port) {
  const sockets = new Set();
  const totals = { sent: 0, received: 0, connections: 0 };
  const server = createServer(client => {
    totals.connections++;
    const upstream = connect({ host: '127.0.0.1', port });
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    }
    client.on('data', bytes => totals.sent += bytes.length);
    upstream.on('data', bytes => totals.received += bytes.length);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.pipe(upstream);
    upstream.pipe(client);
  });
  await new Promise((done, reject) => server.once('error', reject).listen(0, '127.0.0.1', done));
  return { port: server.address().port, read: () => ({ ...totals }),
    close() { for (const socket of sockets) socket.destroy(); server.close(); } };
}

export async function openFixture(appPath, dsn, dir) {
  const app = resolve(appPath);
  assert.equal(process.version, 'v22.23.5');
  const identity = await verifyApp(app);
  assert.equal(identity.installedBinding, 'baseline');
  const adminDsn = new URL(dsn), writerDsn = new URL(dsn);
  assert.match(adminDsn.protocol, /^postgres(?:ql)?:$/);
  assert.equal(adminDsn.hostname, '127.0.0.1');
  assert.equal(adminDsn.username, 'q4_fixture');
  assert.match(adminDsn.pathname, /^\/q4_009_[a-z][a-z0-9]*$/);
  assert.ok(adminDsn.port && !adminDsn.password && !adminDsn.search && !adminDsn.hash);
  writerDsn.username = writerRole;
  const requireApp = createRequire(join(app, 'package.json'));
  const use = name => import(pathToFileURL(requireApp.resolve(name)).href);
  const { Client } = requireApp('pg');
  const { createIndexedPostgresStores } = await use('@victframework/store-postgres');
  const { createServer: createVite } = await use('vite');
  const adapter = await use('@victframework/mastra');
  const open = (url = writerDsn) => createIndexedPostgresStores({ ...config, connectionString: url.href });
  const admin = new Client({ connectionString: adminDsn.href });
  await admin.connect();
  const query = (sql, values) => admin.query(sql, values);
  const one = async (sql, values) => (await query(sql, values)).rows[0] ?? null;
  const meter = await wireMeter(Number(adminDsn.port));
  const metered = new URL(writerDsn);
  metered.port = meter.port;

  async function provision() {
    assert.equal(await one("SELECT 1 FROM pg_namespace WHERE nspname='quellight_product_v1'"), null,
      'Use an empty disposable database');
    for (const role of ['anon', 'authenticated', 'ql_app_runtime', writerRole]) {
      if (!await one('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]))
        await query('CREATE ROLE ' + role + (role === writerRole ? ' LOGIN INHERIT' : ''));
    }
    await query(`GRANT ql_app_runtime TO ${writerRole}`);
    await query('CREATE SCHEMA auth; CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz)');
    const { indexedSchemaStatements } = await use('@victframework/store-postgres/operator');
    for (const sql of await indexedSchemaStatements(config.schema)) await query(sql);
    await query("INSERT INTO quellight_ops_v1.namespaces VALUES ('quellight-v1',1); INSERT INTO quellight_ops_v1.callback_admission VALUES ('quellight-v1')");
    for (const file of (await readdir(join(app, 'migrations'))).sort())
      if (file.endsWith('.sql') && !file.includes('wakeup')) await query(await readFile(join(app, 'migrations', file), 'utf8'));
    const setup = await open(adminDsn);
    try {
      const hosted = await adapter.createPostgresMastraStore({ coordination: setup.coordination, schemaName: native,
        migration: 'apply', memoryProfile: 'native-thread-recoverable' });
      await hosted.close();
    } finally { await setup.close(); }
    const schemas = [product, config.schema, native].join(',');
    await query(`GRANT USAGE ON SCHEMA ${schemas} TO ql_app_runtime`);
    await query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schemas} TO ql_app_runtime`);
    await query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schemas} TO ql_app_runtime`);
    for (const table of ['conversation_turns', 'turn_fragments'])
      await query(`CREATE POLICY q4_009_fixture_writer ON ${product}.${table} TO ql_app_runtime USING(true) WITH CHECK(true)`);
    await query(`CREATE SCHEMA q4_009_room;
      CREATE TABLE q4_009_room.approvals (actor_id uuid NOT NULL,room_id uuid NOT NULL,authority text NOT NULL,
        revision text NOT NULL,source_id text NOT NULL,block text NOT NULL, PRIMARY KEY(actor_id,room_id,authority));
      GRANT USAGE ON SCHEMA q4_009_room TO ql_app_runtime;
      GRANT SELECT ON q4_009_room.approvals TO ql_app_runtime;`);
  }

  async function createThread(owner, roomId, title) {
    const id = randomUUID();
    await query(`INSERT INTO ${product}.conversations(id,actor_id,room_id,thread_id,title) VALUES($1,$2,$3,$4,$5)`,
      [id, owner.actorId, roomId, 'vict-conv-' + id, title]);
    return id;
  }

  async function createStory(prefix) {
    const actorId = randomUUID(), roomId = randomUUID(), otherRoomId = randomUUID();
    const owner = { actorId, id: actorId, email: 'cedar-cut@fixture.invalid' };
    const setup = await open(adminDsn);
    try { await setup.actors.upsert({ actorId, roles: ['developer', 'operator'], status: 'active', createdAt: Date.now() }); }
    finally { await setup.close(); }
    for (const [id, title] of [[roomId, 'Cedar Cut'], [otherRoomId, 'Larch Review']])
      await query(`INSERT INTO ${product}.rooms(id,actor_id,name,purpose) VALUES($1,$2,$3,$4)`,
        [id, actorId, title, 'Check review versions and retry identity.']);
    return { owner, roomId, otherRoomId, thread: await createThread(owner, roomId, prefix),
      evidenceThread: await createThread(owner, roomId, 'Approved source'),
      freshThread: await createThread(owner, roomId, 'Fresh conversation'),
      otherThread: await createThread(owner, otherRoomId, 'Other room') };
  }

  async function runtime(arm) {
    const plugin = arm === 'room-block' ? testRoomComposition() : null;
    const vite = await createVite({ root: app, configFile: false, logLevel: 'error', cacheDir: join(dir, 'vite', arm),
      plugins: plugin ? [plugin] : [],
      server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
    const load = name => vite.ssrLoadModule('/src/lib/server/' + name + '.ts');
    return { load, edits: () => plugin?.applied() ?? [], close: () => vite.close() };
  }

  async function withStores(work) {
    const stores = await open();
    try { return await work(stores); }
    finally { await stores.close(); }
  }

  async function sourcePage(rt, story, thread = story.thread) {
    const { memorySourcePage } = await rt.load('memory/inspection-views');
    return withStores(stores => memorySourcePage(stores, story.owner, thread));
  }

  async function approve(rt, story, thread, revision, content, sourceId) {
    const scope = await one(`SELECT room_id FROM ${product}.conversations WHERE id=$1 AND actor_id=$2`, [thread, story.owner.actorId]);
    assert.equal(scope?.room_id, story.roomId);
    const page = await sourcePage(rt, story, thread);
    assert.ok(page.sources.some(source => source.id === sourceId && !source.excluded && source.role === 'user'));
    const block = roomBlock(revision, content);
    await query('INSERT INTO q4_009_room.approvals VALUES($1,$2,$3,$4,$5,$6)',
      [story.owner.actorId, story.roomId, page.authorityRevision, revision, sourceId, block]);
    return { revision, authority: page.authorityRevision, sourceId, sourceThread: thread, block, roomId: story.roomId };
  }

  async function care(rt, story, thread, action, data) {
    const { executeMemoryCareAction } = await rt.load('memory/care-actions');
    const page = await sourcePage(rt, story, thread);
    const request = { conversationId: thread, expectedAuthorityRevision: page.authorityRevision,
      sourceMessageIds: JSON.stringify(data.ids ?? []), ...(data.workingMemory ? { workingMemory: data.workingMemory } : {}) };
    const key = randomUUID();
    const result = await withStores(stores => executeMemoryCareAction(stores, story.owner, action, request, key));
    assert.equal(result.ok, true);
    assert.notEqual(result.value.authorityRevision, page.authorityRevision);
    const receipt = await one(`SELECT action_id,state,conversation_id,command_key,argument_digest,expected_authority_revision,
      intended_authority_revision,native_operation_id FROM ${product}.memory_care_commands WHERE actor_id=$1 AND command_key=$2`,
      [story.owner.actorId, key]);
    return { request, result, receipt };
  }

  async function desk(rt, story, previous) {
    const { executeDeskAction } = await rt.load('desk/domain');
    const args = previous ? { roomId: story.roomId, itemId: previous.id, expectedRevision: previous.revision,
      text: ' Confirm the uploaded index has a receipt.' } : { roomId: story.roomId, title: 'Review checklist',
      body: 'Verify the versioned upload index.', kind: 'note', status: 'active', attention: 'carried' };
    const changed = await withStores(stores => executeDeskAction(stores, story.owner, previous ? 'desk.append' : 'desk.create', args, randomUUID()));
    assert.equal(changed.ok, true);
    const result = await one(`SELECT id,revision,title,body FROM ${product}.desk_items WHERE actor_id=$1 AND room_id=$2`, [story.owner.actorId, story.roomId]);
    assert.equal(Number(result.revision), previous ? previous.revision + 1 : 1);
    return { ...result, revision: Number(result.revision) };
  }

  return { identity, adapter, open, withStores, provision, createStory, runtime, sourcePage, approve, care, desk, one,
    meter, metered, postgres: (await one('SHOW server_version')).server_version, async close() { meter.close(); await admin.end(); } };
}
