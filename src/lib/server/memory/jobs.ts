import { createHash, randomUUID } from 'node:crypto';
import type { EffectiveMemorySettings, FencedMemorySettingsClient, MemorySettingsSqlClient } from './settings.js';

export type MemoryJobKind = 'observe' | 'reflect' | 'purge';
export type MemoryJobState = 'queued' | 'running' | 'retryable' | 'completed' | 'superseded' | 'blocked';
export interface MemoryJob {
  id: string; actor_id: string; conversation_id: string; kind: MemoryJobKind;
  source_revision: string; configuration_revision: string; configuration: EffectiveMemorySettings;
  authority_revision: string; state: MemoryJobState; attempts: number;
  claim_token: string | null; claim_expires: Date | null; failure_code: string | null;
  created_at: Date; updated_at: Date;
  supersedes_job_id: string | null;
}
export interface PublicMemorySource {
  id: string; turnId: string; role: 'user' | 'assistant'; text: string; at: string;
}
export const memoryDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Undefined is available only to explicitly unscoped internal/test compositions. */
export function validateDeliveryActor(actorId: string | undefined): string | undefined {
  if (actorId === undefined) return undefined;
  if (typeof actorId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(actorId))
    throw Object.assign(new Error('MEMORY_DELIVERY_ACTOR_INVALID'), { code: 'MEMORY_DELIVERY_ACTOR_INVALID' });
  return actorId.toLowerCase();
}
/** Personal-app production delivery always names its configured owner. */
export function requireDeliveryActor(actorId: string | undefined): string {
  const owner = validateDeliveryActor(actorId);
  if (!owner) throw Object.assign(new Error('MEMORY_DELIVERY_OWNER_REQUIRED'), { code: 'MEMORY_DELIVERY_OWNER_REQUIRED' });
  return owner;
}

/** Original public text only. Failed/partial assistant replies are not treated as settled facts. */
export async function publicConversationSources(client: MemorySettingsSqlClient, actorId: string, conversationId: string) {
  const rows = (await client.query(`SELECT turn_id,input_text,output_text,execution_state,error_code,created_at,updated_at
    FROM quellight_product_v1.conversation_turns WHERE actor_id=$1 AND conversation_id=$2
    AND execution_state IN ('settled','interrupted') ORDER BY created_at,turn_id`, [actorId, conversationId])).rows;
  const messages: PublicMemorySource[] = rows.flatMap(row => {
    const user: PublicMemorySource = { id: `${row.turn_id}:user`, turnId: row.turn_id, role: 'user', text: row.input_text, at: new Date(row.created_at).toISOString() };
    return [user, ...(row.execution_state === 'settled' && !row.error_code && row.output_text
      ? [{ id: `${row.turn_id}:assistant`, turnId: row.turn_id, role: 'assistant' as const, text: row.output_text, at: new Date(row.updated_at).toISOString() }] : [])];
  });
  return { messages, revision: memoryDigest(messages) };
}

/** Caller owns the conversation fence. Configuration and source identity never change on replay. */
export async function enqueueMemoryJob(client: FencedMemorySettingsClient, input: {
  actorId: string; conversationId: string; kind: MemoryJobKind; sourceRevision: string;
  configuration: EffectiveMemorySettings; authorityRevision: string;
  supersedesJobId?: string;
}) {
  if (input.kind !== 'purge' && !input.configuration.configuration.values.automaticLearning) return null;
  const id = randomUUID();
  const key = memoryDigest({ actorId: input.actorId, conversationId: input.conversationId, kind: input.kind,
    source: input.sourceRevision, configuration: input.configuration.revision, authority: input.authorityRevision,
    supersedes: input.supersedesJobId ?? null });
  const result = await client.query(`INSERT INTO quellight_product_v1.memory_jobs
    (id,actor_id,conversation_id,kind,job_key,source_revision,configuration_revision,configuration,authority_revision,supersedes_job_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) ON CONFLICT(actor_id,job_key) DO NOTHING RETURNING *`,
    [id, input.actorId, input.conversationId, input.kind, key, input.sourceRevision, input.configuration.revision, JSON.stringify(input.configuration), input.authorityRevision, input.supersedesJobId ?? null]);
  if (result.rows[0]) {
    await client.query("INSERT INTO quellight_product_v1.memory_job_events(job_id,state) VALUES($1,'queued')", [id]);
    return result.rows[0] as MemoryJob;
  }
  return (await client.query('SELECT * FROM quellight_product_v1.memory_jobs WHERE actor_id=$1 AND job_key=$2', [input.actorId, key])).rows[0] as MemoryJob;
}

