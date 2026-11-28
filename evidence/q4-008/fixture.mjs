import assert from 'node:assert/strict';
import { execFileSync, fork } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const appSha = '14b6ccaf6f409eac3e041dc3d9abd0bb9f875344';
export const designSha = '9dbfd28175d86b28f9a52340aa4939b4ed11db81';
const oldAdapter = '90b2de7c6515785e23b4e6370c92be019959ffca430a7980f6752d5d104c9b2c';
const candidateAdapter = '9f75998297af4755bfa1abe567f198c7b0731dd304fca1c6c06163f480e03184';
const candidateMemory = 'ed2e8db8e55c60afe1dd4eb3b93b3c5308f35d7accaeff939d488724339c0ea6';
const baselineLock = '31b606ed8bdffa497bd4621f87877900ed3767f2f0ee0a5681f384e75d75e225';
const candidateLock = '9b9c90361392dd0af0f282834ad231011554f04a3e5ac2ab20eff734874563be';
const config = { schema: 'quellight_ops_v1', namespace: 'quellight-v1', writerEpoch: 1,
  tls: 'disable-loopback-only', maxConnections: 2 };
const product = 'quellight_product_v1', native = 'quellight_memory_v2';
const syntheticWriter = 'ql_q8_fixture_writer';
export const sha = value => createHash('sha256').update(value).digest('hex');
export const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { windowsHide: true });
const json = async file => JSON.parse(await readFile(file, 'utf8'));

export function dsns(dsn) {
  const admin = new URL(dsn);
  assert.match(admin.protocol, /^postgres(?:ql)?:$/);
  assert.equal(admin.hostname, '127.0.0.1');
  assert.equal(admin.username, 'q4_fixture');
  assert.match(admin.pathname, /^\/q4_008_[a-z][a-z0-9]*$/);
  assert.ok(admin.port && !admin.password && !admin.search && !admin.hash);
  const writer = new URL(admin);
  writer.username = syntheticWriter;
  return { admin, writer };
}

export async function verifyApp(app) {
  const head = git(app, 'rev-parse', 'HEAD').toString().trim();
  assert.equal(head, appSha);
  assert.equal(git(app, 'diff', appSha, '--', 'src', 'config', 'migrations', 'svelte.config.js', 'vite.config.ts').toString(), '');
  assert.equal(sha(git(app, 'show', `${appSha}:package-lock.json`)), baselineLock);
  const manifest = await json(join(app, 'baseline.json'));
  const original = JSON.parse(git(app, 'show', `${appSha}:baseline.json`).toString());
  assert.equal(manifest.artifacts.length, 14);
  const adapter = manifest.artifacts.find(item => item.name === '@victframework/mastra');
  const candidate = adapter.sha256 === candidateAdapter;
  assert.equal(adapter.sha256, candidate ? candidateAdapter : oldAdapter);
  for (const archive of manifest.artifacts) {
    assert.equal(sha(await readFile(join(app, archive.file))), archive.sha256);
    if (archive !== adapter) assert.equal(archive.sha256, original.artifacts.find(item => item.name === archive.name).sha256);
  }
  const lock = JSON.parse(await readFile(join(app, 'package-lock.json')));
  const memory = lock.packages['node_modules/@mastra/memory'];
  const adapterEntry = fileURLToPath(import.meta.resolve('@victframework/mastra', pathToFileURL(join(app, 'package.json')).href));
  const memoryEntry = fileURLToPath(import.meta.resolve('@mastra/memory', pathToFileURL(adapterEntry).href));
  assert.equal(adapterEntry, join(app, 'node_modules/@victframework/mastra/dist/index.js'));
  assert.equal(memoryEntry, join(app, 'node_modules/@mastra/memory/dist/index.js'));
  const checkTar = async (archive, installed, paths) => {
    for (const name of paths) {
      const packed = execFileSync('tar', ['-xOf', archive, 'package/dist/' + name], { windowsHide: true, maxBuffer: 6 * 1024 * 1024 });
      assert.equal(sha(await readFile(join(installed, name))), sha(packed), name);
    }
  };
  await checkTar(join(app, adapter.file), join(adapterEntry, '..'), ['index.js', 'native-memory.js', 'postgres-storage.js']);
  let memoryHash;
  if (candidate) {
    assert.equal(sha(await readFile(join(app, 'package-lock.json'))), candidateLock);
    assert.equal(memory.version, '1.28.2-q4-007.1');
    assert.match(memory.resolved, /^file:packs\/mastra-memory-1\.28\.2-q4-007\.1\.tgz$/);
    const archive = join(app, memory.resolved.slice(5));
    memoryHash = sha(await readFile(archive));
    assert.equal(memoryHash, candidateMemory);
    await checkTar(archive, join(memoryEntry, '..'), ['index.js', 'src-BYrxAUzs.js']);
  } else {
    assert.equal(memory.version, '1.28.2');
    const closure = await json(join(app, 'package-lock.json'));
    assert.deepEqual(closure, JSON.parse(git(app, 'show', `${appSha}:package-lock.json`).toString()));
    memoryHash = 'f1469f784fbb8385376936e20ad1e89364221f0fe3f53412094955a976527e07';
    assert.equal(sha(await readFile(join(memoryEntry, '..', 'src-BYrxAUzs.js'))),
      '68020175639768e6c7442f0f74bf7dd5fa48fa3c52fcfdd2397ed9d0e3ccbdeb');
  }
  return { app: head, node: process.version, sourceLock: baselineLock, installLock: candidate ? candidateLock : baselineLock,
    adapter: adapter.sha256, memory: memoryHash, memoryVersion: memory.version, memoryIntegrity: memory.integrity,
    installedBinding: candidate ? 'candidate' : 'baseline', victArchiveCount: manifest.artifacts.length };
}

