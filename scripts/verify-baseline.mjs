import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const baseline = JSON.parse(await readFile(new URL('baseline.json', root), 'utf8'));
const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
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
}
console.log(`Verified ${baseline.artifacts.length} archive digests and lockfile bindings.`);
