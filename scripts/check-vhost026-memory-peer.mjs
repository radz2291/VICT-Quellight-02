import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIndexedPostgresStores } from '@victframework/store-postgres';
import { createServer } from 'vite';

process.once('message', async ({ job, database, deadline }) => {
  assert.equal(new URL(database.connectionString).hostname, '127.0.0.1');
  assert.equal(database.tls, 'disable-loopback-only');
  const modules = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)),
    cacheDir: await mkdtemp(join(tmpdir(), 'quellight-vhost026-peer-')), configFile: false,
    logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true } });
  const stores = await createIndexedPostgresStores(database);
  try {
    const { createMemoryJobProcessor } = await modules.ssrLoadModule('/src/lib/server/memory/worker.ts');
    const hold = () => {
      process.send?.({ status: 'inference' });
      return new Promise(() => {});
    };
    const processor = createMemoryJobProcessor({ modelFactory: async () => () => ({
      specificationVersion: 'v2', provider: 'synthetic', modelId: 'terminated-host', supportedUrls: {},
      doGenerate: hold, doStream: hold,
    }) });
    const outcome = await processor(job, stores, new Date(deadline));
    process.send?.({ status: 'early-exit', outcome });
  } finally {
    await stores.close();
    await modules.close();
    if (process.connected) process.disconnect();
  }
});