export async function openRuntime(appPath, dsn, dir) {
  assert.equal(process.version, 'v22.23.5');
  const app = resolve(appPath), urls = dsns(dsn);
  const req = createRequire(join(app, 'package.json'));
  const use = name => import(pathToFileURL(req.resolve(name)).href);
  const adapter = await use('@victframework/mastra');
  const { Client } = req('pg');
  const { createIndexedPostgresStores } = await use('@victframework/store-postgres');
  const open = (url = urls.writer) => createIndexedPostgresStores({ ...config, connectionString: url.href });
  const { createServer } = await use('vite');
  const vite = await createServer({ root: app, configFile: false, logLevel: 'error', cacheDir: join(dir, 'vite'),
    server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  const load = name => vite.ssrLoadModule('/src/lib/server/' + name + '.ts');
  return { app, Client, open, urls, use, load, adapter, close: () => vite.close() };
}

const texts = {
  A: ['SYN_U01 The first harbor inspection uses a paper log.', 'SYN_A01 I recorded the paper log for the first inspection.'],
  B: ['SYN_U02 The trial boat-pass rule ends today.', 'SYN_A02 I recorded the end of the boat-pass trial.'],
};

export async function openFixture({ app, dsn, dir }) {
  dir = resolve(dir);
  await mkdir(dir, { recursive: true });
  const rt = await openRuntime(app, dsn, dir);
  const identity = await verifyApp(rt.app);
  const admin = new rt.Client({ connectionString: rt.urls.admin.href });
  await admin.connect();
  const query = (sql, values) => admin.query(sql, values);
  const one = async (sql, values) => (await query(sql, values)).rows[0] ?? null;

  async function provision() {
    assert.equal(await one("SELECT 1 FROM pg_namespace WHERE nspname='quellight_product_v1'"), null,
      'Use an empty isolated database');
    for (const role of ['anon', 'authenticated', 'ql_app_runtime', syntheticWriter]) {
      if (!await one('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]))
        await query('CREATE ROLE ' + role + (role === syntheticWriter ? ' LOGIN INHERIT' : ''));
    }
    await query(`GRANT ql_app_runtime TO ${syntheticWriter}`);
    await query('CREATE SCHEMA auth; CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz)');
    const { indexedSchemaStatements } = await rt.use('@victframework/store-postgres/operator');
    for (const sql of await indexedSchemaStatements(config.schema)) await query(sql);
    await query("INSERT INTO quellight_ops_v1.namespaces VALUES ('quellight-v1',1); INSERT INTO quellight_ops_v1.callback_admission VALUES ('quellight-v1')");
    for (const name of (await readdir(join(rt.app, 'migrations'))).sort())
      if (name.endsWith('.sql') && !name.includes('wakeup')) await query(await readFile(join(rt.app, 'migrations', name), 'utf8'));
    const setup = await rt.open(rt.urls.admin);
    try {
      const hosted = await rt.adapter.createPostgresMastraStore({ coordination: setup.coordination, schemaName: native,
        migration: 'apply', memoryProfile: 'native-thread-recoverable' });
      await hosted.close();
    } finally { await setup.close(); }
    const schemas = [product, config.schema, native].join(',');
    await query(`GRANT USAGE ON SCHEMA ${schemas} TO ql_app_runtime`);
    await query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schemas} TO ql_app_runtime`);
    await query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schemas} TO ql_app_runtime`);
    for (const table of ['conversation_turns', 'turn_fragments'])
      await query(`CREATE POLICY q4_008_fixture_writer ON ${product}.${table} TO ql_app_runtime USING(true) WITH CHECK(true)`);
  }

  async function createScenario(label, { twoThreads = false } = {}) {
    const actorId = randomUUID(), roomId = randomUUID(), conversationId = randomUUID();
    const otherConversationId = twoThreads ? randomUUID() : null;
    const setup = await rt.open(rt.urls.admin);
    try { await setup.actors.upsert({ actorId, roles: ['developer', 'operator'], status: 'active', createdAt: Date.now() }); }
    finally { await setup.close(); }
    await query(`INSERT INTO ${product}.rooms(id,actor_id,name,purpose) VALUES($1,$2,$3,$4)`,
      [roomId, actorId, 'Synthetic harbor ' + label, 'Q4-008 worker restart control']);
    for (const [index, id] of [conversationId, otherConversationId].filter(Boolean).entries())
      await query(`INSERT INTO ${product}.conversations(id,actor_id,room_id,thread_id,title) VALUES($1,$2,$3,$4,$5)`,
        [id, actorId, roomId, `vict-conv-${id}`, `Harbor thread ${index + 1}`]);
    return { label, owner: { actorId, id: actorId, email: 'harbor-restart@fixture.invalid' }, roomId, conversationId, otherConversationId };
  }

  async function inMemory(scenario, conversationId, work) {
    const stores = await rt.open();
    try {
      const { loadEffectiveMemorySettings } = await rt.load('memory/settings');
      const { openQuellightMemory } = await rt.load('memory/native');
      const effective = await loadEffectiveMemorySettings(stores.coordination.pool, scenario.owner.actorId, scenario.roomId);
      const memory = await openQuellightMemory({ stores, ownerActorId: scenario.owner.actorId, conversationId, effective });
      try { return await work(memory, stores, effective); }
      finally { await memory.hosted.close(); }
    } finally { await stores.close(); }
  }

  async function sourcePage(scenario, conversationId = scenario.conversationId) {
    const stores = await rt.open();
    try {
      const { memorySourcePage } = await rt.load('memory/inspection-views');
      const result = await memorySourcePage(stores, scenario.owner, conversationId);
      assert.equal(result.nextCursor, null);
      return result;
    } finally { await stores.close(); }
  }

  async function settle(scenario, thread = 'A') {
    const conversationId = thread === 'A' ? scenario.conversationId : scenario.otherConversationId;
    assert.ok(conversationId && texts[thread]);
    const [user, assistant] = texts[thread];
    const { createConversationService } = await rt.load('conversation/service');
    const model = rt.adapter.createDeterministicOfflineModel({ script: { [user]: { kind: 'text', text: assistant } } });
    const service = createConversationService({ openDatabase: () => rt.open(),
      readCredential: async () => 'fixture-unused', modelFactory: () => model });
    const started = await service.start(scenario.owner, conversationId, { input: user, idempotencyKey: randomUUID() });
    await started.completion;
    const projected = await service.events(scenario.owner, started.turnId, 0);
    assert.equal(projected.turn.status, 'completed');
    assert.equal(projected.turn.projectionSettled, true);
    assert.equal(projected.assistantMessage.text, assistant);
    const jobs = await listJobs(scenario);
    const job = jobs.find(entry => entry.conversation_id === conversationId);
    assert.equal(job?.kind, 'observe');
    assert.equal(job.state, 'queued');
    const originals = await sourcePage(scenario, conversationId);
    assert.deepEqual(originals.sources.map(source => source.text), [user, assistant]);
    return { turnId: started.turnId, conversationId, job, originals };
  }

  async function listJobs(scenario) {
    return (await query(`SELECT id,conversation_id,kind,state,attempts,claim_expires,source_revision,configuration_revision,
      authority_revision,supersedes_job_id,failure_code,job_key FROM ${product}.memory_jobs WHERE actor_id=$1 ORDER BY created_at,id`,
      [scenario.owner.actorId])).rows;
  }

  async function rawWitness(scenario, jobId) {
    const job = (await listJobs(scenario)).find(row => row.id === jobId);
    assert.ok(job, jobId);
    const operationId = 'memory-job:' + jobId;
    const row = await one(`SELECT operation_id,thread_id,request_digest,source_digest,authority_revision,configuration_revision,
      kind,status,events,checkpoint->'sourceMembership' AS prepared_membership,checkpoint IS NOT NULL AS has_checkpoint,
      result->'sourceMembership' AS published_membership,result IS NOT NULL AS has_result,
      encode(sha256(convert_to(checkpoint::text,'UTF8')),'hex') AS checkpoint_digest,
      encode(sha256(convert_to(result::text,'UTF8')),'hex') AS result_digest
      FROM ${native}.vict_memory_recovery WHERE operation_id=$1`, [operationId]);
    const history = (await query(`SELECT e.id::text,e.state,e.code,e.at FROM ${product}.memory_job_events e WHERE e.job_id=$1 ORDER BY e.id`, [jobId])).rows;
    return { job, row, history, operationId };
  }

  async function witness(scenario, jobId) {
    const { job, row, history, operationId } = await rawWitness(scenario, jobId);
    return inMemory(scenario, job.conversation_id, async ({ service }, stores, effective) => {
      const operation = await service.operation(job.conversation_id, operationId);
      const authority = await service.authority(job.conversation_id);
      const receipts = [];
      for (const turn of await stores.turns.listTurns()) {
        if (turn.actorId !== scenario.owner.actorId || !turn.inputSummary?.endsWith(':' + operationId)) continue;
        receipts.push({ turnId: turn.turnId, status: turn.status, inputSummary: turn.inputSummary,
          invocations: (await stores.invocations.listInvocationsForTurn(turn.turnId))
            .map(({ invocationId, status, effect, capabilityId, argDigest }) => ({ invocationId, status, effect, capabilityId, argDigest })) });
      }
      return { job, row, history, receipts, authority: authority.revision, configurationRevision: service.configurationRevision,
        effectiveRevision: effective.revision, operationId, public: operation ? {
          status: operation.status, hasCheckpoint: !!operation.checkpoint, hasResult: !!operation.result,
          exposesCheckpointMembership: !!operation.checkpoint?.sourceMembership,
          sourceMembership: operation.result?.sourceMembership ?? null,
        } : null };
    });
  }

  async function care(scenario, action, { conversationId = scenario.conversationId, expectedAuthorityRevision,
    sourceMessageIds = [], workingMemory } = {}) {
    const stores = await rt.open();
    try {
      const { executeMemoryCareAction } = await rt.load('memory/care-actions');
      const commandKey = randomUUID();
      const request = { conversationId, expectedAuthorityRevision,
        sourceMessageIds: JSON.stringify(sourceMessageIds), ...(workingMemory ? { workingMemory } : {}) };
      const result = await executeMemoryCareAction(stores, scenario.owner, action, request, commandKey);
      const command = await one(`SELECT command_key,conversation_id,action_id,argument_digest,state,
        expected_authority_revision,intended_authority_revision,authority_input,result
        FROM ${product}.memory_care_commands WHERE actor_id=$1 AND command_key=$2`, [scenario.owner.actorId, commandKey]);
      return { ...result, request, command };
    } finally { await stores.close(); }
  }

  async function waitForClaimExpiry(jobId) {
    const started = Date.now();
    while (true) {
      const state = await one(`SELECT claim_expires,claim_expires>clock_timestamp() AS active FROM ${product}.memory_jobs WHERE id=$1`, [jobId]);
      assert.ok(state);
      if (!state.active) return { elapsedMs: Date.now() - started, claimExpires: state.claim_expires };
      assert.ok(Date.now() - started < 45000, 'Expired claim was not observed');
      await delay(120);
    }
  }

  function launch(scenario, { app: workerApp = rt.app, barrier = 'none', windowMs = 13000 } = {}) {
    const child = fork(fileURLToPath(new URL('./worker.mjs', import.meta.url)),
      [workerApp, rt.urls.admin.href, scenario.owner.actorId, barrier, String(windowMs), dir],
      { execArgv: ['--preserve-symlinks', '--experimental-import-meta-resolve'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
    const events = [];
    let trail = '';
    const saveTrail = data => { trail = (trail + data).slice(-5000); };
    child.stdout.on('data', saveTrail);
    child.stderr.on('data', saveTrail);
    child.on('message', item => events.push(item));
    const completed = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ pid: child.pid, code, signal, events, ...(code && code !== 1 ? { trail } : {}) }));
    });
    const safety = setTimeout(() => child.kill('SIGKILL'), 45000);
    completed.finally(() => clearTimeout(safety)).catch(() => {});
    return { events, pid: child.pid,
      async waitForBarrier() {
        for (let i = 0; i < 500; i++) {
          const found = events.find(event => event.type === 'barrier');
          if (found) { assert.equal(found.barrier, barrier); return found; }
          if (child.exitCode !== null || child.signalCode !== null) break;
          await delay(50);
        }
        await this.kill();
        assert.fail('Barrier was not reached: ' + JSON.stringify(events) + ' ' + trail);
      },
      async kill() { child.kill('SIGKILL'); return completed; },
      async done() {
        const result = await completed;
        assert.equal(result.code, 0, JSON.stringify(events) + ' ' + trail);
        return result;
      },
    };
  }

  return { identity, provision, createScenario, settle, rawWitness, witness, listJobs, sourcePage, care, launch, waitForClaimExpiry,
    postgres: (await one('SHOW server_version')).server_version, async close() { await admin.end(); await rt.close(); } };
}
