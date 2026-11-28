import { randomUUID } from 'node:crypto';
import { createRuntime } from '@victframework/runtime';
import { neutralJsonContract } from '@victframework/sdk';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import type { RoomLearningAction, RoomLearningField, RoomLearningView } from '../../product/room-learning.js';
import { authorizedActor, getConversation, ProductError, type Conversation, type Owner } from '../domain/queries.js';
import { memoryCareScope } from '../memory/authority-fence.js';
import { executeMemoryCareAction } from '../memory/care-actions.js';
import { unavailableThread } from '../memory/inspection.js';
import { memoryDigest } from '../memory/jobs.js';
import { openQuellightMemory, QUELLIGHT_NATIVE_MEMORY_SCHEMA } from '../memory/native.js';
import { loadEffectiveMemorySettings } from '../memory/settings.js';
import { availableFields, dimensions, fieldText, roomConversations, roomLearningRevisions, roomMarker, roomRevision,
  writeRoomRevision, type RoomRevision } from './store.js';

type Authority = { revision: string; excludedMessageIds: readonly string[]; quarantinedMessageIds?: readonly string[] };
const validRevision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;
const validAuthority = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 160 && /^[a-zA-Z0-9:_-]+$/.test(value);
const roomSources = (authority: Authority) => new Set([...authority.excludedMessageIds, ...(authority.quarantinedMessageIds ?? [])]);

async function authorityFor(stores: PostgresStoreSet, owner: Owner, conversation: Conversation): Promise<Authority> {
  const client = stores.coordination.pool;
  const effective = await loadEffectiveMemorySettings(client, owner.actorId, conversation.roomId);
  const prior = (await client.query('SELECT i.conversation_id FROM quellight_product_v1.memory_imports i ' +
    'JOIN quellight_product_v1.conversations c ON c.actor_id=i.actor_id AND c.id=i.conversation_id ' +
    'WHERE i.actor_id=$1 AND c.room_id=$2 AND i.schema_name=$3 ORDER BY (c.id=$4) DESC,c.created_at DESC LIMIT 1',
    [owner.actorId, conversation.roomId, QUELLIGHT_NATIVE_MEMORY_SCHEMA, conversation.id])).rows[0]?.conversation_id;
  const id = prior ?? conversation.id;
  const memory = await openQuellightMemory({ stores, ownerActorId: owner.actorId, conversationId: id, effective });
  try { return await memory.service.authority(id); }
  catch (error) {
    if (!unavailableThread(error)) throw error;
    return { revision: '0', excludedMessageIds: [] };
  } finally { await memory.hosted.close(); }
}

export async function inspectRoomLearning(stores: PostgresStoreSet, owner: Owner, conversationId: string): Promise<RoomLearningView> {
  const conversation = await getConversation(stores, owner, conversationId);
  await authorizedActor(stores, owner, 'app.data.read');
  const client = stores.coordination.pool;
  const { roomId } = conversation;
  const initial = await authorityFor(stores, owner, conversation);
  const marker = await roomMarker(client, owner.actorId, roomId);
  const history = (await client.query('SELECT revision,previous_revision,authority_revision,kind,fields,changed,created_at FROM ' +
    roomLearningRevisions + ' WHERE actor_id=$1 AND room_id=$2 AND revision<=$3 ORDER BY revision DESC LIMIT 30',
    [owner.actorId, roomId, marker.room_guidance_revision])).rows as unknown as RoomRevision[];
  const scoped = await roomConversations(client, owner.actorId, roomId);
  const after = await authorityFor(stores, owner, conversation);
  const last = await roomMarker(client, owner.actorId, roomId);
  if (after.revision !== initial.revision || marker.room_guidance_revision !== last.room_guidance_revision)
    throw new ProductError('ROOM_GUIDANCE_CHANGED', 409);
  const excluded = roomSources(after);
  const current = marker.room_guidance_authority === after.revision ? history[0] : undefined;
  const fields = current ? availableFields(current.fields, excluded, scoped) : [];
  return { roomId, revision: marker.room_guidance_revision, authorityRevision: after.revision,
    fields: fields.map(({ sources, ...field }) => ({ ...field, sources: sources.map(({ id, conversationId, quote }) => ({ id, conversationId, quote })) })),
    history: history.map(item => {
      const eligible = item.fields.length > 0 && availableFields(item.fields, excluded, scoped).length === item.fields.length;
      return { revision: item.revision, previousRevision: item.previous_revision, kind: item.kind,
        changedAt: item.created_at.toISOString(), changed: item.changed, eligible,
        ...(eligible ? { fields: item.fields.map(({ dimension, text, origin, certainty }) => ({ dimension, text, origin, certainty })) } : {}) };
    }) };
}

