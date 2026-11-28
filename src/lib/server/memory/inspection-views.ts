import { assertActorScope } from '@victframework/runtime';
import { mastraResourceIdForActor, mastraThreadIdForConversation } from '@victframework/mastra';
import type { MemoryStorage } from '@mastra/core/storage';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import type { MemoryContextResult, MemoryReplyPage, MemorySourcesPage, MemorySummary } from '../../product/memory-client.js';
import { authorizedActor, getConversation, ProductError, type Conversation, type Owner } from '../domain/queries.js';
import { loadEffectiveMemorySettings } from './settings.js';
import { memoryDigest } from './jobs.js';
import { openQuellightMemory } from './native.js';
import { appendNativeActivity, date, memoryContext, memorySources, policyIdentity, queueLabels, unavailableThread } from './inspection.js';

const product = 'quellight_product_v1';
const sourcePageSize = 30;
const replyPageSize = 30;
const observationPreviewSize = 8;
const repliesWhere = `actor_id=$1 AND conversation_id=$2 AND memory_configuration IS NOT NULL AND execution_state='settled' AND error_code IS NULL`;

/** A compact product revision. Native authority is verified separately for each content read. */
async function version(stores: PostgresStoreSet, owner: Owner, conversation: Conversation) {
  const { rows: [marker] } = await stores.coordination.pool.query(`SELECT
    (SELECT updated_at::text FROM ${product}.conversations WHERE actor_id=$1 AND id=$2) AS conversation_version,
    (SELECT revision FROM ${product}.rooms WHERE actor_id=$1 AND id=$3) AS room_revision,
    (SELECT revision FROM ${product}.memory_settings_heads WHERE actor_id=$1 AND scope_key='app') AS app_settings,
    (SELECT revision FROM ${product}.memory_settings_heads WHERE actor_id=$1 AND scope_key=$3::uuid::text) AS room_settings,
    (SELECT max(updated_at)::text FROM ${product}.memory_jobs WHERE actor_id=$1) AS job_version,
    (SELECT max(updated_at)::text FROM ${product}.memory_care_commands WHERE actor_id=$1) AS care_version`,
  [owner.actorId, conversation.id, conversation.roomId]);
  if (!marker?.conversation_version) throw new ProductError('CONVERSATION_NOT_FOUND', 404);
  return memoryDigest([owner.actorId, conversation.id, marker]);
}

export async function memoryInspectionVersion(stores: PostgresStoreSet, owner: Owner, conversationId: string) {
  const conversation = await getConversation(stores, owner, conversationId);
  return { version: await version(stores, owner, conversation) };
}

function cursorValue(cursor: string, maxLength = 384): string {
  if (cursor.length > maxLength || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new ProductError('CURSOR_INVALID');
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!decoded || decoded.includes('\0') || Buffer.from(decoded).toString('base64url') !== cursor) throw new ProductError('CURSOR_INVALID');
  return decoded;
}

async function replyPage(stores: PostgresStoreSet, owner: Owner, conversationId: string, cursor?: string): Promise<MemoryReplyPage> {
  const anchor = cursor === undefined ? null : cursorValue(cursor);
  const { rows } = await stores.coordination.pool.query<{ turn_id: string; created_at: Date }>(`SELECT turn_id,created_at
    FROM ${product}.conversation_turns WHERE ${repliesWhere} AND ($3::text IS NULL OR (created_at,turn_id) <
      (SELECT created_at,turn_id FROM ${product}.conversation_turns WHERE ${repliesWhere} AND turn_id=$3))
    ORDER BY created_at DESC,turn_id DESC LIMIT $4`, [owner.actorId, conversationId, anchor, replyPageSize + 1]);
  const replies = rows.slice(0, replyPageSize).map(row => ({ turnId: row.turn_id,
    label: `Reply · ${date(row.created_at)?.replace('T', ' ').slice(0, 16) ?? 'Saved conversation'}` }));
  return { replies, nextCursor: rows.length > replyPageSize ? Buffer.from(replies.at(-1)!.turnId).toString('base64url') : null };
}

export async function memoryReplyPage(stores: PostgresStoreSet, owner: Owner, conversationId: string, cursor?: string) {
  await getConversation(stores, owner, conversationId);
  return replyPage(stores, owner, conversationId, cursor);
}

async function openInspection(stores: PostgresStoreSet, owner: Owner, conversation: Conversation) {
  const effective = await loadEffectiveMemorySettings(stores.coordination.pool, owner.actorId, conversation.roomId);
  return openQuellightMemory({ stores, ownerActorId: owner.actorId, conversationId: conversation.id, effective });
}

function nativeIds(owner: Owner, conversationId: string) {
  return [mastraThreadIdForConversation(conversationId), mastraResourceIdForActor(owner.actorId)] as const;
}

