import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { prepareDatabase, app, databaseRole } from './database.mjs';
import { fixtureEmail, fixtureOwner, startFixtureAuth } from './synth-auth.mjs';
import { installFixtureModel, readProviderKey } from './fixture-model.mjs';

const { values } = parseArgs({ options: { database: { type: 'string', default: 'q4_014_local' },
  port: { type: 'string', default: '4317' }, 'auth-port': { type: 'string', default: '4318' },
  'pg-port': { type: 'string', default: '55443' }, guidance: { type: 'string', default: 'on' },
  'provider-key-file': { type: 'string' }, 'private-dir': { type: 'string' } }, strict: true });
const database = values.database;
const port = Number(values.port);
const authPort = Number(values['auth-port']);
assert.ok([port, authPort].every(port => Number.isSafeInteger(port) && port > 1023 && port <= 65535));
assert.notEqual(port, authPort);
assert.ok(['on', 'off'].includes(values.guidance));
const origin = 'http://127.0.0.1:' + port;
const authOrigin = 'http://127.0.0.1:' + authPort;
const privateDir = values['private-dir'] ?? join(app, '.local', 'q4-014', database);
await mkdir(privateDir, { recursive: true });
const operatorToken = randomUUID() + randomUUID();
const trace = join(privateDir, 'model-trace.ndjson');
const sessionPath = join(privateDir, 'session.json');

for (const key of Object.keys(process.env)) {
  if (/^(?:SUPABASE_|ZHIPU_|QUELLIGHT_|VERCEL(?:_|$)|RENDER_EXTERNAL_URL)/.test(key) &&
      !['QUELLIGHT_PERSONA_DIR'].includes(key)) delete process.env[key];
}
const live = Boolean(values['provider-key-file']);
const credential = live ? readProviderKey(await readFile(values['provider-key-file'], 'utf8')) : 'q4-014-deterministic-model';
const dsn = await prepareDatabase(database, values['pg-port']);
Object.assign(process.env, { QUELLIGHT_MODE: 'personal', QUELLIGHT_DEPLOYMENT: 'local',
  QUELLIGHT_DATABASE_URL: dsn.writer, QUELLIGHT_DATABASE_LOCAL_TEST: 'true',
  QUELLIGHT_INDEXED_DATABASE: database, QUELLIGHT_INDEXED_ROLE: databaseRole, QUELLIGHT_INDEXED_WRITER_EPOCH: '1',
  QUELLIGHT_OWNER_SUBJECT: fixtureOwner, QUELLIGHT_OWNER_EMAIL: fixtureEmail,
  QUELLIGHT_MEMORY_DISPATCH_SECRET: randomUUID() + randomUUID(), QUELLIGHT_ROOM_GUIDANCE: values.guidance,
  SUPABASE_URL: authOrigin, SUPABASE_PUBLISHABLE_KEY: 'q4-014-loopback-auth-fixture',
  ZHIPU_API_KEY: credential, ORIGIN: origin, HOST: '127.0.0.1', PORT: String(port) });

