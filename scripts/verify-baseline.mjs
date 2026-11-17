import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
const baseline = JSON.parse(await readFile(new URL('baseline.json', root), 'utf8'));
const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function files(path, prefix = '') {
  const result = [];
  for (const entry of (await readdir(path, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    // npm may place a package's separately locked dependencies here. They are not
    // files shipped in the framework archive and retain their own lock identities.
    if (!prefix && entry.name === 'node_modules') continue;
    assert.equal(entry.isSymbolicLink(), false, 'Installed framework files must not be links.');
    if (entry.isDirectory()) result.push(...await files(join(path, entry.name), `${prefix}${entry.name}/`));
    else { assert.ok(entry.isFile()); result.push([`${prefix}${entry.name}`, sha(await readFile(join(path, entry.name)))]); }
  }
  return result;
}
const installedChecks = [];
for (const artifact of baseline.artifacts) {
  const bytes = await readFile(new URL(artifact.file, root));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== artifact.sha256) throw new Error(`Artifact digest mismatch: ${artifact.name}`);
  const installed = lock.packages[`node_modules/${artifact.name}`];
  if (installed?.version !== artifact.version || installed.integrity !== artifact.integrity) {
    throw new Error(`Lockfile does not bind the qualified artifact: ${artifact.name}`);
  }
  if (installed.resolved !== `file:${artifact.file}`) {
    throw new Error(`Unexpected package source: ${artifact.name}`);
  }
  if (process.argv.includes('--installed')) {
    const archive = fileURLToPath(new URL(artifact.file, root));
    const list = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8', windowsHide: true });
    assert.equal(list.status, 0);
    assert.ok(list.stdout.trim().split(/\r?\n/).every(path => path.startsWith('package/') && !path.includes('\\') && !path.split('/').includes('..')));
    const types = spawnSync('tar', ['-tvzf', archive], { encoding: 'utf8', windowsHide: true });
    assert.equal(types.status, 0); assert.ok(types.stdout.trim().split(/\r?\n/).every(line => /^[d-]/.test(line)));
    const unpack = fileURLToPath(new URL(`.local/baseline-unpack/${artifact.sha256}/`, root));
    await mkdir(unpack, { recursive: true });
    const extracted = spawnSync('tar', ['-xzf', archive, '-C', unpack], { encoding: 'utf8', windowsHide: true });
    assert.equal(extracted.status, 0);
    const actualFiles = await files(fileURLToPath(new URL(`node_modules/${artifact.name}/`, root)));
    assert.deepEqual(actualFiles, await files(join(unpack, 'package')), `Installed bytes differ from ${artifact.name} archive.`);
    installedChecks.push({ name: artifact.name, files: actualFiles.length, fileTreeSha256: sha(JSON.stringify(actualFiles)) });
  }
}
console.log(`Verified ${baseline.artifacts.length} archive digests and lockfile bindings.`);
if (installedChecks.length) {
  await writeFile(new URL('.local/baseline-installed.json', root), JSON.stringify({ at: new Date().toISOString(),
    lockSha256: sha(await readFile(new URL('package-lock.json', root))), installedChecks }, null, 2) + '\n');
  console.log(`Verified all installed files in ${installedChecks.length} framework packages against their archives.`);
}
