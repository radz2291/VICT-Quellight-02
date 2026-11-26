import { randomUUID } from 'node:crypto';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import { claimMemoryJob, settleMemoryJob, validateDeliveryActor, requireDeliveryActor, type MemoryJob, type MemoryJobState } from './jobs.js';
import { claimMethodJob, settleMethodJob, type MethodJob, type MethodJobOutcome } from '../desk/method-jobs.js';

export interface MemoryJobOutcome {
  state: Exclude<MemoryJobState, 'queued' | 'running'>;
  code?: string;
}
export interface MemoryDispatcherOptions {
  actorId?: string;
  /** Required-owner composition: resolved once per delivery, never during route import/build. */
  resolveActorId?(): string | undefined;
  openDatabase(): Promise<PostgresStoreSet>;
  reconcileCare?(stores: PostgresStoreSet, deadline: Date, actorId?: string): Promise<unknown>;
  reconcileConversations?(stores: PostgresStoreSet, deadline: Date, actorId: string): Promise<void>;
  process(job: MemoryJob, stores: PostgresStoreSet, deadline: Date): Promise<MemoryJobOutcome>;
  processMethod?(job: MethodJob, stores: PostgresStoreSet, deadline: Date): Promise<MethodJobOutcome>;
}
// These govern coordination and delivery, never model generation. Vercel supplies its actual deadline.
const HOST_WINDOW_MS = 300_000;
const DELIVERY_FENCE_MS = 30_000;

export function createMemoryDispatcher(options: MemoryDispatcherOptions) {
  const configuredActor = options.actorId, resolveActorId = options.resolveActorId;
  return async function dispatch(deadline = new Date(Date.now() + HOST_WINDOW_MS), fromScheduledWake = false) {
    if (resolveActorId && configuredActor !== undefined) throw new Error('MEMORY_DELIVERY_ACTOR_CONFLICT');
    const actorId = resolveActorId ? requireDeliveryActor(resolveActorId()) : validateDeliveryActor(configuredActor);
    const stores = await options.openDatabase();
    let handled = 0;
    try {
      if (fromScheduledWake && actorId) {
        await options.reconcileConversations?.(stores, deadline, actorId).catch(() => {
          console.error('QUELLIGHT_CONVERSATION_RECOVERY_UNCONFIRMED');
        });
      }
      await options.reconcileCare?.(stores, deadline, actorId);
      while (Date.now() < deadline.getTime()) {
        const claim = await stores.coordination.acquire({ scopeId: 'quellight:memory-delivery',
          actorId: 'quellight-memory-dispatcher', ownerId: randomUUID(), leaseMs: DELIVERY_FENCE_MS });
        if (claim.status !== 'acquired') return { handled, busy: true };
        let delivery: { kind: 'memory'; job: MemoryJob } | { kind: 'method'; job: MethodJob } | null;
        try { delivery = await stores.coordination.withFence(claim.lease, async client => {
          let first = 'memory';
          if (options.processMethod) {
            // Choose by durable due time across both queues, including abandoned claims.
            // A fresh stream of chat maintenance cannot starve older method work.
            const due = await client.query(`SELECT kind FROM (
              SELECT 'memory' AS kind,j.wake_after,j.created_at,j.id FROM quellight_product_v1.memory_jobs j
              WHERE ((j.state IN ('queued','retryable') AND j.wake_after<=now()) OR (j.state='running' AND j.claim_expires<=now()))
              AND ($1::uuid IS NULL OR j.actor_id=$1::uuid)
              AND NOT EXISTS(SELECT 1 FROM quellight_product_v1.memory_jobs a WHERE a.actor_id=j.actor_id AND a.state='running' AND a.claim_expires>now())
              UNION ALL
              SELECT 'method' AS kind,j.wake_after,j.created_at,j.id FROM quellight_product_v1.desk_method_jobs j
              WHERE ((j.state IN ('queued','retryable') AND j.wake_after<=now()) OR (j.state='running' AND j.claim_expires<=now()))
              AND ($1::uuid IS NULL OR j.actor_id=$1::uuid)
              AND NOT EXISTS(SELECT 1 FROM quellight_product_v1.desk_method_jobs a WHERE a.actor_id=j.actor_id AND a.state='running' AND a.claim_expires>now())
            ) eligible ORDER BY wake_after,created_at,id LIMIT 1`, [actorId ?? null]);
            first = due.rows[0]?.kind ?? 'memory';
          }
          if (first === 'method') {
            const job = await claimMethodJob(client, deadline, actorId);
            if (job) return { kind: 'method' as const, job };
          }
          const memory = await claimMemoryJob(client, deadline, actorId);
          if (memory) return { kind: 'memory' as const, job: memory };
          const method = options.processMethod ? await claimMethodJob(client, deadline, actorId) : null;
          return method ? { kind: 'method' as const, job: method } : null;
        }); }
        finally { await stores.coordination.release(claim.lease); }
        if (!delivery) break;
        const job = delivery.job;
        let outcome: MemoryJobOutcome;
        try { outcome = delivery.kind === 'method'
          ? await options.processMethod!(delivery.job, stores, deadline)
          : await options.process(delivery.job, stores, deadline); }
        catch {
          // An exception is not proof of failed publication. Keep the same native operation
          // identity so the next delivery reconciles its checkpoint before any new inference.
          outcome = { state: 'retryable', code: delivery.kind === 'method' ? 'DESK_METHOD_WORK_UNCONFIRMED' : 'MEMORY_WORK_UNCONFIRMED' };
        }
        const settlement = await stores.coordination.acquire({ scopeId: `quellight:memory-delivery:${job.id}`,
          actorId: job.actor_id, ownerId: randomUUID(), leaseMs: DELIVERY_FENCE_MS });
        if (settlement.status === 'acquired') {
          try {
            // Bounded exponential delivery backoff avoids hammering a failed provider. It does
            // not abandon the job, impose a generation timeout, or cap reasoning/turns.
            const delayMs = outcome.state === 'retryable' ? Math.min(60_000 * 2 ** Math.min(job.attempts - 1, 6), 3_600_000) : 0;
            await stores.coordination.withFence(settlement.lease, client => delivery!.kind === 'method'
              ? settleMethodJob(client, delivery!.job as MethodJob, outcome.state, outcome.code ?? null, new Date(Date.now() + delayMs))
              : settleMemoryJob(client, delivery!.job as MemoryJob, outcome.state, outcome.code ?? null, new Date(Date.now() + delayMs)));
          } finally { await stores.coordination.release(settlement.lease); }
        }
        handled++;
      }
      return { handled, busy: false };
    } finally { await stores.close(); }
  };
}
