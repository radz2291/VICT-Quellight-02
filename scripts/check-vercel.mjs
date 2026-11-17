import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixtureConversation, fixtureTurn, privateCanary, probeEnvironment } from './check-http.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = join(root, '.vercel/output');
const output = JSON.parse(await readFile(join(outputRoot, 'config.json'), 'utf8'));
assert.equal(output.version, 3);
const functionsRoot = await realpath(join(outputRoot, 'functions'));
const functionDirectories = [];
const aliases = [];
async function discoverFunctions(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await realpath(path);
      assert.ok(target.startsWith(functionsRoot + sep) && target.endsWith('.func'), 'A function route alias must stay inside the generated output.');
      aliases.push({ path, target });
    } else if (entry.isDirectory()) {
      if (entry.name.endsWith('.func')) functionDirectories.push(await realpath(path));
      else await discoverFunctions(path);
    }
  }
}
await discoverFunctions(functionsRoot);
assert.ok(functionDirectories.length >= 2, 'Ordinary requests and conversation/maintenance work must use separately configured groups.');
const bundles = new Map();
for (const functionRoot of functionDirectories) {
  const config = JSON.parse(await readFile(join(functionRoot, '.vc-config.json'), 'utf8'));
  assert.equal(config.runtime, 'nodejs22.x');
  assert.deepEqual(config.regions, ['sin1']);
  assert.ok([30, 300].includes(config.maxDuration), 'Only the configured platform budgets may be emitted.');
  assert.equal(config.experimentalResponseStreaming, true);
  assert.equal(config.framework.slug, 'sveltekit');
  const handlerPath = await realpath(resolve(functionRoot, config.handler));
  assert.ok(handlerPath.startsWith(functionRoot + sep), 'The generated handler must stay inside its function bundle.');
  bundles.set(functionRoot, { config, handlerUrl: pathToFileURL(handlerPath).href, bytes: 0 });
}
for (const alias of aliases) assert.ok(bundles.has(alias.target), 'Every route alias must resolve to an inspected function.');
assert.deepEqual([...new Set([...bundles.values()].map(value => value.config.maxDuration))].sort((a, b) => a - b), [30, 300]);