/** Run inside the global dispatcher fence; row locks prevent duplicate delivery claims. */
export async function claimMemoryJob(client: FencedMemorySettingsClient, leaseUntil: Date, actorId?: string) {
  const owner = validateDeliveryActor(actorId) ?? null;
  const token = randomUUID();
  // A lost host is retried with the SAME operation/config identity. Native reconcile decides whether
  // it has a prepared publication, a safe retry, or a superseded result; queue expiry alone proves none.
  const expired = await client.query(`UPDATE quellight_product_v1.memory_jobs SET state='retryable',claim_token=NULL,claim_expires=NULL,
    failure_code='HOST_INTERRUPTED',wake_after=now(),updated_at=now() WHERE state='running' AND claim_expires<=now()
    AND ($1::uuid IS NULL OR actor_id=$1::uuid) RETURNING id`, [owner]);
  for (const row of expired.rows) await client.query("INSERT INTO quellight_product_v1.memory_job_events(job_id,state,code) VALUES($1,'retryable','HOST_INTERRUPTED')", [row.id]);
  // Native maintenance serializes the owner's shared resource even across conversations.
  // Avoid claiming another job that can only contend with that owner's active delivery;
  // other owners remain eligible. Native fences still decide whether execution is safe.
  const row = (await client.query(`UPDATE quellight_product_v1.memory_jobs SET state='running',attempts=attempts+1,
    claim_token=$1,claim_expires=$2,updated_at=now() WHERE id=(SELECT candidate.id FROM quellight_product_v1.memory_jobs candidate
    WHERE candidate.state IN ('queued','retryable') AND candidate.wake_after<=now()
    AND ($3::uuid IS NULL OR candidate.actor_id=$3::uuid)
    AND NOT EXISTS (SELECT 1 FROM quellight_product_v1.memory_jobs running
      WHERE running.actor_id=candidate.actor_id AND running.state='running' AND running.claim_expires>now())
    ORDER BY candidate.wake_after,candidate.created_at,candidate.id FOR UPDATE OF candidate SKIP LOCKED LIMIT 1) RETURNING *`, [token, leaseUntil, owner])).rows[0];
  if (!row) return null;
  await client.query("INSERT INTO quellight_product_v1.memory_job_events(job_id,state) VALUES($1,'running')", [row.id]);
  return row as MemoryJob;
}

/** A stale worker cannot settle a replacement claim. Retry delay is infrastructure backoff, not generation policy. */
export async function settleMemoryJob(client: FencedMemorySettingsClient, job: MemoryJob,
  state: Exclude<MemoryJobState, 'queued' | 'running'>, code: string | null = null, retryAt = new Date()) {
  const rows = (await client.query(`UPDATE quellight_product_v1.memory_jobs SET state=$3,claim_token=NULL,claim_expires=NULL,
    failure_code=$4,wake_after=$5,updated_at=now() WHERE id=$1 AND claim_token=$2 AND state='running' AND claim_expires>now() RETURNING id`,
    [job.id, job.claim_token, state, code, retryAt])).rows;
  if (!rows.length) return false;
  await client.query('INSERT INTO quellight_product_v1.memory_job_events(job_id,state,code) VALUES($1,$2,$3)', [job.id, state, code]);
  return true;
}

export async function memoryActivity(client: MemorySettingsSqlClient, actorId: string, conversationId: string) {
  return (await client.query(`SELECT e.id::text,j.id AS job_id,j.kind,e.state,e.code,e.at
    FROM quellight_product_v1.memory_job_events e JOIN quellight_product_v1.memory_jobs j ON j.id=e.job_id
    WHERE j.actor_id=$1 AND j.conversation_id=$2 ORDER BY e.at DESC,e.id DESC`, [actorId, conversationId])).rows;
}