interface SourcePosition { at: number; id: string }

async function sourceWindow(domain: MemoryStorage, threadId: string, resourceId: string, anchor: number, after?: SourcePosition) {
  const scope = { threadId, resourceId, orderBy: { field: 'createdAt', direction: 'ASC' } } as const;
  const requested = sourcePageSize + 1;
  const readBucket = (at: number) => domain.listMessages({ ...scope, perPage: false,
    filter: { dateRange: { start: new Date(at), end: new Date(at < anchor ? at + 1 : anchor), endExclusive: at < anchor } } });
  const byId = <T extends { id: string }>(a: T, b: T) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

  // The native page is sorted only by timestamp at the SQL boundary. Finish
  // a tied millisecond in ID order before advancing to later timestamps.
  const preceding = after ? (await readBucket(after.at)).messages.filter(message => message.id > after.id).sort(byId) : [];
  if (preceding.length >= requested || after?.at === anchor) return preceding.slice(0, requested);
  const queryLimit = requested - preceding.length;
  const probe = await domain.listMessages({ ...scope, perPage: queryLimit,
    filter: { dateRange: { ...(after ? { start: new Date(after.at + 1) } : {}), end: new Date(anchor) } } });
  // Only a split boundary needs one additional native query. Reading a full
  // millisecond interval also covers sub-millisecond server timestamps that
  // the public JavaScript Date representation rounds to the same value.
  const boundary = probe.messages.at(-1);
  if (!boundary || !probe.hasMore) return [...preceding, ...probe.messages.sort((a, b) => +a.createdAt - +b.createdAt || byId(a, b))];
  const splitAt = +boundary.createdAt;
  const complete = probe.messages.filter(message => +message.createdAt < splitAt).sort((a, b) => +a.createdAt - +b.createdAt || byId(a, b));
  const tied = (await readBucket(splitAt)).messages.sort(byId);
  return [...preceding, ...complete, ...tied].slice(0, requested);
}

export async function memorySourcePage(stores: PostgresStoreSet, owner: Owner, conversationId: string, cursor?: string): Promise<MemorySourcesPage> {
  const conversation = await getConversation(stores, owner, conversationId);
  const native = await openInspection(stores, owner, conversation);
  const [threadId, resourceId] = nativeIds(owner, conversationId);
  try {
    const authority = await native.service.authority(conversationId);
    const identity = memoryDigest(policyIdentity(authority));
    let anchor = Date.now(), after: SourcePosition | undefined;
    if (cursor !== undefined) {
      let values: unknown;
      try { values = JSON.parse(cursorValue(cursor, 8192)); } catch { throw new ProductError('CURSOR_INVALID'); }
      if (!Array.isArray(values) || values.length !== 5 || values[0] !== conversationId ||
        !Number.isSafeInteger(values[1]) || values[1] < 0 || values[1] > Date.now() + 60_000 ||
        !Number.isSafeInteger(values[2]) || values[2] < -8_640_000_000_000_000 || values[2] > values[1] ||
        typeof values[3] !== 'string' || !values[3] || values[3].length > 1024 || values[3].includes('\0')) throw new ProductError('CURSOR_INVALID');
      if (values[4] !== identity) throw new ProductError('MEMORY_CHANGED', 409);
      anchor = values[1];
      after = { at: values[2], id: values[3] };
    }
    const listed = await native.hosted.store.readNativeMemory(threadId, resourceId, async () => {
      const domain = await native.hosted.store.getStore('memory');
      if (!domain) throw new ProductError('MEMORY_UNAVAILABLE', 503);
      return sourceWindow(domain, threadId, resourceId, anchor, after);
    });
    if (policyIdentity(await native.service.authority(conversationId)) !== policyIdentity(authority)) throw new ProductError('MEMORY_CHANGED', 409);
    const page = listed.slice(0, sourcePageSize);
    const last = page.at(-1);
    const nextCursor = last && listed.length > sourcePageSize
      ? Buffer.from(JSON.stringify([conversationId, anchor, +last.createdAt, last.id, identity])).toString('base64url') : null;
    return { sources: memorySources(page, conversationId, authority), nextCursor, authorityRevision: authority.revision };
  } catch (error) {
    if (!unavailableThread(error)) throw error;
    return { sources: [], nextCursor: null, authorityRevision: '0' };
  } finally { await native.hosted.close(); }
}