// The public SvelteKit adapter emits per-route .func symlinks and matching
// config destinations, plus a separate catchall when configurations differ.
// Follow that emitted routing rather than guessing internal group numbers.
async function bundleFor(pathname) {
  const path = pathname.split('?')[0];
  const route = output.routes.find(route => typeof route.src === 'string' && typeof route.dest === 'string' && new RegExp(route.src).test(path));
  assert.ok(route, `No generated route handles ${path}.`);
  assert.ok(!route.has && !route.missing && !route.dest.includes('?'), 'Unexpected conditional routing needs an explicit probe.');
  const destination = route.dest === '/' ? 'index' : route.dest.replace(/^\//, '');
  const target = await realpath(resolve(functionsRoot, `${destination}.func`));
  assert.ok(target.startsWith(functionsRoot + sep));
  const bundle = bundles.get(target);
  assert.ok(bundle, `Route ${path} must resolve to an inspected function.`);
  return bundle;
}
const probePaths = ['/', '/healthz', '/readyz', '/auth/sign-in', '/auth/setup', '/auth/sign-out', '/api/bootstrap', '/api/actions',
  `/api/conversations/${fixtureConversation}`, `/api/conversations/${fixtureConversation}/export`,
  `/api/conversations/${fixtureConversation}/turns`, `/api/conversations/${fixtureConversation}/memory`,
  '/api/memory/settings', '/api/memory/settings/preview', '/api/internal/memory/wake',
  `/api/turns/${fixtureTurn}/events`, `/api/turns/${fixtureTurn}/cancel`, '/missing-page'];
const hostWindowPaths = new Set(['/api/actions', '/api/internal/memory/wake', `/api/conversations/${fixtureConversation}/turns`]);
const handlers = {};
for (const path of probePaths) {
  const bundle = await bundleFor(path);
  assert.equal(bundle.config.maxDuration, hostWindowPaths.has(path) ? 300 : 30, `${path} must use its declared host configuration.`);
  handlers[path] = bundle.handlerUrl;
}

let files = 0;
let staticBytes = 0;
async function inspect(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Unexpected symlink inside a deployment payload: ${entry.name}`);
    if (entry.isDirectory()) { total += await inspect(path); continue; }
    assert.ok(!/^\.env(?:\.|$)/.test(basename(path)), 'Environment files must not be deployed.');
    assert.ok(!/\.(?:db|sqlite|sqlite3|pem|key|tgz)$/i.test(path), 'Unexpected database, key or source archive in deployment.');
    const bytes = await readFile(path);
    assert.ok(!bytes.includes(Buffer.from(privateCanary)), 'A private environment canary reached deployment output.');
    total += bytes.length;
    files++;
  }
  return total;
}
for (const [functionRoot, bundle] of bundles) {
  bundle.bytes = await inspect(functionRoot);
  assert.ok(bundle.bytes < 250 * 1024 * 1024, 'A Node function exceeds the standard uncompressed size.');
}
staticBytes = await inspect(join(outputRoot, 'static'));

const origin = 'https://quellight-fixture.vercel.app';
const environment = probeEnvironment({ VERCEL: '1', VERCEL_URL: 'quellight-fixture.vercel.app', QUELLIGHT_DEPLOYMENT: 'hosted', QUELLIGHT_MODE: 'foundation' });
const harnessUrl = new URL('./check-http.mjs', import.meta.url).href;
const probe = `
  import { probePublicHttp } from ${JSON.stringify(harnessUrl)};
  const routes = ${JSON.stringify(handlers)};
  const loaded = new Map();
  const invoke = async (path, init) => {
    const handlerUrl = routes[path.split('?')[0]];
    if (!handlerUrl) throw new Error('Unmapped generated route probe.');
    if (!loaded.has(handlerUrl)) loaded.set(handlerUrl, await import(handlerUrl));
    return loaded.get(handlerUrl).default.fetch(new Request(${JSON.stringify(origin)} + path, init));
  };
  const probes = await probePublicHttp(invoke, ${JSON.stringify(origin)});
  console.log(JSON.stringify({ probes, handlerGroupsExercised: loaded.size }));
`;
const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: root, env: environment, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
if (result.error) throw result.error;
assert.equal(result.status, 0, `Generated Vercel handlers failed: ${result.stderr}`);
const probeResult = JSON.parse(result.stdout.trim().split('\n').at(-1));
assert.equal(probeResult.handlerGroupsExercised, bundles.size, 'Each generated function group must receive a real request.');

for (const bundle of bundles.values()) {
  for (const [overrides, expected] of [
    [{ QUELLIGHT_MODE: 'live' }, /QUELLIGHT_MODE must be foundation or personal/],
    [{ QUELLIGHT_MODE: 'personal' }, /Personal mode requires QUELLIGHT_DATABASE_URL/],
    [{ QUELLIGHT_DEPLOYMENT: 'local' }, /Vercel requires hosted/],
    [{ VERCEL_URL: '' }, /Hosted deployment requires/]
  ]) {
    const rejected = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(bundle.handlerUrl)});`], {
      cwd: root, env: { ...environment, ...overrides }, encoding: 'utf8', windowsHide: true, timeout: 30_000
    });
    if (rejected.error) throw rejected.error;
    assert.notEqual(rejected.status, 0, 'Invalid deployment configuration must fail during each function initialization.');
    assert.match(rejected.stderr, expected);
  }
}
console.log(JSON.stringify({ scope: 'local-generated-vercel-artifact', functions: [...bundles].map(([path, bundle]) => ({
  path: relative(functionsRoot, path), runtime: bundle.config.runtime, region: bundle.config.regions[0],
  maxDurationSeconds: bundle.config.maxDuration, bytes: bundle.bytes
})), staticBytes, inspectedFiles: files, routeAliasesInspected: aliases.length, privateCanaryFound: false,
  probes: probeResult.probes, configurationFailClosed: true, liveAuthentication: false, providerCalls: 0, hostedDeployment: false }, null, 2));
