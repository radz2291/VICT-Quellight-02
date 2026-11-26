import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDeterministicOfflineModel } from '@victframework/mastra';
import { createIndexedPostgresStores } from '@victframework/store-postgres';

const wait = (promise, message) => {
  let timer;
  return Promise.race([promise, new Promise((_,fail) => {
    timer = setTimeout(() => fail(new Error(message)), 20_000);
  })]).finally(() => clearTimeout(timer));
};
function gate() {
  let open;
  return { value: new Promise(resolve => { open = resolve; }), open };
}
const reply = (options, text) => {
  const last = options.prompt.findLast(message => message.role === 'user');
  const input = typeof last?.content === 'string' ? last.content : last?.content?.find(part => part.type === 'text')?.text;
  return createDeterministicOfflineModel({ script: { [input]: { kind: 'text', text } } });
};
const nativeReply = '<observations>\nDate: 2026-11-26\n- 🔴 A synthetic user keeps a stable fixture note.\n</observations>\n<working-memory>\n# Preferences\n- Include concise fixture summaries.\n</working-memory>';

export async function checkForegroundMemory({ stores, modules, database, owner, room, conversation, pass, baselineMemory }) {
  const { createConversationService } = await modules.ssrLoadModule('/src/lib/server/conversation/service.ts');
  const { createMemoryJobProcessor } = await modules.ssrLoadModule('/src/lib/server/memory/worker.ts');
  const { claimMemoryJob, settleMemoryJob } = await modules.ssrLoadModule('/src/lib/server/memory/jobs.ts');
  const settings = await modules.ssrLoadModule('/src/lib/server/memory/settings.ts');
  const { openQuellightMemory } = await modules.ssrLoadModule('/src/lib/server/memory/native.ts');
  const id = await conversation();
  const heldChat = gate();
  const chatInvoked = gate();
  let holdForeground = false;
  const chatModel = {
    specificationVersion: 'v2', provider: 'synthetic', modelId: 'foreground-chat', supportedUrls: {},
    async doStream(options) {
      if (holdForeground) {
        chatInvoked.open();
        await heldChat.value;
      }
      return reply(options, 'A durable synthetic reply.').doStream(options);
    },
    async doGenerate(options) { return reply(options, 'A durable synthetic reply.').doGenerate(options); },
  };
  const service = createConversationService({ openDatabase: () => createIndexedPostgresStores(database),
    readCredential: async () => 'fixture-no-provider', modelFactory: () => chatModel });
  const nextInput = index => ({ input: 'Synthetic retained text for chat ' + index, idempotencyKey: randomUUID() });
  async function withFence(work) {
    const claim = await stores.coordination.acquire({ scopeId: 'fixture:' + randomUUID(), actorId: owner.id,
      ownerId: randomUUID(), leaseMs: 60_000 });
    assert.equal(claim.status, 'acquired');
    try { return await stores.coordination.withFence(claim.lease, work); }
    finally { await stores.coordination.release(claim.lease); }
  }
  const deadline = () => new Date(Date.now() + 90_000);
  async function claim() {
    const job = await withFence(client => claimMemoryJob(client, deadline(), owner.id));
    assert.equal(job?.conversation_id, id);
    return job;
  }
  async function settle(job, outcome, retryDelay = 0) {
    assert.equal(await withFence(client => settleMemoryJob(client, job, outcome.state, outcome.code ?? null,
      new Date(Date.now() + retryDelay))), true);
  }
  function memoryWorker({ hold, entered, aborted, onCall } = {}) {
    const run = async (method, options) => {
      onCall?.();
      options.abortSignal?.addEventListener('abort', () => aborted?.open(), { once: true });
      entered?.open();
      // This deliberately uncooperative provider ignores abort until the test
      // releases it. The wrapper must still discard its late arbitrary result.
      await hold?.value;
      return reply(options, nativeReply)[method](options);
    };
    return createMemoryJobProcessor({ modelFactory: async () => () => ({
      specificationVersion: 'v2', provider: 'synthetic', modelId: 'background-memory', supportedUrls: {},
      doStream: options => run('doStream', options), doGenerate: options => run('doGenerate', options),
    }) });
  }
  const seed = await service.start(owner, id, nextInput(0));
  await seed.completion;
  assert.equal((await stores.turns.getTurn(seed.turnId))?.status, 'completed');
  const yielded = [], observed = [];
  for (let index = 1; index <= 3; index++) {
    const job = await claim();
    const entered = gate(), hold = gate(), aborted = gate();
    const processing = memoryWorker({ hold, entered, aborted })(job, stores, deadline());
    let accepted;
    try {
      await wait(Promise.race([entered.value, processing.then(outcome => {
        throw new Error('Memory returned before invoking its model: ' + JSON.stringify(outcome));
      })]), 'Memory provider was not entered');
      holdForeground = !baselineMemory && index === 1;
      const request = nextInput(index);
      const from = performance.now();
      if (baselineMemory) {
        await assert.rejects(service.start(owner, id, request), { code: 'CONVERSATION_BUSY' });
        observed.push(Math.round(performance.now() - from));
        hold.open();
        const finished = await wait(processing, 'Baseline Memory failed to publish after releasing its provider');
        assert.equal(finished.state, 'completed');
        await settle(job, finished);
        accepted = await service.start(owner, id, request);
        assert.equal(accepted.userMessage.requestKey, request.idempotencyKey);
        continue;
      }
      accepted = await wait(service.start(owner, id, request), 'Foreground Send could not acquire the scoped leases');
      observed.push(Math.round(performance.now() - from));
      assert.equal(accepted.userMessage.requestKey, request.idempotencyKey);
      const outcome = await wait(processing, 'Yield did not settle the current worker attempt');
      assert.deepEqual(outcome, { state: 'retryable', code: 'MEMORY_YIELDED_TO_CHAT' });
      await wait(aborted.value, 'Foreground cancellation did not reach the provider transport');
      await settle(job, outcome, 600_000);
      yielded.push(job);
      if (index === 1) {
        await wait(chatInvoked.value, 'Accepted foreground chat never invoked the model');
        const replay = await service.start(owner, id, request);
        assert.equal(replay.turnId, accepted.turnId);
        await assert.rejects(service.start(owner, id, nextInput('overlap')), { code: 'CONVERSATION_BUSY' });
      }
    } finally {
      holdForeground = false;
      heldChat.open();
      hold.open();
      await processing.catch(() => undefined);
      await accepted?.completion;
    }
  }
  const persisted = await stores.coordination.pool.query(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE execution_state='settled')::int AS settled
    FROM quellight_product_v1.conversation_turns WHERE actor_id=$1 AND conversation_id=$2`, [owner.id,id]);
  assert.deepEqual(persisted.rows[0], { total: 4, settled: 4 });
  if (baselineMemory) {
    pass('three baseline Sends are refused while native Memory owns the shared product lease; same-key retry afterward saves one turn each',
      { refusalMs: observed, memoryCausedConflicts: 3, durableTurns: 4 });
    return;
  }
  pass('three consecutive Sends yield active C12 inference and reject a competing prompt while replay retains canonical identity',
    { admissionMs: observed, memoryCausedConflicts: 0, durableTurns: 4 });

  const cleanupAdmissions = [];
  for (const releaseAfter of [350, null]) {
    const completedChat = await conversation();
    const releaseReached = gate(), releaseAllowed = gate();
    const oldWorker = createConversationService({ readCredential: async () => 'fixture-no-provider',
      modelFactory: () => chatModel, async openDatabase() {
        const opened = await createIndexedPostgresStores(database);
        const coordination = new Proxy(opened.coordination, { get(target, key) {
          if (key === 'release') return async lease => {
            if (lease.scopeId === `quellight:conversation:${completedChat}`) {
              releaseReached.open();
              await releaseAllowed.value;
            }
            return target.release(lease);
          };
          const member = Reflect.get(target, key, target);
          return typeof member === 'function' ? member.bind(target) : member;
        } });
        return { ...opened, coordination };
      } });
    const prior = await oldWorker.start(owner, completedChat, nextInput('cleanup-previous'));
    let releaseTimer;
    try {
      await wait(releaseReached.value, 'Prior worker did not reach lease cleanup');
      const visible = await service.events(owner, prior.turnId, 0);
      assert.equal(visible.turn.status, 'completed');
      assert.equal(visible.turn.projectionSettled, true);
      assert.equal(visible.assistantMessage?.text, 'A durable synthetic reply.');
      const next = nextInput('cleanup-followup');
      const from = performance.now();
      if (releaseAfter === null) {
        await assert.rejects(service.start(owner, completedChat, next), { code: 'TURN_ADMISSION_UNCONFIRMED', status: 503 });
        const afterTimeout = await service.detail(owner, completedChat);
        assert.equal(afterTimeout.messages.filter(message => message.role === 'user').length, 1);
        releaseAllowed.open();
        await prior.completion;
      } else {
        releaseTimer = setTimeout(releaseAllowed.open, releaseAfter);
      }
      const accepted = await wait(service.start(owner, completedChat, next), 'Follow-up did not acquire a cleaned lease');
      cleanupAdmissions.push({ releaseAfter, elapsedMs: Math.round(performance.now() - from) });
      await accepted.completion;
      assert.equal(accepted.userMessage.requestKey, next.idempotencyKey);
      assert.equal((await service.start(owner, completedChat, next)).turnId, accepted.turnId);
      const view = await service.detail(owner, completedChat);
      assert.equal(view.messages.filter(message => message.role === 'user').length, 2);
    } finally {
      clearTimeout(releaseTimer);
      releaseAllowed.open();
      await prior.completion;
    }
  }
  // Keep the cleanup fixture's automatic work out of this conversation's
  // deterministic queue claims. These rows are isolated test inputs.
  await stores.coordination.pool.query(`UPDATE quellight_product_v1.memory_jobs
    SET wake_after=now()+interval '1 hour' WHERE actor_id=$1 AND conversation_id<>$2`, [owner.id, id]);
  pass('publicly completed chat admits a follow-up during delayed lease cleanup and keeps the key on bounded timeout',
    { cleanupAdmissions });

  const old = yielded[0];
  await withFence(client => client.query("UPDATE quellight_product_v1.memory_jobs SET wake_after=now()-interval '1 day' WHERE id=$1", [old.id]));
  const reclaim = await claim();
  assert.equal(reclaim.id, old.id);
  let calls = 0;
  const fastWorker = memoryWorker({ onCall: () => { calls++; } });
  const recovered = await fastWorker(reclaim, stores, deadline());
  assert.equal(recovered.state, 'superseded');
  assert.equal(calls, 0);
  await settle(reclaim, recovered);
  const newest = await claim();
  const published = await fastWorker(newest, stores, deadline());
  assert.equal(published.state, 'completed');
  assert.equal(calls, 1);
  await settle(newest, published);
  pass('yielded native operation reconciles without another generation and latest durable job publishes once');

  const interrupted = await service.start(owner, id, nextInput('before-host-exit'));
  await interrupted.completion;
  const orphan = await claim();
  const peer = fork(fileURLToPath(new URL('./check-vhost026-memory-peer.mjs', import.meta.url)), [], { windowsHide: true });
  const enteredPeer = new Promise((resolve, reject) => {
    peer.once('message', event => event?.status === 'inference' ? resolve() : reject(new Error('Worker could not reach inference')));
    peer.once('error', reject);
  });
  const exited = new Promise(resolve => peer.once('exit', resolve));
  let hostExitAdmission;
  try {
    peer.send({ job: orphan, database, deadline: deadline().toISOString() });
    await wait(enteredPeer, 'Peer Memory worker never reached inference');
    peer.kill();
    await wait(exited, 'Peer Memory worker did not exit');
    const from = performance.now();
    const afterExit = await wait(service.start(owner, id, nextInput('after-host-exit')), 'Send did not reacquire expired leases');
    hostExitAdmission = Math.round(performance.now() - from);
    await afterExit.completion;
    assert.equal((await stores.turns.getTurn(afterExit.turnId))?.status, 'completed');
  } finally {
    if (peer.exitCode === null && peer.signalCode === null) peer.kill();
    await exited;
  }
  // Advance the stranded queue deadline on the disposable fixture. The
  // dispatcher claims through its normal expired-claim recovery command.
  await withFence(client => client.query(`UPDATE quellight_product_v1.memory_jobs
    SET claim_expires=now()-interval '1 second' WHERE id=$1`, [orphan.id]));
  // The new chat's observation was due before the queue lease expired.
  const afterExitJob = await claim();
  assert.notEqual(afterExitJob.id, orphan.id);
  const afterExitOutcome = await fastWorker(afterExitJob, stores, deadline());
  assert.equal(afterExitOutcome.state, 'completed');
  await settle(afterExitJob, afterExitOutcome);
  const recoveredOrphan = await claim();
  assert.equal(recoveredOrphan.id, orphan.id);
  assert.notEqual(recoveredOrphan.claim_token, orphan.claim_token);
  const priorCalls = calls;
  const recoveredOutcome = await fastWorker(recoveredOrphan, stores, deadline());
  assert.equal(recoveredOutcome.state, 'superseded');
  assert.equal(calls, priorCalls);
  await settle(recoveredOrphan, recoveredOutcome);
  pass('killed Memory worker cannot keep chat or native leases live; expired queue claim reconciles without model replay',
    { admittedAfterExitMs: hostExitAdmission, queueExpiryAdvancedInFixture: true });

  const next = await service.start(owner, id, nextInput(4));
  await next.completion;
  const stale = await claim();
  const entered = gate(), hold = gate();
  const processing = memoryWorker({ hold, entered })(stale, stores, deadline());
  try {
    await wait(entered.value, 'Memory provider was not entered before settings change');
    const target = { kind: 'app' };
    const current = await settings.readMemorySettings(stores.coordination.pool, owner.id, target);
    const changed = { ...current.content, configuration: { ...current.content.configuration, automaticLearning: false } };
    const disabled = await withFence(client => settings.saveMemorySettings(client, owner.id, target,
      { content: changed, expectedRevision: current.revision }));
    hold.open();
    const outcome = await wait(processing, 'Stale work did not settle after policy change');
    assert.equal(outcome.state, 'superseded');
    await settle(stale, outcome);
    const opened = await openQuellightMemory({ stores, ownerActorId: owner.id, conversationId: id, effective: stale.configuration });
    try {
      const operation = await opened.service.operation(id, 'memory-job:' + stale.id);
      assert.notEqual(operation?.status, 'completed');
    } finally { await opened.hosted.close(); }
    pass('native fenced publication rejects changed product policy after provider inference starts');
    await withFence(client => settings.saveMemorySettings(client, owner.id, target,
      { content: current.content, expectedRevision: disabled.revision }));
  } finally {
    hold.open();
    await processing.catch(() => undefined);
  }

  const { executeMemoryCareAction } = await modules.ssrLoadModule('/src/lib/server/memory/care-actions.ts');
  const beforeForget = await service.start(owner, id, nextInput('Forget'));
  await beforeForget.completion;
  const forgetJob = await claim();
  const native = await openQuellightMemory({ stores, ownerActorId: owner.id, conversationId: id, effective: forgetJob.configuration });
  let source;
  try {
    const recall = await native.service.recall({ conversationId: id, perPage: 1000 });
    source = recall.messages.find(message => message.role === 'user');
    assert.ok(source);
  } finally { await native.hosted.close(); }
  const enteredForget = gate(), holdForget = gate();
  const activeMemory = memoryWorker({ hold: holdForget, entered: enteredForget })(forgetJob, stores, deadline());
  try {
    await wait(enteredForget.value, 'Memory provider was not entered before Forget');
    const result = await executeMemoryCareAction(stores, owner, 'memory.forget', {
      conversationId: id, expectedAuthorityRevision: forgetJob.authority_revision, sourceMessageIds: JSON.stringify([source.id]),
    }, randomUUID());
    assert.equal(result.ok, true);
    const outcome = await wait(activeMemory, 'Forget did not interrupt the stale Memory claimant');
    assert.equal(outcome.state, 'retryable');
    assert.equal(await withFence(client => settleMemoryJob(client, forgetJob, 'completed')), false);
    const { rows: [job] } = await stores.coordination.pool.query(
      'SELECT state,failure_code FROM quellight_product_v1.memory_jobs WHERE id=$1', [forgetJob.id]);
    assert.deepEqual(job, { state: 'superseded', failure_code: 'MEMORY_AUTHORITY_CHANGED' });
    const after = await openQuellightMemory({ stores, ownerActorId: owner.id, conversationId: id, effective: forgetJob.configuration });
    try {
      const authority = await after.service.authority(id);
      const remaining = await after.service.recall({ conversationId: id, perPage: 1000 });
      assert.ok(authority.excludedMessageIds.includes(source.id));
      assert.ok(!remaining.messages.some(message => message.id === source.id));
      assert.notEqual((await after.service.operation(id, 'memory-job:' + forgetJob.id))?.status, 'completed');
    } finally { await after.hosted.close(); }
    assert.ok((await service.detail(owner, id)).messages.some(message => message.id === beforeForget.userMessage.id));
    pass('governed Forget revokes the live claim and native publication while retaining canonical transcript');
  } finally {
    holdForget.open();
    await activeMemory.catch(() => undefined);
  }

}