export async function memoryReplyContext(stores: PostgresStoreSet, owner: Owner, conversationId: string, turnId: string): Promise<MemoryContextResult> {
  const conversation = await getConversation(stores, owner, conversationId);
  if (!turnId || turnId.length > 160 || turnId.includes('\0')) throw new ProductError('TURN_NOT_FOUND', 404);
  const { rows } = await stores.coordination.pool.query<{ room_guidance_revision: number | null }>(`SELECT room_guidance_revision FROM ${product}.conversation_turns WHERE ${repliesWhere} AND turn_id=$3`,
    [owner.actorId, conversationId, turnId]);
  if (!rows.length) throw new ProductError('TURN_NOT_FOUND', 404);
  const native = await openInspection(stores, owner, conversation);
  try {
    const authority = await native.service.authority(conversationId);
    const selection = await native.service.selectedContext(conversationId, turnId);
    if (policyIdentity(await native.service.authority(conversationId)) !== policyIdentity(authority)) throw new ProductError('MEMORY_CHANGED', 409);
    return { context: memoryContext(selection, turnId), authorityRevision: authority.revision, roomGuidanceRevision: rows[0].room_guidance_revision };
  } catch (error) {
    if (!unavailableThread(error)) throw error;
    return { context: memoryContext(null, turnId), authorityRevision: '0', roomGuidanceRevision: rows[0].room_guidance_revision };
  } finally { await native.hosted.close(); }
}

type NativeInspection = Awaited<ReturnType<typeof openQuellightMemory>>;
type SnapshotAuthority = Awaited<ReturnType<NativeInspection['hosted']['store']['nativeAuthority']>>;
function observationAuthorityIdentity(authority: SnapshotAuthority, threadId: string) {
  return JSON.stringify([authority.revision, authority.threadRevisions[threadId], authority.workingMemoryRevision, authority.correctedWorkingMemory]);
}
async function assertObservationAuthority(native: NativeInspection, owner: Owner, conversationId: string, expected: SnapshotAuthority) {
  const [threadId, resourceId] = nativeIds(owner, conversationId);
  const store = native.hosted.store;
  const after = await store.readNativeMemory(threadId, resourceId, () => store.nativeAuthority());
  if (observationAuthorityIdentity(after, threadId) !== observationAuthorityIdentity(expected, threadId)) throw new ProductError('MEMORY_CHANGED', 409);
}
async function observationSnapshot(native: NativeInspection, owner: Owner, conversationId: string, fullHistory = false) {
  const [threadId, resourceId] = nativeIds(owner, conversationId);
  const store = native.hosted.store;
  return store.readNativeMemory(threadId, resourceId, async () => {
    const authority = await store.nativeAuthority();
    const domain = await store.getStore('memory');
    if (!domain) throw new ProductError('MEMORY_UNAVAILABLE', 503);
    // The native authority revision governs visibility of both learned stores.
    const current = authority.threadRevisions[threadId] === authority.revision
      ? await domain.getObservationalMemory(threadId, resourceId) : null;
    const [history, resource] = await Promise.all([
      current ? domain.getObservationalMemoryHistory(threadId, resourceId, fullHistory ? current.generationCount + 2 : observationPreviewSize + 1) : [],
      domain.getResourceById({ resourceId }),
    ]);
    return { authority, current, history: history.filter(item => item.id !== current?.id), resource };
  });
}

const observation = (item: { id: string; activeObservations: string; updatedAt: Date }) =>
  ({ id: item.id, text: item.activeObservations, updatedAt: date(item.updatedAt) });

export async function memoryObservationHistory(stores: PostgresStoreSet, owner: Owner, conversationId: string) {
  const conversation = await getConversation(stores, owner, conversationId);
  const native = await openInspection(stores, owner, conversation);
  try {
    const snapshot = await observationSnapshot(native, owner, conversationId, true);
    await assertObservationAuthority(native, owner, conversationId, snapshot.authority);
    return { history: snapshot.history.map(observation), authorityRevision: snapshot.authority.revision };
  } catch (error) {
    if (!unavailableThread(error)) throw error;
    return { history: [], authorityRevision: '0' };
  } finally { await native.hosted.close(); }
}

