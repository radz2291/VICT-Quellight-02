import { randomUUID } from 'node:crypto';
import { authenticatedActorContext, assertActorScope, type HostedLease } from '@victframework/runtime';
import type { MastraProductAgentConfig } from '@victframework/mastra';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import { enqueueMemoryJob, publicConversationSources, type MemoryJob } from './jobs.js';
import { loadEffectiveMemorySettings, type MemorySettingsSqlClient } from './settings.js';
import { openQuellightMemory } from './native.js';
import type { MemoryJobOutcome } from './dispatcher.js';

export interface MemoryJobProcessorOptions {
  /** Resolve the explicitly selected provider only when new inference is necessary. */
  modelFactory(job: MemoryJob): Promise<MastraProductAgentConfig['modelFactory']>;
}
type OpenMemory = Awaited<ReturnType<typeof openQuellightMemory>>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const supersededCodes = new Set(['VICT_MEMORY_AUTHORITY_CHANGED', 'VICT_MASTRA_POSTGRES_AUTHORITY_CHANGED',
  'VICT_MEMORY_SOURCE_CHANGED', 'VICT_MEMORY_SUPERSEDED']);
const blockedCodes = new Set(['VICT_ACTOR_UNAUTHENTICATED', 'VICT_ACTOR_SCOPE_DENIED',
  'VICT_AGENT_THREAD_ACTOR_MISMATCH', 'VICT_MEMORY_CONFIG_INVALID', 'VICT_MEMORY_OPERATION_CONFLICT',
  'VICT_MASTRA_POSTGRES_CONFIG_INVALID', 'VICT_MASTRA_POSTGRES_SCHEMA_MISMATCH',
  'MEMORY_SETTINGS_INVALID', 'MEMORY_CONFIGURATION_INVALID', 'MEMORY_PROMPT_INVALID',
  'MEMORY_NATIVE_CONFIGURATION_INVALID']);
function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = Object.getOwnPropertyDescriptor(error, 'code')?.value;
  return typeof value === 'string' ? value : undefined;
}
async function currentPolicy(client: MemorySettingsSqlClient, job: MemoryJob) {
  const row = (await client.query(`SELECT c.room_id FROM quellight_product_v1.conversations c
    JOIN quellight_product_v1.rooms r ON r.id=c.room_id AND r.actor_id=c.actor_id
    WHERE c.id=$1 AND c.actor_id=$2`, [job.conversation_id, job.actor_id])).rows[0];
  if (!row) return null;
  const configuration = await loadEffectiveMemorySettings(client, job.actor_id, row.room_id);
  const source = await publicConversationSources(client, job.actor_id, job.conversation_id);
  return { configuration, source };
}