interface CommonInput { expectedRevision: number; expectedAuthorityRevision: string }
type ActionInput = CommonInput & (
  { action: 'correct'; dimension: RoomLearningField['dimension']; text: string } |
  { action: 'forget'; sourceId: string; sourceConversationId: string } |
  { action: 'restore'; revision: number }
);

function actionInput(action: RoomLearningAction, value: unknown): ActionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ProductError('ROOM_GUIDANCE_INPUT_INVALID');
  const row = value as Record<string, unknown>;
  const base = new Set(['expectedRevision', 'expectedAuthorityRevision']);
  const additional = action === 'correct' ? ['dimension', 'text'] : action === 'forget' ? ['sourceId', 'sourceConversationId']
    : action === 'restore' ? ['revision'] : [];
  additional.forEach(key => base.add(key));
  const revision = row.expectedRevision, authority = row.expectedAuthorityRevision;
  if (Object.keys(row).length !== base.size || Object.keys(row).some(key => !base.has(key)) ||
    !validRevision(revision) || !validAuthority(authority)) throw new ProductError('ROOM_GUIDANCE_INPUT_INVALID');
  const common = { expectedRevision: revision, expectedAuthorityRevision: authority };
  if (action === 'correct') {
    const text = fieldText(row.text);
    if (text && dimensions.includes(row.dimension as RoomLearningField['dimension']))
      return { ...common, action, dimension: row.dimension as RoomLearningField['dimension'], text };
  }
  if (action === 'restore' && validRevision(row.revision) && row.revision > 0) return { ...common, action, revision: row.revision };
  if (action === 'forget' && typeof row.sourceId === 'string' && row.sourceId.length <= 256 && /^[^\s\0]+$/.test(row.sourceId) &&
    typeof row.sourceConversationId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.sourceConversationId))
    return { ...common, action, sourceId: row.sourceId, sourceConversationId: row.sourceConversationId };
  throw new ProductError('ROOM_GUIDANCE_INPUT_INVALID');
}

