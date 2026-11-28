import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [appPath, capturePath, dsn, cachePath] = process.argv.slice(2);
assert.ok(appPath && capturePath && dsn && cachePath, 'Pass the installed app, capture, reader DSN and scratch cache directory');
const app = resolve(appPath);
const url = new URL(dsn);
assert.match(url.protocol, /^postgres(?:ql)?:$/);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.username, 'ql_q5_fixture_reader');
assert.match(url.pathname, /^\/q4_005_[a-z0-9]+$/);
assert.ok(url.port && !url.password && !url.search && !url.hash);
const capture = JSON.parse(await readFile(capturePath, 'utf8'));
assert.equal(capture.status, 'passed');
assert.equal(capture.appSha, execFileSync('git', ['-C', app, 'rev-parse', 'HEAD'], {
  encoding: 'utf8', windowsHide: true,
}).trim());
const { actorId, roomId, foreignRoomId, threads } = capture.scope;
const owner = { id: actorId, actorId, email: 'beacon@fixture.invalid' };
const fromApp = createRequire(join(app, 'package.json'));
const use = name => import(pathToFileURL(fromApp.resolve(name)).href);
const { createIndexedPostgresStores } = await use('@victframework/store-postgres');
const { createServer } = await use('vite');
const stores = await createIndexedPostgresStores({
  connectionString: url.href, schema: 'quellight_ops_v1', namespace: 'quellight-v1',
  writerEpoch: 1, tls: 'disable-loopback-only', maxConnections: 2,
});
let vite, memory, oldMemory;
try {
  vite = await createServer({ root: app, configFile: false, logLevel: 'error', cacheDir: resolve(cachePath),
    server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  const load = name => vite.ssrLoadModule('/src/lib/server/' + name + '.ts');
  const { getConversation } = await load('domain/queries');
  const { loadEffectiveMemorySettings } = await load('memory/settings');
  const { openQuellightMemory } = await load('memory/native');
  const { memorySourcePage } = await load('memory/inspection-views');
  const conversation = Object.fromEntries(await Promise.all(Object.entries(threads).map(async ([label, id]) =>
    [label, await getConversation(stores, owner, id)])));
  assert.equal(conversation.A.roomId, roomId);
  assert.equal(conversation.B.roomId, roomId);
  assert.equal(conversation.C.roomId, foreignRoomId);
  const effective = await loadEffectiveMemorySettings(stores.coordination.pool, actorId, roomId);
  memory = await openQuellightMemory({ stores, ownerActorId: actorId, conversationId: threads.B, effective });
  oldMemory = await openQuellightMemory({ stores, ownerActorId: actorId, conversationId: threads.A, effective });
  const correction = capture.settlements.find(row => row.caseId === 'correction');
  const old = capture.settlements.find(row => row.caseId === 'original');
  const expected = capture.reads.after.find(row => row.caseId === 'correction').accepted[0];
  assert.equal(correction.conversationId, threads.B);
  const latest = await memory.service.operation(threads.B, correction.operationId);
  await assert.rejects(memory.service.operation(threads.C, correction.operationId),
    { code: 'VICT_MEMORY_OPERATION_CONFLICT' });
  const historical = await oldMemory.service.operation(threads.A, old.operationId);
  const authority = await memory.service.authority(threads.B);
  assert.equal(authority.revision, expected.authorityRevision);
  assert.ok(authority.excludedMessageIds.includes(capture.care.excludedId));
  assert.equal(latest.status, 'completed');
  assert.equal(latest.authority_revision, authority.revision);
  assert.equal(latest.events.filter(event => event.name === 'published').length, 1);
  assert.equal(historical.status, 'superseded');
  assert.equal(historical.result, null);
  assert.equal(historical.checkpoint, null);
  assert.equal(historical.events.filter(event => event.name === 'published').length, 1);
  const page = await memorySourcePage(stores, owner, threads.B);
  assert.equal(page.authorityRevision, authority.revision);
  const exact = page.sources.find(row => row.id === expected.sourceId);
  assert.ok(exact && !exact.excluded);
  assert.equal(exact.conversationId, threads.B);
  assert.equal(exact.role, 'user');
  assert.equal(exact.text.slice(expected.span.start, expected.span.end), expected.span.text);
  assert.ok(!page.sources.some(row => row.id === capture.foreignControlSource.id));
  assert.equal(authority.revision, (await memory.service.authority(threads.B)).revision);
  const context = await memory.service.selectedContext(threads.B, correction.turnId);
  assert.ok(context?.payload?.omittedFields?.includes('currentInput'));
  assert.ok(!context.payload.sourceMessageIds.includes(exact.id));
  console.log(JSON.stringify({
    evidenceSource: 'Independent direct reads from the installed app services and public VICT adapter on the synthetic review database',
    appSha: capture.appSha, postgresReader: url.username,
    operation: correction.operationId, correctionConversationId: threads.B, correctionPublicTurnId: correction.turnId,
    currentAuthorityRevision: authority.revision, correctionNativeSourceId: exact.id, span: expected.span,
    foreignConversationId: threads.C, sameTextForeignSourceId: capture.foreignControlSource.id,
    foreignOperationRefusal: 'VICT_MEMORY_OPERATION_CONFLICT',
    staleOperationId: old.operationId, staleOperationState: historical.status, stalePublishedEventRetained: true,
    staleResultRead: historical.result, staleCheckpointRead: historical.checkpoint,
    selectedContextDoesNotLinkTheCurrentInput: true,
  }, null, 2));
} finally {
  await oldMemory?.hosted.close();
  await memory?.hosted.close();
  await vite?.close();
  await stores.close();
}
