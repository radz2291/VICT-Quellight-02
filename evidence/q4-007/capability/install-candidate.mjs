import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [donorArg, consumerArg, archivesArg, npmArg, victSha, memorySha] = process.argv.slice(2);
assert.ok(donorArg && consumerArg && archivesArg && npmArg && /^[0-9a-f]{64}$/.test(victSha ?? '') && /^[0-9a-f]{64}$/.test(memorySha ?? ''),
  'Usage: node --experimental-import-meta-resolve install-candidate.mjs DONOR NEW_CONSUMER ARCHIVES NPM_CLI VICT_SHA256 MEMORY_SHA256');
assert.equal(process.platform, 'win32', 'This disposable install composition uses Windows junctions.');
assert.equal(process.version, 'v22.23.5');
const appSha = '14b6ccaf6f409eac3e041dc3d9abd0bb9f875344';
const canonicalLockSha = '31b606ed8bdffa497bd4621f87877900ed3767f2f0ee0a5681f384e75d75e225';
const donor = realpathSync(donorArg);
const consumer = resolve(consumerArg);
const archives = realpathSync(archivesArg);
const npm = realpathSync(npmArg);
const { list: listTar, extract: extractTar } = createRequire(npm)('tar');
const git = (args, encoding = 'utf8') => execFileSync('git', ['-C', donor, ...args], { encoding, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
const sha = (algorithm, bytes, encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const saveJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const relativeToDonor = relative(donor, consumer);
const relativeToConsumer = relative(consumer, donor);
const outside = value => isAbsolute(value) || value.split(/[\\/]/)[0] === '..';
assert.ok(outside(relativeToDonor) && outside(relativeToConsumer), 'Keep the fresh consumer outside the dependency donor.');
assert.equal(git(['rev-parse', 'HEAD']).trim(), appSha);
assert.equal(git(['status', '--porcelain']).trim(), '', 'The donor app source must be clean at the pin.');
assert.equal(execFileSync(process.execPath, [npm, '--version'], { encoding: 'utf8', windowsHide: true }).trim(), '11.21.2');
assert.ok(!existsSync(consumer), 'Pass a fresh consumer path.');
const officialLock = git(['show', 'HEAD:package-lock.json'], null);
assert.equal(sha('sha256', officialLock), canonicalLockSha);

const candidates = [
  { name: '@victframework/mastra', version: '0.4.0-rc.1-q4-007.1',
    archiveName: 'victframework-mastra-0.4.0-rc.1-q4-007.1.tgz', sha256: victSha },
  { name: '@mastra/memory', version: '1.28.2-q4-007.1',
    archiveName: 'mastra-memory-1.28.2-q4-007.1.tgz', sha256: memorySha },
];
for (const entry of candidates) {
  entry.archive = join(archives, entry.archiveName);
  const bytes = readFileSync(entry.archive);
  assert.equal(sha('sha256', bytes), entry.sha256, entry.name);
  entry.file = `packs/${entry.archiveName}`;
  entry.integrity = 'sha512-' + sha('sha512', bytes, 'base64');
}

// Reuse npm's tar reader to verify file kinds, names and content without a second disk copy.
async function archiveFiles(archive) {
  const files = new Map();
  let invalid;
  await listTar({ file: archive, strict: true, onReadEntry(entry) {
    const path = entry.path.replace(/\/$/, '');
    if (!['File', 'Directory'].includes(entry.type) ||
        (path !== 'package' && (!path.startsWith('package/') || !/^package\/[a-zA-Z0-9_.@+!$%,()\[\]~ \-/]+$/.test(path))) ||
        path.split('/').some(part => !part || part === '.' || part === '..' || part.endsWith('.') || part.endsWith(' '))) {
      invalid ??= `${entry.type} ${entry.path}`;
    } else if (entry.type === 'File') {
      const name = path.slice('package/'.length);
      if (!name || files.has(name) || name === 'node_modules' || name.startsWith('node_modules/')) invalid ??= `unexpected file ${name}`;
      const hash = createHash('sha256');
      files.set(name, hash);
      entry.on('data', chunk => hash.update(chunk));
    }
    entry.resume();
  } });
  assert.equal(invalid, undefined, `Refused unsafe archive entry in ${archive}: ${invalid}`);
  assert.ok(files.has('package.json'), `Archive has no package manifest: ${archive}`);
  return Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, hash]) => [name, hash.digest('hex')]));
}