type ActionResult = { revision: number; authorityRevision: string };
export async function executeRoomLearningAction(stores: PostgresStoreSet, owner: Owner,
  conversationId: string, action: RoomLearningAction, input: unknown, key: string): Promise<{
    ok: true; value: ActionResult; replay: boolean;
  }> {
  if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(key)) throw new ProductError('ACTION_KEY_INVALID');
  const value = actionInput(action, input);
  const conversation = await getConversation(stores, owner, conversationId);
  await authorizedActor(stores, owner, 'app.data.write');
  const { roomId } = conversation;
  const client = stores.coordination.pool;
  if (value.action === 'forget') {
    const source = await getConversation(stores, owner, value.sourceConversationId);
    if (source.roomId !== roomId) throw new ProductError('ROOM_GUIDANCE_SOURCE_NOT_FOUND', 404);
    const result = await executeMemoryCareAction(stores, owner, 'memory.forget', { conversationId: source.id,
      expectedAuthorityRevision: value.expectedAuthorityRevision, sourceMessageIds: JSON.stringify([value.sourceId]) }, key,
    { beforePrepare: async () => {
      const marker = await roomMarker(client, owner.actorId, roomId);
      if (marker.room_guidance_revision !== value.expectedRevision) throw new ProductError('ROOM_GUIDANCE_CHANGED', 409);
      const revision = await roomRevision(client, owner.actorId, roomId, marker.room_guidance_revision);
      if (!revision?.fields.some(field => field.sources.some(ref => ref.id === value.sourceId && ref.conversationId === source.id)))
        throw new ProductError('ROOM_GUIDANCE_SOURCE_NOT_FOUND', 404);
    } });
    return { ok: true, value: { revision: (await roomMarker(client, owner.actorId, roomId)).room_guidance_revision,
      authorityRevision: result.value.authorityRevision }, replay: result.replay };
  }
  const claim = await stores.coordination.acquire({ scopeId: memoryCareScope(owner.actorId), actorId: owner.actorId,
    ownerId: randomUUID(), leaseMs: 60_000 });
  if (claim.status !== 'acquired') throw new ProductError('MEMORY_CARE_IN_PROGRESS', 409);
  const digest = memoryDigest([roomId, value]);
  const runId = 'room-learning-care:' + randomUUID();
  const id = 'quellight.room-learning.' + value.action;
  const fenced = stores.forLease(claim.lease);
  let failure: unknown;
  try {
    const authority = await authorityFor(stores, owner, conversation);
    const runtime = createRuntime({ stores: fenced, ids: { runId: () => runId }, payloadRetention: 'full', authority: { grants: [id] } });
    runtime.registerCapability({ id, revision: '1', effect: 'write', permissions: [id], input: neutralJsonContract, output: neutralJsonContract,
      invoke: () => stores.coordination.withFence(claim.lease, async db => {
        try {
            const receipt = (await db.query('SELECT result,argument_digest FROM quellight_product_v1.command_receipts WHERE actor_id=$1 AND command_key=$2',
              [owner.actorId, key])).rows[0];
            if (receipt) {
              if (receipt.argument_digest !== digest) throw new ProductError('ACTION_CONFLICT', 409);
              return { replay: true, value: receipt.result };
            }
            if (authority.revision !== value.expectedAuthorityRevision) throw new ProductError('ROOM_GUIDANCE_CHANGED', 409);
            const marker = await roomMarker(db, owner.actorId, roomId, true);
            if (marker.room_guidance_revision !== value.expectedRevision ||
              marker.room_guidance_revision > 0 && marker.room_guidance_authority !== authority.revision)
              throw new ProductError('ROOM_GUIDANCE_CHANGED', 409);
            const previous = (await roomRevision(db, owner.actorId, roomId, marker.room_guidance_revision))?.fields ?? [];
            const scoped = await roomConversations(db, owner.actorId, roomId);
            let fields = availableFields(previous, roomSources(authority), scoped);
            let changed: string[];
            if (value.action === 'correct') {
              const corrected: RoomLearningField = { dimension: value.dimension, text: value.text, certainty: 'stated', origin: 'owner', sources: [] };
              fields = dimensions.flatMap(dimension => dimension === value.dimension ? [corrected] : fields.filter(field => field.dimension === dimension));
              changed = [value.dimension];
            } else {
              const old = await roomRevision(db, owner.actorId, roomId, value.revision);
              const eligible = old && availableFields(old.fields, roomSources(authority), scoped);
              if (!old || !eligible?.length || eligible.length !== old.fields.length)
                throw new ProductError('ROOM_GUIDANCE_RESTORE_INELIGIBLE', 409);
              fields = eligible;
              changed = dimensions.filter(dimension => JSON.stringify(previous.find(field => field.dimension === dimension)) !==
                JSON.stringify(fields.find(field => field.dimension === dimension)));
            }
            const saved = await writeRoomRevision(db, { actorId: owner.actorId, roomId, authorityRevision: authority.revision,
              previousRevision: marker.room_guidance_revision, kind: value.action === 'correct' ? 'corrected' : 'restored', fields, changed });
            await db.query('INSERT INTO quellight_product_v1.command_receipts(actor_id,command_key,argument_digest,result) VALUES($1,$2,$3,$4::jsonb)',
              [owner.actorId, key, digest, JSON.stringify(saved)]);
            return { replay: false, value: saved };
        } catch (error) {
          if (error instanceof ProductError) failure = error;
          throw error;
        }
      }) });
    const activation = await runtime.activate({ id, entry: 'write', nodes: [{ id: 'write', capability: id }], edges: [] });
    if (!activation.ok) throw new ProductError('ROOM_GUIDANCE_UNAVAILABLE', 503);
    try { await runtime.run({ roomId, ...value }, { mode: 'normal' }); }
    catch (error) { throw failure ?? error; }
    const result = await fenced.execution.getRun(runId);
    if (result?.status !== 'completed') throw failure ?? new ProductError('ROOM_GUIDANCE_UNAVAILABLE', 503);
    return { ok: true, ...result.output as { value: ActionResult; replay: boolean } };
  } finally { await stores.coordination.release(claim.lease); }
}
