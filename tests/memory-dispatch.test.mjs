import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';
let server, authorize;
before(async () => {
  server = await createServer({ configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  ({ authorizeMemoryWake: authorize } = await server.ssrLoadModule('/src/lib/server/memory/dispatch-auth.ts'));
});
after(async () => server?.close());
test('worker wake accepts only the dedicated machine credential and empty fixed request', async () => {
  const secret = 'synthetic-machine-credential-that-is-not-live';
  const request = (body = '{}', headers = {}, method = 'POST') => new Request('https://quellight.example/api/internal/memory/work', {
    method, headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json', ...headers }, ...(method === 'POST' ? { body } : {})
  });
  assert.equal(await authorize(request(), secret), true);
  for (const invalid of [request('{}', { authorization: '' }), request('{}', { authorization: 'Bearer wrong' }),
    request('{}', { origin: 'https://quellight.example' }), request('{}', {}, 'GET'), request('{"actorId":"someone"}'),
    request('{}', { 'content-type': 'text/plain' }), request(''), request('{} ')]) assert.equal(await authorize(invalid, secret), false);
  assert.equal(await authorize(request(), undefined), false);
});