function packageFiles(root, prefix = '') {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!prefix && entry.name === 'node_modules') continue;
    const path = join(root, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Package file cannot be a link: ${path}`);
    const key = prefix + entry.name;
    if (entry.isDirectory()) files.push(...packageFiles(path, key + '/'));
    else {
      assert.ok(entry.isFile(), path);
      files.push([key, sha('sha256', readFileSync(path))]);
    }
  }
  return files;
}

const packageTrees = [];
async function checkPackage(name, archive, slot) {
  const expected = await archiveFiles(archive);
  const observed = Object.fromEntries(packageFiles(slot).sort(([a], [b]) => a.localeCompare(b)));
  assert.deepEqual(observed, expected, `Installed tree differs from ${name} archive`);
  packageTrees.push({ name, files: Object.keys(observed).length, fileTreeSha256: sha('sha256', JSON.stringify(observed)) });
}

for (const entry of candidates) await archiveFiles(entry.archive);
execFileSync('git', ['clone', '--shared', '--quiet', '--no-checkout', donor, consumer], { windowsHide: true });
execFileSync('git', ['-C', consumer, '-c', 'core.autocrlf=false', 'checkout', '--quiet', '--detach', appSha], { windowsHide: true });
const manifestPath = join(consumer, 'package.json');
const lockPath = join(consumer, 'package-lock.json');
const baselinePath = join(consumer, 'baseline.json');
const manifest = json(manifestPath);
const originalLock = json(lockPath);
assert.deepEqual(originalLock, JSON.parse(officialLock));
const baseline = json(baselinePath);
for (const entry of candidates) {
  copyFileSync(entry.archive, join(consumer, entry.file));
  manifest.dependencies[entry.name] = `file:${entry.file}`;
  const pinned = baseline.artifacts.find(old => old.name === entry.name);
  if (pinned) Object.assign(pinned, { file: entry.file, version: entry.version, sha256: entry.sha256, integrity: entry.integrity });
}
manifest.dependencies = Object.fromEntries(Object.entries(manifest.dependencies).sort(([a], [b]) => a.localeCompare(b)));
baseline.researchCandidate = { ticket: 'Q4-007', appSha, candidates: candidates.map(({ archive, archiveName, ...entry }) => entry) };
saveJson(manifestPath, manifest);
saveJson(baselinePath, baseline);

// npm resolves the candidate file dependencies against the pinned registry graph before the donor is linked.
const lockStep = spawnSync(process.execPath, [npm, 'install', '--package-lock-only', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'],
  { cwd: consumer, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
assert.equal(lockStep.status, 0, lockStep.stderr || lockStep.error?.message);
assert.ok(!existsSync(join(consumer, 'node_modules')), 'Lock-only resolver unexpectedly installed a graph.');
const lock = json(lockPath);
const changedSlots = new Set(candidates.map(entry => `node_modules/${entry.name}`));
assert.deepEqual(Object.keys(lock.packages).sort(), Object.keys(originalLock.packages).sort(), 'Unexpected graph slot change.');
for (const [slot, value] of Object.entries(originalLock.packages)) {
  if (slot && !changedSlots.has(slot)) assert.deepEqual(lock.packages[slot], value, `Unrelated lock drift at ${slot}`);
}
assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
for (const entry of candidates) {
  const record = lock.packages[`node_modules/${entry.name}`];
  assert.equal(record.version, entry.version, entry.name);
  assert.equal(record.resolved, `file:${entry.file}`, entry.name);
  assert.equal(record.integrity, entry.integrity, entry.name);
}
assert.equal(lock.packages['node_modules/@victframework/mastra'].dependencies?.['@mastra/memory'], candidates[1].version);

const donorModules = join(donor, 'node_modules');
const modules = join(consumer, 'node_modules');
mkdirSync(modules);
const shared = [];
const link = (from, to) => {
  assert.ok(lstatSync(to).isDirectory(), `Refused non-directory package donor entry: ${to}`);
  symlinkSync(to, from, 'junction');
  shared.push(relative(modules, from).replaceAll('\\', '/'));
};
for (const entry of readdirSync(donorModules, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
  const from = join(modules, entry.name);
  const to = join(donorModules, entry.name);
  if (!candidates.some(pkg => pkg.name.startsWith(entry.name + '/'))) {
    link(from, to);
    continue;
  }
  mkdirSync(from);
  for (const child of readdirSync(to, { withFileTypes: true })) {
    if (!candidates.some(pkg => pkg.name === `${entry.name}/${child.name}`) && child.isDirectory()) {
      link(join(from, child.name), join(to, child.name));
    }
  }
}
for (const entry of candidates) {
  const slot = join(modules, entry.name);
  mkdirSync(slot);
  await extractTar({ file: join(consumer, entry.file), cwd: slot, strip: 1, strict: true });
  const installed = json(join(slot, 'package.json'));
  assert.equal(installed.name, entry.name);
  assert.equal(installed.version, entry.version);
  if (entry.name === '@victframework/mastra') assert.equal(installed.dependencies['@mastra/memory'], candidates[1].version);
  await checkPackage(entry.name, join(consumer, entry.file), slot);
  const nested = join(donorModules, entry.name, 'node_modules');
  if (existsSync(nested)) link(join(slot, 'node_modules'), nested);
}

const allBound = baseline.artifacts.filter(entry => !candidates.some(pkg => pkg.name === entry.name));
for (const entry of allBound) {
  const archive = join(consumer, entry.file);
  assert.equal(sha('sha256', readFileSync(archive)), entry.sha256, entry.name);
  await checkPackage(entry.name, archive, join(modules, entry.name));
}

const packageUrl = pathToFileURL(manifestPath).href;
const victimEntry = import.meta.resolve('@victframework/mastra', packageUrl);
const memoryEntry = import.meta.resolve('@mastra/memory', victimEntry);
const asPath = url => fileURLToPath(url).replaceAll('\\', '/');
assert.ok(asPath(victimEntry).startsWith(join(modules, '@victframework/mastra').replaceAll('\\', '/') + '/'));
assert.ok(asPath(memoryEntry).startsWith(join(modules, '@mastra/memory').replaceAll('\\', '/') + '/'));
const adapter = await import(victimEntry);
assert.equal(typeof adapter.MastraMemoryService, 'function');
const memory = await import(memoryEntry);
assert.equal(typeof memory.Memory, 'function');
const receipt = { schema: 'quellight.q4-007.candidate-install@1', appSha, canonicalLockSha,
  candidateLockSha256: sha('sha256', readFileSync(lockPath)), node: process.version, npm: '11.21.2',
  scope: 'fresh pinned app source, real npm offline lock, two tar-installed candidate slots, linked unchanged installed closure',
  consumer, donor, candidateSlots: candidates, packageTrees, sharedSlots: shared.length,
  adapterRoute: relative(consumer, asPath(victimEntry)), adapterMemoryRoute: relative(consumer, asPath(memoryEntry)) };
saveJson(join(consumer, 'candidate-install.json'), receipt);
console.log(JSON.stringify(receipt, null, 2));
