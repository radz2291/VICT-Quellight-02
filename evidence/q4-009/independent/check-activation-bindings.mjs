import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [app, dsn, capturePath] = process.argv.slice(2);
assert.ok(app && dsn && capturePath, 'Pass pinned app, loopback fixture DSN and finished short capture');
const database = new URL(dsn);
assert.match(database.protocol, /^postgres(?:ql)?:$/);
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.username, 'q4_fixture');
assert.match(database.pathname, /^\/q4_009_[a-z][a-z0-9]*$/);
assert.ok(database.port && !database.password && !database.search && !database.hash);
database.username = 'ql_q9_fixture_writer';
const requireApp = createRequire(join(resolve(app), 'package.json'));
const { createIndexedPostgresStores } = await import(pathToFileURL(requireApp.resolve('@victframework/store-postgres')).href);
const bytes = await readFile(capturePath);
const capture = JSON.parse(bytes);
assert.equal(capture.status, 'passed');
const sha = input => createHash('sha256').update(input).digest('hex');

const stores = await createIndexedPostgresStores({ schema: 'quellight_ops_v1', namespace: 'quellight-v1', writerEpoch: 1,
  connectionString: database.href, tls: 'disable-loopback-only', maxConnections: 1 });
try {
  const rows = capture.rows.filter(row => row.scenario === 'short');
  assert.equal(rows.length, 22);
  const bindings = [];
  for (const row of rows) {
    const activation = await stores.governance.getAgentActivation(row.admitted.activation_version);
    assert.equal(activation.recordSchema, 'vict.agent-activation-record@1');
    assert.equal(activation.activationVersion, row.admitted.activation_version);
    assert.equal(activation.agentId, 'quellight.conversation');
    const instructions = activation.artifacts.filter(item => item.kind === 'instructions');
    assert.equal(instructions.length, 1);
    const [artifact] = instructions;
    assert.equal(artifact.id, 'quellight.conversation.desk-context');
    const [system] = row.prompt.syntheticMessages;
    assert.equal(system.role, 'system');
    assert.equal(typeof system.content, 'string');
    const revision = sha(JSON.stringify({ id: artifact.id, text: system.content }));
    assert.equal(artifact.revision, revision);
    bindings.push({ arm: row.arm, caseId: row.caseId, turnId: row.turnId, activation: activation.activationVersion,
      instructionsRevision: revision, firstSystemSha256: sha(system.content) });
  }
  console.log(JSON.stringify({ captureSha256: sha(bytes), bindings }, null, 2));
} finally {
  await stores.close();
}
