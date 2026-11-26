import { setTimeout as delay } from 'node:timers/promises';
import type { MastraProductAgentConfig } from '@victframework/mastra';
import type { HostedLease } from '@victframework/runtime';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import type { MemoryJob } from './jobs.js';
import { loadEffectiveMemorySettings, type MemorySettingsSqlClient } from './settings.js';

export const MEMORY_YIELD = 'MEMORY_YIELDED_TO_CHAT';
export const MEMORY_WORK_LEASE_MS = 4000;
const CLAIM_POLL_MS = 110;
const LOST = 'MEMORY_JOB_CLAIM_LOST';
const POLICY_CHANGED = 'MEMORY_POLICY_OR_SOURCE_CHANGED';
type Interruption = typeof MEMORY_YIELD | typeof LOST | typeof POLICY_CHANGED | 'MEMORY_HOST_WINDOW_ENDED';

async function activeClaim(client: MemorySettingsSqlClient, job: MemoryJob, lock = false) {
  return (await client.query(`SELECT j.failure_code,c.room_id FROM quellight_product_v1.memory_jobs j
    JOIN quellight_product_v1.conversations c ON c.id=j.conversation_id AND c.actor_id=j.actor_id
    WHERE j.id=$1 AND j.actor_id=$2 AND j.claim_token=$3 AND j.state='running' AND j.claim_expires>now()
    ${lock ? 'FOR SHARE OF j' : ''}`, [job.id, job.actor_id, job.claim_token])).rows[0];
}

/** Admission is the trusted producer of the signal. A live chat retains its current fence. */
export async function requestMemoryYield(client: MemorySettingsSqlClient, actorId: string, conversationId: string) {
  const result = await client.query(`UPDATE quellight_product_v1.memory_jobs j SET failure_code=$3
    WHERE j.actor_id=$1 AND j.conversation_id=$2 AND j.state='running' AND j.claim_expires>now()
    AND NOT EXISTS (SELECT 1 FROM quellight_product_v1.conversation_turns t
      WHERE t.actor_id=j.actor_id AND t.conversation_id=j.conversation_id AND t.execution_state IN ('queued','running'))
    RETURNING j.id`, [actorId, conversationId, MEMORY_YIELD]);
  return result.rows.length !== 0;
}

/** Dialog may end a background delivery attempt. The native operation and durable job retain their identities. */
export function watchMemoryAttempt(stores: PostgresStoreSet, job: MemoryJob, lease: HostedLease, deadline: Date) {
  const stop = new AbortController();
  const interrupted = new AbortController();
  let interruption: Interruption | undefined;
  function interrupt(code: Interruption): never {
    interruption ??= code;
    interrupted.abort(new Error(interruption));
    throw interrupted.signal.reason;
  }
  function checkTime() {
    if (Date.now() >= deadline.getTime()) interrupt('MEMORY_HOST_WINDOW_ENDED');
  }
  async function checkClaim(client: MemorySettingsSqlClient, lock = false) {
    const claim = await activeClaim(client, job, lock);
    if (!claim) return interrupt(LOST);
    if (claim.failure_code === MEMORY_YIELD) return interrupt(MEMORY_YIELD);
    return claim;
  }

  const watcher = (async () => {
    let renewAt = Date.now() + Math.floor(MEMORY_WORK_LEASE_MS / 3);
    try {
      while (!stop.signal.aborted && !interrupted.signal.aborted) {
        checkTime();
        await checkClaim(stores.coordination.pool);
        if (Date.now() >= renewAt) {
          await stores.coordination.renew(lease, MEMORY_WORK_LEASE_MS);
          renewAt = Date.now() + Math.floor(MEMORY_WORK_LEASE_MS / 3);
        }
        await delay(CLAIM_POLL_MS, undefined, { signal: stop.signal, ref: false });
      }
    } catch {
      if (!stop.signal.aborted && !interrupted.signal.aborted) interrupted.abort(new Error('MEMORY_WATCH_UNCONFIRMED'));
    }
  })();

  // The installed native store executes its recoverable publication through this
  // public coordination port. Validate the product job in the SAME writable
  // transaction as native writes, under the product and native fences. Indexed
  // transactions also serialize product settings changes under their namespace.
  const coordination = new Proxy(stores.coordination, {
    get(target, key) {
      if (key === 'withFence') return <T>(nativeLease: HostedLease, work: (client: Parameters<Parameters<typeof target.withFence>[1]>[0]) => Promise<T>) =>
        target.withFence(nativeLease, async client => {
          checkTime();
          await target.assertInTransaction(client, lease);
          const claim = await checkClaim(client, true);
          if (job.kind !== 'purge') {
            const effective = await loadEffectiveMemorySettings(client, job.actor_id, claim.room_id);
            if (effective.revision !== job.configuration_revision || !effective.configuration.values.automaticLearning) interrupt(POLICY_CHANGED);
          }
          const result = await work(client);
          await target.assertInTransaction(client, lease);
          return result;
        });
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return {
    coordination, signal: interrupted.signal, interruption: () => interruption,
    async close() { stop.abort(); await watcher; },
  };
}

/** Forward normal model limits and capabilities. Yield discards a late result even if a provider ignores cancellation. */
export function memoryModelForSignal(factory: MastraProductAgentConfig['modelFactory'], priority: AbortSignal): MastraProductAgentConfig['modelFactory'] {
  function untilInterrupted<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      void operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }
  return profile => {
    const model = factory(profile);
    if (!model || typeof model !== 'object') return model;
    return new Proxy(Object.create(Object.getPrototypeOf(model)), {
      has: (_target, key) => key in model,
      ownKeys: () => Reflect.ownKeys(model),
      getOwnPropertyDescriptor(_target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(model, key);
        return descriptor && { ...descriptor, configurable: true };
      },
      get(_target, key) {
        const value = Reflect.get(model, key, model);
        if (typeof value !== 'function') return value;
        if (key !== 'doGenerate' && key !== 'doStream') return value.bind(model);
        return async (options: { abortSignal?: AbortSignal }) => {
          const signal = options.abortSignal ? AbortSignal.any([options.abortSignal, priority]) : priority;
          signal.throwIfAborted();
          const pending = Promise.resolve(value.call(model, { ...options, abortSignal: signal }));
          void pending.then(result => {
            if (signal.aborted && result?.stream instanceof ReadableStream) return result.stream.cancel(signal.reason);
          }).catch(() => undefined);
          const result = await untilInterrupted(pending, signal);
          if (!(result?.stream instanceof ReadableStream)) return result;
          const reader = (result.stream as ReadableStream<unknown>).getReader();
          return { ...result, stream: new ReadableStream({
            async pull(controller) {
              try {
                const row = await untilInterrupted(reader.read(), signal);
                if (row.done) controller.close();
                else controller.enqueue(row.value);
              } catch (error) {
                controller.error(error);
                void reader.cancel(error).catch(() => undefined);
              }
            },
            cancel: reason => reader.cancel(reason),
          }) };
        };
      },
    });
  };
}