export async function memoryInspectionSummary(stores: PostgresStoreSet, owner: Owner, conversationId: string): Promise<MemorySummary> {
  const conversation = await getConversation(stores, owner, conversationId);
  const marker = await version(stores, owner, conversation);
  const actor = await authorizedActor(stores, owner, 'app.data.read');
  let canWrite = false;
  try { assertActorScope(actor, 'app.data.write'); canWrite = true; } catch { /* Read-only inspection. */ }
  const client = stores.coordination.pool;
  const effective = await loadEffectiveMemorySettings(client, owner.actorId, conversation.roomId);
  const args = [owner.actorId, conversationId];
  const [jobs, page, events, care] = await Promise.all([
    client.query(`SELECT id,state FROM ${product}.memory_jobs WHERE actor_id=$1 AND conversation_id=$2
      ORDER BY CASE state WHEN 'blocked' THEN 0 WHEN 'retryable' THEN 1 WHEN 'running' THEN 2 WHEN 'queued' THEN 3 ELSE 4 END, created_at DESC,id LIMIT 4`, args),
    replyPage(stores, owner, conversationId),
    client.query(`SELECT e.id::text,e.state,e.at FROM ${product}.memory_job_events e
      JOIN ${product}.memory_jobs j ON j.id=e.job_id WHERE j.actor_id=$1 AND j.conversation_id=$2 ORDER BY e.at DESC,e.id DESC LIMIT 24`, args),
    client.query(`SELECT command_key,conversation_id,state,updated_at FROM ${product}.memory_care_commands
      WHERE actor_id=$1 AND (conversation_id=$2 OR state<>'applied') ORDER BY (state='applied'),created_at DESC,command_key LIMIT 12`, args),
  ]);
  const unfinishedCare = care.rows.find(row => row.state !== 'applied');
  const activeJob = jobs.rows.find(row => ['blocked', 'retryable', 'running', 'queued'].includes(row.state));
  const canRetry = canWrite && unfinishedCare?.state !== 'blocked' && (unfinishedCare?.state === 'retryable' || ['blocked', 'retryable'].includes(activeJob?.state));
  const dto: MemorySummary = {
    conversationId, version: marker, repliesCursor: page.nextCursor, moreObservations: false,
    statusLabel: effective.configuration.values.automaticLearning ? 'No observations yet' : 'Automatic learning is off',
    observations: { id: null, text: '', updatedAt: null, emptyText: 'There are no saved observations for this conversation yet.', history: [], prepared: [] },
    personal: { text: '', updatedAt: null, enabled: effective.configuration.values.personalPreferences, ownerManaged: false },
    activity: events.rows.map(row => ({ id: `job-event:${row.id}`, label: queueLabels[row.state] ?? 'Memory activity', status: row.state, at: date(row.at) })),
    sources: [], replies: page.replies, context: null, authority: { revision: '0', excludedMessageIds: [] },
    controls: { canCorrect: false, canForget: false, canRetry },
  };
  for (const row of care.rows) dto.activity.push({ id: `care:${row.command_key}`, status: row.state, at: date(row.updated_at),
    label: row.state === 'applied' ? 'Memory change applied' : row.state === 'blocked' ? 'Memory change needs attention'
      : row.state === 'retryable' ? 'Memory change waiting to retry'
      : row.conversation_id === conversationId ? 'Applying your memory change' : 'A memory change in another conversation is pending' });
  if (unfinishedCare) dto.statusLabel = unfinishedCare.state === 'blocked' ? 'A memory change needs attention' : 'Your memory change is still finishing';
  else if (activeJob) dto.statusLabel = queueLabels[activeJob.state];

  const native = await openQuellightMemory({ stores, ownerActorId: owner.actorId, conversationId, effective });
  try {
    const { authority, current, history, resource } = await observationSnapshot(native, owner, conversationId);
    dto.authority.revision = authority.revision;
    dto.personal.ownerManaged = authority.correctedWorkingMemory !== null;
    dto.personal.text = authority.correctedWorkingMemory ?? (authority.workingMemoryRevision === authority.revision ? resource?.workingMemory ?? '' : '');
    dto.personal.updatedAt = dto.personal.ownerManaged || !dto.personal.text ? null : date(resource?.updatedAt);
    if (current) {
      Object.assign(dto.observations, observation(current));
      if (!unfinishedCare && !activeJob) dto.statusLabel = 'Saved memory';
    }
    dto.observations.history = history.slice(0, observationPreviewSize).map(observation);
    dto.moreObservations = history.length > observationPreviewSize || (current?.generationCount ?? 0) > observationPreviewSize;
    const operations = await Promise.all(jobs.rows.map(row => native.service.operation(conversationId, `memory-job:${row.id}`)));
    operations.forEach((operation, index) => { if (operation) appendNativeActivity(dto, jobs.rows[index].id, operation); });
    // Operations can expose prepared memory. Fence that projection again after reading them.
    await assertObservationAuthority(native, owner, conversationId, authority);
    dto.controls.canCorrect = canWrite && !unfinishedCare;
    dto.controls.canForget = canWrite && !unfinishedCare;
  } catch (error) {
    if (!unavailableThread(error)) throw error;
    dto.observations.emptyText = 'Memory for this conversation is not available to inspect yet.';
    dto.controls.canRetry = false;
    if (!unfinishedCare && !jobs.rows.length) dto.statusLabel = 'Memory is not available';
  } finally { await native.hosted.close(); }
  dto.activity.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '') || a.id.localeCompare(b.id));
  return dto;
}
