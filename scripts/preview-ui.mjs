import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createSampleWorkspace, PREVIEW_LABEL, SAMPLE_CONVERSATION } from './preview/sample-workspace.mjs';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const check = args.includes('--check');
const portIndex = args.indexOf('--port');
const portText = portIndex < 0 ? (check ? '4321' : '4320') : args[portIndex + 1];
const allowedArgs = new Set(['--check', '--port', portText]);
if (args.some(value => !allowedArgs.has(value)) || !/^\d+$/.test(portText ?? '') || Number(portText) < 1024 || Number(portText) > 65535) {
  throw new Error('Use: node scripts/preview-ui.mjs [--port 4320] [--check]. The host is always 127.0.0.1.');
}
const port = Number(portText);
const origin = `http://127.0.0.1:${port}`;
// Empty values also override any local dotenv entry used by SvelteKit. The
// preview never loads or supplies live credentials and never selects personal mode.
for (const key of Object.keys(process.env)) {
  if (/^(?:QUELLIGHT_|SUPABASE_|ZHIPU_|VERCEL(?:_|$))/.test(key)) process.env[key] = '';
}
for (const key of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'QUELLIGHT_OWNER_SUBJECT', 'QUELLIGHT_OWNER_EMAIL',
  'QUELLIGHT_DATABASE_URL', 'QUELLIGHT_DATABASE_CA', 'ZHIPU_API_KEY', 'RENDER_EXTERNAL_URL']) process.env[key] = '';
Object.assign(process.env, { QUELLIGHT_MODE: 'foundation', QUELLIGHT_DEPLOYMENT: 'local', QUELLIGHT_BUILD_TARGET: 'node',
  HOST: '127.0.0.1', PORT: portText, ORIGIN: origin });
process.chdir(appRoot);

const workspace = createSampleWorkspace();
const badge = `<aside data-local-ui-preview aria-label="${PREVIEW_LABEL}" style="position:fixed;z-index:2147483646;bottom:6px;left:50%;transform:translateX(-50%);padding:4px 9px;border:1px solid #b7b9b3;border-radius:99px;background:#f6f6f0e8;color:#454940;font:9px/1.2 system-ui,sans-serif;letter-spacing:.08em;white-space:nowrap;pointer-events:none">${PREVIEW_LABEL}</aside>`;

function markHtml(response) {
  const write = response.write.bind(response);
  const end = response.end.bind(response);
  const writeHead = response.writeHead.bind(response);
  const chunks = [];
  response.writeHead = (status, ...arguments_) => {
    response.removeHeader('content-length');
    for (const item of arguments_) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        for (const key of Object.keys(item)) if (key.toLowerCase() === 'content-length') delete item[key];
      }
    }
    return writeHead(status, ...arguments_);
  };
  response.write = (chunk, encoding, callback) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined));
    (typeof encoding === 'function' ? encoding : callback)?.();
    return true;
  };
  response.end = (chunk, encoding, callback) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined));
    const body = Buffer.concat(chunks);
    const html = String(response.getHeader('content-type') ?? '').includes('text/html');
    const result = html ? Buffer.from(body.toString('utf8').replace('</body>', `${badge}</body>`)) : body;
    response.write = write;
    return end(result, typeof encoding === 'function' ? encoding : callback);
  };
}

function send(response, result) {
  response.statusCode = result.status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(result.headers ?? {})) response.setHeader(key, value);
  response.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
}
async function readJson(request) {
  if (!String(request.headers['content-type'] ?? '').startsWith('application/json')) throw new Error('PREVIEW_JSON_REQUIRED');
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 65536) throw new Error('PREVIEW_REQUEST_TOO_LARGE');
  }
  return JSON.parse(body);
}
const previewPlugin = {
  name: 'quellight-local-sample-preview', enforce: 'pre',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const address = request.socket.remoteAddress;
      if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(address) || request.headers.host !== `127.0.0.1:${port}`) {
        return send(response, { status: 403, body: { code: 'LOOPBACK_ONLY', message: 'This preview is available only on this computer.' } });
      }
      response.setHeader('cache-control', 'no-store');
      response.setHeader('x-quellight-preview', 'local-sample-content');
      response.setHeader('referrer-policy', 'no-referrer');
      response.setHeader('content-security-policy', `default-src 'self'; connect-src 'self' ws://127.0.0.1:${port}; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'`);
      const url = new URL(request.url, origin);
      try { url.pathname = decodeURIComponent(url.pathname); }
      catch { return send(response, { status: 400, body: { code: 'PREVIEW_PATH_INVALID', message: 'Open the local preview link again.' } }); }
      const method = request.method ?? 'GET';
      const write = !['GET', 'HEAD'].includes(method);
      if (write && (request.headers.origin !== origin || request.headers['sec-fetch-site'] === 'cross-site')) {
        return send(response, { status: 403, body: { code: 'PREVIEW_ORIGIN_REFUSED', message: 'Open the local preview to try this action.' } });
      }
      if (url.pathname === '/' && !url.search && method === 'GET') {
        response.statusCode = 302;
        response.setHeader('location', `/${workspace.defaultQuery}`);
        return response.end();
      }
      if (url.pathname === '/api' || url.pathname.startsWith('/api/') || (url.pathname.startsWith('/auth/') && write)) {
        if (url.pathname.startsWith('/auth/')) return send(response, workspace.handle(method, url));
        void (async () => {
          try { send(response, workspace.handle(method, url, write ? await readJson(request) : undefined)); }
          catch { send(response, { status: 400, body: { ok: false, code: 'PREVIEW_INPUT_INVALID', message: 'Check the sample values and try again.' } }); }
        })();
        return;
      }
      if (write) return send(response, { status: 403, body: { code: 'LOCAL_PREVIEW_WRITE_BLOCKED', message: 'This write is outside the local UI preview.' } });
      if (['/', '/auth/sign-in', '/auth/setup'].includes(url.pathname)) markHtml(response);
      next();
    });
  }
};

