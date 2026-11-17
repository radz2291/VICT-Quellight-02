// Engineering-only adoption: preserve old archives and require exact passing installed evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = key => { const index = process.argv.indexOf(key); assert.ok(index > 0 && process.argv[index + 1]); return resolve(process.argv[index + 1]); };
const manifestPath = arg('--manifest'), proofPath = arg('--proof');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes), proof = await json(proofPath);
assert.equal(proof.status, 'passed'); assert.equal(proof.sourceManifestSha256, hash(manifestBytes));
assert.equal(proof.lockSha256, hash(await readFile(join(dirname(proofPath), 'package-lock.json'))));
const baseline = await json(join(app, 'baseline.json')), pkg = await json(join(app, 'package.json'));
const previousLock = await json(join(app, 'package-lock.json'));
const replaced = new Set(['@victframework/runtime', '@victframework/mastra']);
for (const source of manifest.artifacts) {
  const current = baseline.artifacts.find(item => item.name === source.name);
  assert.ok(current, `Unknown candidate artifact ${source.name}`);
  const path = resolve(dirname(manifestPath), source.file), bytes = await readFile(path);
  assert.equal(hash(bytes), source.sha256);
  if (!replaced.has(source.name)) { assert.equal(current.sha256, source.sha256); continue; }
  const file = `packs/${source.name.split('/')[1]}-${source.version}-memory-${source.sha256.slice(0, 12)}.tgz`;
  const target = join(app, file);
  try { await access(target); assert.equal(hash(await readFile(target)), source.sha256); }
  catch (error) { if (error.code !== 'ENOENT') throw error; await copyFile(path, target); }
  Object.assign(current, { file, sha256: source.sha256, version: source.version, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` });
  pkg.dependencies[source.name] = `file:${file}`;
}
assert.ok([...replaced].every(name => manifest.artifacts.some(item => item.name === name)));
const metadata = { sourceCommit: manifest.sourceCommit, manifestSha256: hash(manifestBytes),
  installedProofRun: proof.runId ?? proof.run, installedProofLockSha256: proof.lockSha256 };
baseline.status = 'phase-2-local-candidate'; baseline.source.memory = metadata;
await writeFile(join(app, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
const npm = resolve(app, '../../261116-VICT-Vercel/.hosted-local/tools/npm-11.21.2/package/bin/npm-cli.js');
const result = spawnSync(process.execPath, [npm, 'install', '--package-lock-only', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'],
  { cwd: app, encoding: 'utf8', windowsHide: true, env: { ...process.env, PATH: `${dirname(process.execPath)};${process.env.PATH}` } });
assert.equal(result.status, 0, `Locked adoption failed: ${result.stderr}`);
const nextLock = await json(join(app, 'package-lock.json'));
for (const [name, value] of Object.entries(previousLock.packages)) {
  if (!name || [...replaced].some(id => name === `node_modules/${id}`)) continue;
  assert.ok(nextLock.packages[name], `Unexpected dependency removal ${name}`);
  for (const field of ['version', 'integrity', 'resolved']) assert.equal(nextLock.packages[name][field], value[field], `Unexpected dependency change ${name}:${field}`);
}
await writeFile(join(app, 'baseline.json'), JSON.stringify(baseline, null, 2) + '\n');
console.log(JSON.stringify({ status: 'locked-candidate', ...metadata, appLockSha256: hash(await readFile(join(app, 'package-lock.json'))),
  next: 'Install exact lock, verify baseline, run integrated consumer checks and hosted proof.' }));
