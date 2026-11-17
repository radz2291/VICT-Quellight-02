import { randomUUID } from 'node:crypto';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import { claimMemoryJob, settleMemoryJob, type MemoryJob, type MemoryJobState } from './jobs.js';

export interface MemoryJobOutcome {
  state: Exclude<MemoryJobState, 'queued' | 'running'>;
  code?: string;
}
export interface MemoryDispatcherOptions {
  openDatabase(): Promise<PostgresStoreSet>;
  reconcileCare?(stores: PostgresStoreSet, deadline: Date): Promise<unknown>;
  process(job: MemoryJob, stores: PostgresStoreSet, deadline: Date): Promise<MemoryJobOutcome>;
}
// These govern coordination and delivery, never model generation. Vercel supplies its actual deadline.
const HOST_WINDOW_MS = 300_000;
const DELIVERY_FENCE_MS = 30_000;

export function createMemoryDispatcher(options: MemoryDispatcherOptions) {
  return async function dispatch(deadline = new Date(Date.now() + HOST_WINDOW_MS)) {
    const stores = await options.openDatabase();
    let handled = 0;
    try {
      await options.reconcileCare?.(stores, deadline);
      while (Date.now() < deadline.getTime()) {
        const claim = await stores.coordination.acquire({ scopeId: 'quellight:memory-delivery',
          actorId: 'quellight-memory-dispatcher', ownerId: randomUUID(), leaseMs: DELIVERY_FENCE_MS });
        if (claim.status !== 'acquired') return { handled, busy: true };
        let job: MemoryJob | null;
        try { job = await stores.coordination.withFence(claim.lease, client => claimMemoryJob(client, deadline)); }
        finally { await stores.coordination.release(claim.lease); }
        if (!job) break;
        let outcome: MemoryJobOutcome;
        try { outcome = await options.process(job, stores, deadline); }
        catch {
          // An exception is not proof of failed publication. Keep the same native operation
          // identity so the next delivery reconciles its checkpoint before any new inference.
          outcome = { state: 'retryable', code: 'MEMORY_WORK_UNCONFIRMED' };
        }
        const settlement = await stores.coordination.acquire({ scopeId: `quellight:memory-delivery:${job.id}`,
          actorId: job.actor_id, ownerId: randomUUID(), leaseMs: DELIVERY_FENCE_MS });
        if (settlement.status === 'acquired') {
          try {
            // Bounded exponential delivery backoff avoids hammering a failed provider. It does
            // not abandon the job, impose a generation timeout, or cap reasoning/turns.
            const delayMs = outcome.state === 'retryable' ? Math.min(60_000 * 2 ** Math.min(job.attempts - 1, 6), 3_600_000) : 0;
            await stores.coordination.withFence(settlement.lease, client => settleMemoryJob(client, job!, outcome.state,
              outcome.code ?? null, new Date(Date.now() + delayMs)));
          } finally { await stores.coordination.release(settlement.lease); }
        }
        handled++;
      }
      return { handled, busy: false };
    } finally { await stores.close(); }
  };
}
