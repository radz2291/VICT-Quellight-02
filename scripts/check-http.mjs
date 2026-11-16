import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const fixtureConversation = '11111111-2222-4333-8444-555555555555';
export const fixtureTurn = `quellight:${fixtureConversation}`;
export const privateCanary = 'quellight-private-build-canary-20261116';

/** Never let a local verification run inherit the owner's live services. */
export function probeEnvironment(overrides = {}) {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(?:QUELLIGHT_|SUPABASE_|ZHIPU_|VERCEL(?:_|$))/.test(key) &&
    !['ORIGIN', 'RENDER_EXTERNAL_URL', 'HOST', 'PORT'].includes(key)));
  return { ...environment, ...overrides };
}

// This also exercises generated Vercel handlers. These are unauthenticated
// transport probes, not proof of a live owner session or provider execution.
export async function probePublicHttp(invoke, origin) {
  const health = await invoke('/healthz');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', application: 'quellight', mode: 'foundation' });
  const ready = await invoke('/readyz');
  assert.equal(ready.status, 503);
  assert.equal((await ready.json()).reason, 'FOUNDATION_ONLY');

  const documentRequest = { headers: { accept: 'text/html' } };
  const page = await invoke('/', documentRequest);
  let entry;
  if ([302, 303, 307, 308].includes(page.status)) {
    const location = new URL(page.headers.get('location'), origin);
    assert.equal(location.origin, origin);
    assert.equal(location.pathname, '/auth/sign-in');
    entry = 'owner-sign-in-redirect';
  } else {
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Quellight/);
    assert.doesNotMatch(html, /Nothing is sent or saved/);
    assert.ok(!html.includes(privateCanary));
    entry = 'public-shell-with-protected-owner-api';
  }
  for (const [path, copy] of [
    ['/auth/sign-in', /Sign in to pick up where you left off/],
    ['/auth/setup', /Set your password to open your private space/]
  ]) {
    const response = await invoke(path, documentRequest);
    assert.equal(response.status, 200, `${path} must render its real sign-in UI.`);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    const html = await response.text();
    assert.match(html, copy);
    assert.match(html, /type="password"/);
    assert.ok(!html.includes(privateCanary));
  }

  const jsonRequest = { headers: { accept: 'application/json' } };
  const post = body => ({ method: 'POST', headers: { origin, accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  for (const [path, init] of [
    ['/api/bootstrap'],
    [`/api/conversations/${fixtureConversation}`],
    [`/api/conversations/${fixtureConversation}/export`],
    [`/api/turns/${fixtureTurn}/events?after=0`],
    ['/api/actions', post({ actionId: 'room.create', input: { name: 'Transport fixture' }, idempotencyKey: fixtureConversation })],
    [`/api/conversations/${fixtureConversation}/turns`, post({ input: 'Never sent to a model.', idempotencyKey: fixtureConversation })],
    [`/api/turns/${fixtureTurn}/cancel`, post({})]
  ]) {
    const response = await invoke(path, init ?? jsonRequest);
    assert.equal(response.status, 401, `${path} must reject an unauthenticated owner request.`);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.match((await response.json()).message, /Sign in to continue/);
  }
  for (const path of ['/auth/sign-in', '/auth/setup', '/auth/sign-out', `/api/turns/${fixtureTurn}/cancel`]) {
    const response = await invoke(path, { ...post({}), headers: { origin: 'https://foreign.example', accept: 'application/json', 'content-type': 'application/json' } });
    assert.equal(response.status, 403, `${path} must refuse a foreign-origin write.`);
  }
  const missing = await invoke('/missing-page', documentRequest);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Return to Quellight/);
  return [entry, 'sign-in-SSR', 'setup-SSR', 'owner-api-401', 'foreign-origin-403', 'health-200', 'foundation-readiness-503', 'error-404'];
}

async function checkNode() {
  // Reserve an ephemeral port and require our child to announce that exact
  // listener. A stale server cannot make this test pass.
  const reservation = createServer();
  await new Promise((yes, no) => { reservation.once('error', no); reservation.listen(0, '127.0.0.1', yes); });
  const port = String(reservation.address().port);
  await new Promise(yes => reservation.close(yes));
  const origin = `http://127.0.0.1:${port}`;
  const environment = probeEnvironment({ QUELLIGHT_MODE: 'foundation', QUELLIGHT_DEPLOYMENT: 'local', HOST: '127.0.0.1', PORT: port, ORIGIN: origin });
  const child = spawn(process.execPath, ['scripts/start.mjs'], {
    cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  let output = '';
  let startupError;
  child.on('error', error => { startupError = error; });
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  try {
    let listening = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (startupError) throw startupError;
      if (child.exitCode !== null) throw new Error(`Owned server exited before its listener was verified: ${output}`);
      if (output.includes(`Listening on http://127.0.0.1:${port}`)) { listening = true; break; }
      await new Promise(yes => setTimeout(yes, 250));
    }
    assert.equal(listening, true, `Owned server did not report listening: ${output}`);
    const probes = await probePublicHttp((path, init) => fetch(origin + path, {
      ...init, redirect: 'manual', signal: AbortSignal.timeout(10_000)
    }), origin);
    assert.equal(child.exitCode, null, 'The owned server must remain alive throughout the checks.');
    for (const [overrides, expected] of [
      [{ QUELLIGHT_MODE: 'live' }, /QUELLIGHT_MODE must be foundation or personal/],
      [{ QUELLIGHT_MODE: 'personal' }, /Personal mode requires QUELLIGHT_DATABASE_URL/],
      [{ QUELLIGHT_DEPLOYMENT: 'hosted', ORIGIN: '' }, /Hosted deployment requires/],
      [{ PORT: '65536' }, /PORT must be an integer/]
    ]) {
      const rejected = spawnSync(process.execPath, ['scripts/start.mjs'], {
        cwd: root, env: { ...environment, ...overrides }, encoding: 'utf8', windowsHide: true, timeout: 30_000
      });
      if (rejected.error) throw rejected.error;
      assert.notEqual(rejected.status, 0, 'Invalid configuration must fail before starting a listener.');
      assert.match(rejected.stderr, expected);
      assert.doesNotMatch(rejected.stdout, /Listening on/);
    }
    console.log(JSON.stringify({ scope: 'actual-built-node-http', probes,
      configurationFailClosed: true, liveAuthentication: false, providerCalls: 0 }, null, 2));
  } catch (error) {
    // This child receives only the isolated fixture environment. Preserve its
    // diagnostics so a real route-import failure cannot look like a test mismatch.
    console.error(`Owned test server diagnostics:\n${output}`);
    throw error;
  } finally {
    if (child.exitCode === null && child.pid) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkNode();