const { createServer } = await import('vite');
const server = await createServer({ envDir: false, mode: 'local-ui-preview', cacheDir: '.local/ui-preview-vite', plugins: [previewPlugin],
  server: { host: '127.0.0.1', port, strictPort: true, cors: false, allowedHosts: ['127.0.0.1'], open: false },
  preview: { host: '127.0.0.1' } });
let closing = false;
async function close() { if (closing) return; closing = true; workspace.dispose(); await server.close(); }
process.once('SIGINT', () => { void close(); });
process.once('SIGTERM', () => { void close(); });
await server.listen();

if (check) {
  try {
    const page = await fetch(`${origin}/${workspace.defaultQuery}`);
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes(PREVIEW_LABEL));
    const api = async (path, body) => {
      const response = await fetch(origin + path, body === undefined ? undefined : { method: 'POST',
        headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const bootstrap = await api('/api/bootstrap');
    assert.equal(bootstrap.status, 200);
    assert.equal(bootstrap.body.rooms[0].name, 'Home');
    const created = await api('/api/actions', { actionId: 'room.create', input: { name: 'Quiet plans' }, idempotencyKey: 'preview-create-room' });
    const room = created.body.value;
    const renamed = await api('/api/actions', { actionId: 'room.rename', input: { id: room.id, name: 'Small plans', revision: 1 }, idempotencyKey: 'preview-rename-room' });
    assert.equal(renamed.body.value.name, 'Small plans');
    assert.equal((await api('/api/actions', { actionId: 'room.archive', input: { id: room.id, revision: 2 }, idempotencyKey: 'preview-archive-room' })).status, 200);
    const started = await api(`/api/conversations/${SAMPLE_CONVERSATION}/turns`, { input: 'Try the sample response.', idempotencyKey: 'preview-sample-turn' });
    assert.equal(started.status, 202);
    await new Promise(resolve => setTimeout(resolve, 800));
    const events = await api(`/api/turns/${started.body.turnId}/events?after=0`);
    assert.equal(events.body.events[0].kind, 'text.delta');
    assert.equal((await api(`/api/turns/${started.body.turnId}/cancel`, {})).body.status, 'cancelled');
    assert.equal((await api('/api/unexpected')).status, 403);
    assert.equal((await api('/auth/sign-in', { email: 'sample@quellight.invalid', password: 'not-used' })).status, 403);
    const exported = await fetch(`${origin}/api/conversations/${SAMPLE_CONVERSATION}/export`);
    assert.ok((await exported.text()).includes(PREVIEW_LABEL));
    assert.equal((await fetch(origin + '/api/actions', { method: 'POST', headers: { origin: 'https://foreign.example', 'content-type': 'application/json' }, body: '{}' })).status, 403);
    console.log(JSON.stringify({ scope: 'local-ui-preview', passed: true, transport: 'in-memory-synthetic',
      checks: ['real-app-SSR', 'visible-preview-label', 'sample-bootstrap', 'room-create-rename-archive', 'canned-send-stop', 'sample-export', 'unknown-api-blocked', 'auth-write-blocked', 'foreign-origin-blocked'], liveServiceCalls: 0 }));
  } finally { await close(); }
} else {
  console.log(`\n${PREVIEW_LABEL}\n${origin}/${workspace.defaultQuery}\n`);
  console.log('Sample changes live only in this process. Replies are canned. No sign-in, database, model, or deployment is used.');
  console.log('Press Ctrl+C to stop. Restart to reset sample content.');
}
