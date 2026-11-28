import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const [archivePath, consumerPath, expectedSha256, baselineNativePath] = process.argv.slice(2);
assert.ok(archivePath && consumerPath && expectedSha256,
  'Pass the candidate .tgz, isolated consumer and pinned SHA-256');
const archive = resolve(archivePath);
const fromConsumer = createRequire(join(resolve(consumerPath), 'package.json'));
const tar = (...args) => execFileSync('tar', args, { windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
const shipped = JSON.parse(tar('-xOf', archive, 'package/package.json').toString('utf8'));
assert.ok(['@victframework/mastra', '@mastra/memory'].includes(shipped.name));
const resolver = shipped.name === '@mastra/memory'
  ? createRequire(fromConsumer.resolve('@victframework/mastra')) : fromConsumer;
const root = dirname(dirname(resolver.resolve(shipped.name)));
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
assert.deepEqual(manifest, shipped);
const hash = data => createHash('sha256').update(data).digest('hex');
const archiveSha256 = hash(await readFile(archive));
assert.equal(archiveSha256, expectedSha256.toLowerCase());
const members = tar('-tf', archive).toString('utf8').split(/\r?\n/)
  .filter(line => line && !line.endsWith('/')).map(line => {
    assert.ok(line.startsWith('package/'));
    const relative = line.slice('package/'.length);
    assert.ok(relative.split('/').every(part => part && part !== '.' && part !== '..'));
    return relative;
  }).sort();
async function packageFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const relative = prefix + entry.name;
    if (entry.isDirectory()) paths.push(...await packageFiles(join(directory, entry.name), relative + '/'));
    else {
      assert.equal(entry.isFile(), true, relative);
      paths.push(relative);
    }
  }
  return paths;
}
assert.deepEqual((await packageFiles(root)).sort(), members);
const tree = [];
for (const member of members) {
  const archiveBytes = tar('-xOf', archive, 'package/' + member);
  const checked = await readFile(join(root, ...member.split('/')));
  assert.ok(archiveBytes.equals(checked), member);
  tree.push([member, hash(checked)]);
}
let nativeEntryPoints;
if (baselineNativePath) {
  assert.equal(shipped.name, '@mastra/memory');
  const esm = 'package/dist/src-BYrxAUzs.js';
  const commonJs = ['package/dist/index.cjs', 'package/dist/src-Bewti2w5.cjs'];
  const baselineWorker = tar('-xOf', resolve(baselineNativePath), esm);
  const candidateWorker = tar('-xOf', archive, esm);
  assert.ok(!candidateWorker.equals(baselineWorker));
  assert.match(candidateWorker.toString('utf8'), /vict\.mastra\.observation-publication-proof@1/);
  for (const entry of commonJs) assert.ok(tar('-xOf', archive, entry).equals(tar('-xOf', resolve(baselineNativePath), entry)));
  nativeEntryPoints = { esmWorkerSha256: hash(candidateWorker), baselineEsmWorkerSha256: hash(baselineWorker),
    commonJsEntriesUnchanged: commonJs.map(entry => entry.slice('package/'.length)) };
}
console.log(JSON.stringify({
  package: manifest.name, version: manifest.version, node: process.version,
  archiveSha256, filesMatchedExactly: tree.length, treeSha256: hash(JSON.stringify(tree)), nativeEntryPoints,
}, null, 2));
