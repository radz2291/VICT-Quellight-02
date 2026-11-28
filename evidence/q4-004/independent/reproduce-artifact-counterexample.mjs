import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [evidence, destination] = process.argv.slice(2);
assert.ok(evidence && destination, 'Pass the evidence root and a new scratch directory');
const scratch = resolve(destination);
await mkdir(scratch);
for (const item of ['baseline', 'fixtures', 'replay.mjs']) {
  await cp(join(evidence, item), join(scratch, item), { recursive: true, errorOnExist: true, force: false });
}
const path = join(scratch, 'fixtures', 'acceptance-run.json');
const run = JSON.parse(await readFile(path, 'utf8'));
const retry = run.submissions.find(row => row.requestId === 'R2');
assert.equal(retry.cutVersion, 'v1');
retry.cutVersion = 'v2';
await writeFile(path, JSON.stringify(run, null, 2) + '\n');
const runner = join(scratch, 'replay.mjs');
const result = spawnSync(process.execPath, [runner], { encoding: 'utf8', shell: false });
assert.equal(result.status, 1);
assert.match(result.stderr, /The independent artifact check must support the label/);
assert.equal(result.stdout, '');
console.log(JSON.stringify({
  mutatedRecord: 'R2.cutVersion', original: 'v1', changed: 'v2',
  exitCode: result.status, rejectedBeforeResult: true,
  rejection: 'The independent artifact check must support the label',
  runnerSha256: createHash('sha256').update(await readFile(runner)).digest('hex'),
  node: process.version,
}, null, 2));