/** Delivery retries retain the native operation identity; a queue timeout is never permission to repeat inference. */
export function createMemoryJobProcessor(options: MemoryJobProcessorOptions) {
  return async function process(job: MemoryJob, stores: PostgresStoreSet, deadline: Date): Promise<MemoryJobOutcome> {
    let memory: OpenMemory | undefined;
    let conversationLease: HostedLease | undefined;
    const operationId = `memory-job:${job.id}`;
    const request = { conversationId: job.conversation_id, operationId, authorityRevision: job.authority_revision };
    const expired = () => Date.now() >= deadline.getTime();
    const retry = (code = 'MEMORY_WORK_UNCONFIRMED'): MemoryJobOutcome => ({ state: 'retryable', code });

    async function supersedeAndEnqueue(code: string): Promise<MemoryJobOutcome> {
      if (expired()) return retry('MEMORY_HOST_WINDOW_ENDED');
      if (!memory || !conversationLease) return retry();
      // Native reads occur outside the product SQL fence, including with a one-connection pool.
      const authority = await memory.service.authority(job.conversation_id);
      return await stores.coordination.withFence(conversationLease, async client => {
          const claimed = (await client.query(`SELECT 1 FROM quellight_product_v1.memory_jobs
            WHERE id=$1 AND actor_id=$2 AND claim_token=$3 AND state='running' AND claim_expires>now()`,
          [job.id, job.actor_id, job.claim_token])).rows[0];
          if (!claimed) return retry('MEMORY_JOB_CLAIM_LOST');
          const fresh = await currentPolicy(client, job);
          if (!fresh) return { state: 'blocked', code: 'MEMORY_CONVERSATION_UNAVAILABLE' };
          await enqueueMemoryJob(client, { actorId: job.actor_id, conversationId: job.conversation_id,
            kind: job.kind === 'purge' ? 'purge' : 'observe', sourceRevision: fresh.source.revision,
            configuration: fresh.configuration, authorityRevision: authority.revision, supersedesJobId: job.id });
          return { state: 'superseded', code };
      });
    }

    try {
      if (![job.id, job.actor_id, job.conversation_id].every(value => typeof value === 'string' && uuid.test(value)) ||
        !['observe', 'reflect', 'purge'].includes(job.kind) || !job.authority_revision ||
        job.configuration_revision !== job.configuration?.revision || !Number.isFinite(deadline.getTime())) {
        return { state: 'blocked', code: 'MEMORY_JOB_INVALID' };
      }
      if (expired()) return retry('MEMORY_HOST_WINDOW_ENDED');
      const actor = authenticatedActorContext(await stores.actors.get(job.actor_id), job.actor_id);
      assertActorScope(actor, 'app.data.read'); assertActorScope(actor, 'agent.turn.start');
      const current = await currentPolicy(stores.coordination.pool, job);
      if (!current) return { state: 'blocked', code: 'MEMORY_CONVERSATION_UNAVAILABLE' };
      const remaining = Math.floor(deadline.getTime() - Date.now());
      if (remaining <= 0) return retry('MEMORY_HOST_WINDOW_ENDED');
      // Chat admission and execution use this same product lease. Hold it until
      // native work has closed, so a live maintainer cannot strand an admitted chat
      // behind its native thread fence. This is the actual host window, not a model cap.
      const claim = await stores.coordination.acquire({ scopeId: `quellight:conversation:${job.conversation_id}`,
        actorId: job.actor_id, ownerId: randomUUID(), leaseMs: remaining });
      if (claim.status !== 'acquired') return retry('MEMORY_CONVERSATION_BUSY');
      conversationLease = claim.lease;
      memory = await openQuellightMemory({ stores, ownerActorId: job.actor_id,
        conversationId: job.conversation_id, effective: job.configuration });
      const existing = await memory.service.operation(job.conversation_id, operationId);
      if (existing && (existing.configuration_revision !== memory.service.configurationRevision ||
        existing.authority_revision !== job.authority_revision ||
        existing.kind !== (job.kind === 'purge' ? 'purge-invalidated' : job.kind))) {
        return { state: 'blocked', code: 'MEMORY_NATIVE_OPERATION_CONFLICT' };
      }

      if (job.kind === 'purge') {
        if ((await memory.service.authority(job.conversation_id)).revision !== job.authority_revision)
          return await supersedeAndEnqueue('MEMORY_AUTHORITY_CHANGED');
        await memory.service.purgeInvalidated(request);
        return { state: 'completed' };
      }

      if (existing) {
        // This creates a real new reconcile receipt. It never fabricates completion
        // of the original attempt or invokes a model merely to discover its outcome.
        const result = await memory.service.reconcile(request);
        if (result.disposition === 'completed') return { state: 'completed' };
        if (result.disposition === 'superseded') return await supersedeAndEnqueue('MEMORY_SOURCE_SUPERSEDED');
      }

      const authority = await memory.service.authority(job.conversation_id);
      const fresh = await currentPolicy(stores.coordination.pool, job);
      if (!fresh) return { state: 'blocked', code: 'MEMORY_CONVERSATION_UNAVAILABLE' };
      if (authority.revision !== job.authority_revision || fresh.source.revision !== job.source_revision ||
        fresh.configuration.revision !== job.configuration_revision ||
        !fresh.configuration.configuration.values.automaticLearning) {
        return await supersedeAndEnqueue('MEMORY_POLICY_OR_SOURCE_CHANGED');
      }
      if (expired()) return retry('MEMORY_HOST_WINDOW_ENDED');
      const modelFactory = await options.modelFactory(job);
      if (typeof modelFactory !== 'function') return { state: 'blocked', code: 'MEMORY_MODEL_CONFIGURATION_INVALID' };
      if (expired()) return retry('MEMORY_HOST_WINDOW_ENDED');
      await memory.hosted.close(); memory = undefined;
      memory = await openQuellightMemory({ stores, ownerActorId: job.actor_id,
        conversationId: job.conversation_id, effective: job.configuration, modelFactory });
      // No artificial model duration/step budget. Native observation handles its own
      // threshold-driven reflection; manual reflection is used only for an explicit job.
      if (job.kind === 'reflect') await memory.service.reflect(request);
      else await memory.service.observe(request);
      return { state: 'completed' };
    } catch (error) {
      const code = errorCode(error);
      if (code && supersededCodes.has(code)) {
        try { return await supersedeAndEnqueue('MEMORY_SOURCE_SUPERSEDED'); }
        catch { return retry(); }
      }
      if (code && blockedCodes.has(code)) return { state: 'blocked', code };
      if (code === 'VICT_AGENT_THREAD_BUSY') return retry('MEMORY_CONVERSATION_BUSY');
      return retry();
    } finally {
      try { await memory?.hosted.close(); }
      finally { if (conversationLease) await stores.coordination.release(conversationLease); }
    }
  };
}
