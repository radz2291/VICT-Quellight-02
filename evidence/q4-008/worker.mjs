import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { openRuntime } from './fixture.mjs';

const [app, dsn, actorId, barrier, windowText, dir] = process.argv.slice(2);
const windowMs = Number(windowText);
assert.ok(actorId && dir && typeof process.send === 'function');
assert.ok(['none', 'before-prepare', 'after-prepare', 'after-publish'].includes(barrier));
assert.ok(windowMs >= 5000 && windowMs <= 30000);
const emit = message => new Promise((resolve, reject) => process.send(message, error => error ? reject(error) : resolve()));

let runtime;
try {
  runtime = await openRuntime(app, dsn, dir);
  const { createMemoryJobProcessor } = await runtime.load('memory/worker');
  const { createMemoryDispatcher } = await runtime.load('memory/dispatcher');
  const { processPendingMemoryCare } = await runtime.load('memory/care-actions');
  const { HostedPostgresMastraStore, createDeterministicOfflineModel } = runtime.adapter;

  // Test seam around the installed methods. The SQL, fencing and stored state are real.
  if (barrier !== 'none') {
    const withinAtomic = new AsyncLocalStorage();
    const store = HostedPostgresMastraStore.prototype;
    const atomic = store.nativeAtomic, recovery = store.nativeRecoveryRecord;
    const pause = async (commands, position) => {
      await emit({ type: 'barrier', barrier, position, pid: process.pid, ...commands });
      await new Promise(() => {}); // The parent must terminate this process.
    };
    store.nativeRecoveryRecord = async function (command) {
      const row = await recovery.call(this, command);
      const markers = withinAtomic.getStore();
      if (markers && command.operation === 'update' && ['prepared', 'completed'].includes(command.status)) {
        markers.push({ operationId: command.operationId, transition: command.status,
          nativeAuthority: row.authority_revision, nativeSource: row.source_digest, nativeConfig: row.configuration_revision });
        if (barrier === 'before-prepare' && command.status === 'prepared') await pause(markers.at(-1), 'after-update-before-commit');
      }
      return row;
    };
    store.nativeAtomic = async function (authority, work) {
      const markers = [];
      const result = await atomic.call(this, authority, () => withinAtomic.run(markers, work));
      const transition = barrier === 'after-prepare' ? 'prepared' : barrier === 'after-publish' ? 'completed' : null;
      const marker = markers.find(item => item.transition === transition);
      if (marker) await pause(marker, 'after-commit-before-return');
      return result;
    };
  }

  const model = createDeterministicOfflineModel({ script: {} });
  const textOf = content => typeof content === 'string' ? content : content.map(item => item.text ?? '').join('\n');
  const makeModel = job => {
    async function rendered(options) {
      assert.equal(job.kind, 'observe');
      const prompt = options.prompt.filter(message => message.role === 'user').map(message => textOf(message.content))
        .find(text => text.includes('## New Message History to Observe'));
      assert.ok(prompt);
      const input = prompt.slice(prompt.indexOf('## New Message History to Observe')).split(/^\s*---\s*$/m)[0];
      const tags = [...input.matchAll(/\bSYN_[UA]\d{2}\b/g)].map(match => match[0]);
      assert.ok(tags.length && tags.every(tag => /^SYN_[UA]0[12]$/.test(tag)));
      const note = input.includes('paper log') ? 'The harbor inspection uses a paper log.' : 'The trial boat-pass rule ends today.';
      const reply = '<observations>\n- ' + note + '\n</observations>';
      await emit({ type: 'model', jobId: job.id, attempt: job.attempts, kind: job.kind, tags, reply });
      return reply;
    }
    return { ...model,
      async doGenerate(options) {
        const text = await rendered(options);
        return { ...await model.doGenerate(options), content: [{ type: 'text', text }] };
      },
      async doStream(options) {
        const text = await rendered(options);
        return { stream: new ReadableStream({ start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: 'q4-008' });
          controller.enqueue({ type: 'text-delta', id: 'q4-008', delta: text });
          controller.enqueue({ type: 'text-end', id: 'q4-008' });
          controller.enqueue({ type: 'finish', finishReason: 'stop', usage: { inputTokens: 12, outputTokens: 21, totalTokens: 33 } });
          controller.close();
        } }) };
      },
    };
  };
  const processJob = createMemoryJobProcessor({ modelFactory: async job => () => makeModel(job) });
  const dispatch = createMemoryDispatcher({ actorId, openDatabase: () => runtime.open(),
    reconcileCare: (stores, deadline, owner) => processPendingMemoryCare(stores, deadline.getTime(), {}, owner),
    async process(job, stores, deadline) {
      await emit({ type: 'delivery', jobId: job.id, attempt: job.attempts, kind: job.kind,
        deadline: deadline.toISOString(), claimExpires: job.claim_expires, authority: job.authority_revision,
        productSource: job.source_revision, productConfig: job.configuration_revision });
      const outcome = await processJob(job, stores, deadline);
      await emit({ type: 'outcome', jobId: job.id, outcome });
      return outcome;
    },
  });
  await emit({ type: 'ready', pid: process.pid, actorId, barrier });
  const result = await dispatch(new Date(Date.now() + windowMs));
  await emit({ type: 'dispatch', result });
} catch (error) {
  await emit({ type: 'error', name: error.name, code: error.code, message: error.message, stack: error.stack }).catch(() => {});
  process.exitCode = 2;
} finally {
  await runtime?.close();
  if (process.connected) process.disconnect();
}
