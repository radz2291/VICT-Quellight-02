import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const arms = ['current', 'legacy', 'eight'];
export const movements = ['soul', 'root', 'tradition', 'moment', 'knowing', 'bond', 'boundary', 'tendencies'];
export const catalogPath = 'src/lib/server/prompts/conversation.json';
export const sha = input => createHash('sha256').update(input).digest('hex');
export const digest = value => sha(JSON.stringify(value));
export const canonLf = value => value.replace(/\r\n?/g, '\n');
const decode = bytes => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
const tar = (zip, entry) => execFileSync('tar', ['-xOf', zip, entry], { maxBuffer: 1 << 20 });
const git = (path, ...args) => execFileSync('git', ['-C', path, ...args], { maxBuffer: 1 << 20 });
const head = root => git(root, 'rev-parse', 'HEAD').toString().trim();

function metadata(bytes) {
  return { sha256: sha(bytes), bytes: Buffer.byteLength(bytes) };
}

async function concordance(archive, root, rel, label) {
  const committed = git(root, 'show', 'HEAD:' + rel);
  const checkout = await readFile(join(root, rel));
  const archiveCode = canonLf(decode(archive));
  assert.ok(canonLf(decode(committed)) === archiveCode, label + ' archive differs from committed source');
  assert.ok(canonLf(decode(checkout)) === archiveCode, label + ' archive differs from working checkout');
  return { archive: metadata(archive), committed: metadata(committed), checkout: metadata(checkout),
    exactArchiveToCommit: archive.equals(committed), exactArchiveToCheckout: archive.equals(checkout) };
}

function editorialBody(raw) {
  const lines = raw.split('\n');
  const delimiter = lines.findIndex(line => line.trim() === '---');
  return { delimiterLine: delimiter < 0 ? null : delimiter + 1,
    text: (delimiter < 0 ? raw : lines.slice(delimiter + 1).join('\n')).trim() };
}

export async function loadVoices({ app, original, ara, quellightArchive, araArchive, privateDir }) {
  const bounds = { original: head(original), ara: head(ara) };
  const historical = {};
  const root = join(privateDir, 'archive-runtime');
  const runner = join(root, 'src', 'mastra', 'agents');
  await mkdir(runner, { recursive: true });
  await mkdir(join(root, 'persona'), { recursive: true });

  const files = [...movements, 'legacy-soul'];
  for (const name of files) {
    const rel = 'persona/' + name + '.md';
    const entry = '01-' + rel;
    const raw = tar(quellightArchive, entry);
    const body = editorialBody(decode(raw));
    assert.ok(body.text.length > 0, entry + ' has no authored body');
    await writeFile(join(root, rel), raw);
    historical[name] = { entry, checkoutPath: rel, ...await concordance(raw, original, rel, entry),
      delimiterLine: body.delimiterLine, body: metadata(body.text), text: body.text };
  }

  const assemblerEntry = '04-implementation/agents/persona.ts';
  const pathsEntry = '04-implementation/paths.ts';
  const assembler = tar(quellightArchive, assemblerEntry), paths = tar(quellightArchive, pathsEntry);
  const assemblerSource = decode(assembler);
  const oldImport = "from '../paths'";
  assert.equal(assemblerSource.split(oldImport).length, 2);
  const assemblerConcordance = await concordance(assembler, original, 'src/mastra/agents/persona.ts', 'assembler');
  const pathsConcordance = await concordance(paths, original, 'src/mastra/paths.ts', 'paths');
  await writeFile(join(runner, 'persona.ts'), assemblerSource.replace(oldImport, "from '../paths.ts'"));
  await writeFile(join(runner, '..', 'paths.ts'), paths);
  await writeFile(join(root, 'package.json'), '{"type":"module"}\n');
  const executor = await import(pathToFileURL(join(runner, 'persona.ts')).href);
  assert.deepEqual(executor.personaFileList(), movements.map(name => 'persona/' + name + '.md'));
  const previous = process.env.QUELLIGHT_LEGACY_SOUL;
  let legacy, eight;
  try {
    delete process.env.QUELLIGHT_LEGACY_SOUL;
    eight = executor.buildInstructions();
    process.env.QUELLIGHT_LEGACY_SOUL = '1';
    legacy = executor.buildInstructions();
  } finally {
    if (previous === undefined) delete process.env.QUELLIGHT_LEGACY_SOUL;
    else process.env.QUELLIGHT_LEGACY_SOUL = previous;
  }
  assert.ok(eight === movements.map(name => historical[name].text).join('\n\n'), 'Archive and independent movement assembly differ');
  assert.ok(legacy === historical['legacy-soul'].text, 'Archive legacy body differs');
  for (const name of files) {
    const body = historical[name].text;
    assert.ok(!body.includes('01-persona/') && !/^---\s*$/m.test(body), 'Editorial path or separator in assembled body: ' + name);
    assert.ok(!/\{\{[^{}]*\}\}/.test(body), 'Archive body contains catalog syntax: ' + name);
  }
  for (const assembled of [legacy, eight]) {
    assert.ok(canonLf(assembled) === assembled, 'Archive has non-LF body requiring explicit adaptation');
  }
  const araEntry = '01-prompts-config-defaults/prompt.persona.default.md';
  const araRel = 'config/defaults/prompt.persona.default.md';
  const araDefault = tar(araArchive, araEntry);
  const araSource = await concordance(araDefault, ara, araRel, araEntry);
  assert.ok(araDefault.equals(await readFile(join(root, 'persona', 'legacy-soul.md'))),
    'ARA archive default is not the frozen legacy byte sequence');

  const rawCatalog = await readFile(join(app, catalogPath));
  const committedCatalog = git(app, 'show', 'HEAD:' + catalogPath);
  assert.ok(canonLf(decode(rawCatalog)) === canonLf(decode(committedCatalog)), 'App catalog differs from pinned Git blob');
  const catalog = JSON.parse(rawCatalog);
  assert.ok(Array.isArray(catalog.template) && catalog.template.length > 1);
  const [current, ...operating] = catalog.template;
  assert.ok(current && !current.includes('\n'));
  const voices = { current, legacy, eight };
  assert.equal(new Set(Object.values(voices)).size, arms.length);
  const pins = {
    schema: 'quellight.q4-011.sources@1',
    app: { commit: head(app), path: catalogPath, catalog: metadata(committedCatalog), checkoutCatalog: metadata(rawCatalog), voiceElement: 0,
      retainedCatalogElements: operating.length, retainedCatalogDigest: digest(operating) },
    original: { commit: bounds.original, archive: metadata(await readFile(quellightArchive)),
      assembler: { entry: assemblerEntry, ...assemblerConcordance },
      paths: { entry: pathsEntry, ...pathsConcordance },
      order: movements, independentAssemblerMatch: true,
      files: Object.fromEntries(files.map(name => {
        const { text, ...record } = historical[name];
        return [name, record];
      })) },
    ara: { commit: bounds.ara, archive: metadata(await readFile(araArchive)), source: { entry: araEntry, ...araSource },
      byteIdenticalToFrozenArchive: true },
    voices: Object.fromEntries(arms.map(arm => [arm, metadata(voices[arm])])),
  };
  return { voices, pins };
}
