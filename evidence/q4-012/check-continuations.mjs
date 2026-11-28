import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { openFixture } from '../q4-009/fixture.mjs';
import { openRuntime } from '../q4-011/instrumentation.mjs';
import { arms, digest, sha } from '../q4-011/voices.mjs';
import { isolatedDatabase } from './isolation.mjs';

const [appPath, dsn, pgBin, priorDir, runDir, output] = process.argv.slice(2);
assert.ok(output, 'Usage: node check-continuations.mjs APP FIXTURE_DSN PG_BIN PRIOR_VOICES PRIVATE_RUN OUTPUT');
const app = resolve(appPath);
const { Client } = createRequire(join(app, 'package.json'))('pg');
const database = isolatedDatabase(Client, dsn, pgBin);
const read = async name => JSON.parse(await readFile(name, 'utf8'));
const session = await read(join(runDir, 'session.private.json'));
const voices = await read(join(priorDir, 'assembled-voices.private.json'));
assert.ok(session.complete && session.mode === 'live');
const checks = [];
for (const arm of arms) {
  const entry = session.practical[arm];
  const file = join(runDir, entry.archive);
  const raw = await read(join(runDir, 'approved-practical-' + arm + '.private.json'));
  assert.equal(raw.thread, entry.thread);
  assert.equal(entry.approval.revision, 'r1');
  await database.use(file, async () => {
    const fixture = await openFixture(app, dsn, runDir);
    const rt = await openRuntime(app, runDir, 'reopen-' + arm, voices.current, voices[arm]);
    try {
      const { createConversationService } = await rt.load('conversation/service');
      const service = createConversationService({ openDatabase: () => fixture.open(),
        readCredential: async () => { throw new Error('Reopen must not read a credential'); } });
      const detail = await service.detail(session.story.owner, entry.thread);
      assert.equal(detail.activeTurn, null);
      assert.equal(detail.lastTurn.status, 'completed');
      assert.equal(detail.lastTurn.projectionSettled, true);
      assert.ok(detail.messages.some(message => message.role === 'assistant' && message.text === raw.reply));
      const sources = await fixture.sourcePage(rt, session.story, entry.approval.sourceThread);
      assert.ok(sources.sources.some(source => source.id === entry.approval.sourceId && !source.excluded));
      assert.equal(sources.authorityRevision, entry.approval.authority);
      const archived = await fixture.one('SELECT revision,block FROM q4_009_room.approvals WHERE actor_id=$1 AND room_id=$2 AND authority=$3',
        [session.story.owner.actorId, session.story.roomId, sources.authorityRevision]);
      assert.ok(archived.revision === entry.approval.revision && archived.block === entry.approval.block);
    } finally {
      await rt.close();
      await fixture.close();
    }
  });
  checks.push({ arm, separateArchiveSha256: sha(await readFile(file)),
    stateReopened: true, retainedApproval: true });
}
assert.equal(new Set(checks.map(check => check.separateArchiveSha256)).size, arms.length);
const report = { schema: 'quellight.q4-012.continuation-verification@1', result: 'passed',
  providerRequests: 0, isolatedRestores: checks.length, checked: checks, auditSha256: digest(checks) };
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log('Reopened three saved conversations through the installed service.');