const auth = await startFixtureAuth(authOrigin);
const capture = installFixtureModel({ live, trace });
const automatic = Symbol.for('quellight.q4-014.fixture-automatic-dispatch');
globalThis[automatic] = true;
let server;
const virt = '\0q4-014-fixture-model';
const fixture = {
  name: 'quellight-q4-014-real-app-fixture',
  enforce: 'pre',
  resolveId(id) { if (id === 'virtual:q4-014-fixture-model') return virt; },
  load(id) {
    if (id !== virt) return;
    return [
      "import { ModelRouterLanguageModel as Upstream } from '@mastra/core/llm';",
      "export class ModelRouterLanguageModel { constructor(options) { return globalThis[Symbol.for('quellight.q4-014.fixture-model')](options, Upstream); } }",
    ].join('\n');
  },
  transform(code, id, opts) {
    if (opts?.ssr && id.replaceAll('\\', '/').endsWith('/src/routes/api/conversations/[id]/turns/+server.ts')) {
      const seam = 'completion.then(() => dispatchMemory(deadline))';
      assert.ok(code.includes(seam), 'Unexpected turn-to-worker source seam');
      return code.replace(seam, "completion.then(() => globalThis[Symbol.for('quellight.q4-014.fixture-automatic-dispatch')] ? dispatchMemory(deadline) : undefined)");
    }
    if (!opts?.ssr || !id.replaceAll('\\', '/').includes('/src/lib/server/')) return;
    if (!code.includes("import { ModelRouterLanguageModel } from '@mastra/core/llm';")) return;
    return code.replace("import { ModelRouterLanguageModel } from '@mastra/core/llm';",
      "import { ModelRouterLanguageModel } from 'virtual:q4-014-fixture-model';");
  },
  configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      const reply = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(body));
      };
      if (req.headers.host !== '127.0.0.1:' + port) return reply(403, { error: 'LOOPBACK_FIXTURE_ONLY' });
      const path = new URL(req.url, origin).pathname;
      if (!path.startsWith('/__q4_014/')) return next();
      if (req.headers['x-q4-014-operator'] !== operatorToken || req.headers.origin) return reply(403, { error: 'LOCAL_OPERATOR_REQUIRED' });
      if (req.method === 'GET' && path === '/__q4_014/state') return reply(200, { ...capture.status(), automatic: globalThis[automatic] });
      if (req.method === 'POST' && path === '/__q4_014/freeze') { globalThis[automatic] = false; return reply(200, { automatic: false }); }
      if (req.method === 'POST' && path === '/__q4_014/unfreeze') { globalThis[automatic] = true; return reply(200, { automatic: true }); }
      if (req.method === 'POST' && path === '/__q4_014/hold') { capture.hold(); return reply(200, { held: true }); }
      if (req.method === 'POST' && path === '/__q4_014/release') { capture.release(); return reply(200, { held: false }); }
      if (req.method === 'POST' && path === '/__q4_014/dispatch') {
        void (async () => {
          try {
            const { dispatchMemory } = await vite.ssrLoadModule('/src/lib/server/memory/index.ts');
            const result = await dispatchMemory(undefined, true);
            reply(200, result);
          } catch (error) { reply(503, { error: error?.code ?? 'LOCAL_DISPATCH_FAILED' }); }
        })();
        return;
      }
      return reply(404, { error: 'UNKNOWN_OPERATOR_ACTION' });
    });
  },
};
try {
  const { createServer } = await import('vite');
  server = await createServer({ root: app, envDir: false, mode: 'q4-014-local',
    cacheDir: join(app, '.local', 'q4-014', 'vite'),
    plugins: [fixture], server: { host: '127.0.0.1', port, strictPort: true, open: false } });
  await server.listen();
  const probe = await fetch(origin + '/api/bootstrap');
  assert.equal(probe.status, 401, 'The installed app must refuse an unauthenticated bootstrap');
  await writeFile(sessionPath, JSON.stringify({ origin, database, pgPort: values['pg-port'],
    mode: live ? 'authorized-zai' : 'deterministic-fixture', guidance: values.guidance, operatorToken, trace, pid: process.pid }, null, 2) + '\n', { mode: 0o600 });
  await chmod(sessionPath, 0o600);
  console.log('Q4-014 synthetic local app ready at ' + origin);
  console.log('Sign in as ' + fixtureEmail + ' with password local-room-review.');
  console.log((live ? 'Authorized Z.AI' : 'Deterministic fixture') + ' model mode. Guidance ' + values.guidance + '.');
  const close = async () => { capture.release(); await server.close(); capture.close(); await auth.close(); };
  process.once('SIGINT', () => { void close(); });
  process.once('SIGTERM', () => { void close(); });
} catch (error) {
  capture.close();
  await server?.close();
  await auth.close();
  throw error;
}
