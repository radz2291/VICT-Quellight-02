import { ProductError } from '../domain/queries.js';
import type { FencedMemorySettingsClient, MemorySettingsSqlClient } from '../memory/settings.js';
import type { RoomLearningField, RoomLearningView } from '../../product/room-learning.js';

export const roomLearningRevisions = 'quellight_product_v1.room_learning_revisions';
export const roomLearningJobs = 'quellight_product_v1.room_learning_jobs';
export const dimensions = ['understanding', 'intent', 'attunement'] as const;
export const fieldBytes = 105;
const names = { understanding: 'Understanding', intent: 'Intent', attunement: 'Attunement' };
type ChangeKind = RoomLearningView['history'][number]['kind'];

interface RoomMarker {
  room_guidance_revision: number;
  room_guidance_authority: string | null;
}
export interface RoomRevision {
  revision: number;
  previous_revision: number;
  authority_revision: string;
  kind: ChangeKind;
  fields: RoomLearningField[];
  changed: string[];
  created_at: Date;
}

export function fieldText(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim().normalize('NFC');
  if (!value || Buffer.byteLength(value) > fieldBytes || /[<>\x00-\x1f\\]/.test(value)) return null;
  return value;
}

/** Compact application-owned context. Sources, provenance and change history stay in the inspector. */
export function roomGuidanceBlock(fields: readonly RoomLearningField[]) {
  if (!fields.length) return null;
  const lines = fields.map(field => names[field.dimension] + ': ' + (field.certainty === 'tentative' ? '? ' : '') + field.text);
  const block = '<room-guidance>\n' + lines.join('\n') + '\n</room-guidance>';
  if (Buffer.byteLength(block) > 400 || Buffer.byteLength(JSON.stringify([{ b: block, r: 2147483647 }])) > 512)
    throw new ProductError('ROOM_GUIDANCE_CONTEXT_TOO_LARGE', 400);
  return block;
}

export async function readRoomGuidance(client: MemorySettingsSqlClient, actorId: string, conversationId: string,
  authorityRevision: string): Promise<{ block: string; revision: number } | null> {
  const result = await client.query(
    'SELECT v.block AS b, v.revision AS r FROM quellight_product_v1.conversations c ' +
    'JOIN quellight_product_v1.rooms r ON r.actor_id=c.actor_id AND r.id=c.room_id ' +
    'JOIN ' + roomLearningRevisions + ' v ON v.actor_id=r.actor_id AND v.room_id=r.id AND v.revision=r.room_guidance_revision ' +
    'WHERE c.actor_id=$1 AND c.id=$2 AND c.archived_at IS NULL AND r.archived_at IS NULL ' +
    'AND r.room_guidance_available AND r.room_guidance_authority=$3 AND v.authority_revision=$3 AND v.block IS NOT NULL',
    [actorId, conversationId, authorityRevision]);
  const row = result.rows[0];
  return row ? { block: row.b as string, revision: row.r as number } : null;
}

export async function roomMarker(client: MemorySettingsSqlClient, actorId: string, roomId: string, lock = false): Promise<RoomMarker> {
  const row = (await client.query('SELECT room_guidance_revision,room_guidance_authority FROM quellight_product_v1.rooms ' +
    'WHERE actor_id=$1 AND id=$2 AND archived_at IS NULL' + (lock ? ' FOR UPDATE' : ''), [actorId, roomId])).rows[0];
  if (!row) throw new ProductError('ROOM_NOT_FOUND', 404);
  return row as unknown as RoomMarker;
}

export async function roomRevision(client: MemorySettingsSqlClient, actorId: string, roomId: string, revision: number): Promise<RoomRevision | null> {
  if (revision === 0) return null;
  return (await client.query('SELECT revision,previous_revision,authority_revision,kind,fields,changed,created_at FROM ' +
    roomLearningRevisions + ' WHERE actor_id=$1 AND room_id=$2 AND revision=$3', [actorId, roomId, revision]))
    .rows[0] as unknown as RoomRevision ?? null;
}

export function availableFields(fields: readonly RoomLearningField[], excluded: ReadonlySet<string>,
  currentConversations?: ReadonlySet<string>) {
  return fields.filter(field => field.sources.every(source =>
    !excluded.has(source.id) && (currentConversations === undefined || currentConversations.has(source.conversationId))));
}

export async function roomConversations(client: MemorySettingsSqlClient, actorId: string, roomId: string) {
  return new Set<string>((await client.query('SELECT id FROM quellight_product_v1.conversations ' +
    'WHERE actor_id=$1 AND room_id=$2 AND archived_at IS NULL', [actorId, roomId])).rows.map(row => row.id));
}

export async function writeRoomRevision(client: FencedMemorySettingsClient, args: {
  actorId: string; roomId: string; authorityRevision: string; previousRevision: number; kind: ChangeKind;
  fields: readonly RoomLearningField[]; changed: readonly string[]; sourceRevision?: string; jobId?: string; executionRef?: unknown;
}) {
  const { actorId, roomId, authorityRevision, previousRevision, kind, fields, changed, sourceRevision, jobId, executionRef } = args;
  const revision = previousRevision + 1;
  const block = roomGuidanceBlock(fields);
  await client.query('INSERT INTO ' + roomLearningRevisions +
    '(actor_id,room_id,revision,previous_revision,authority_revision,kind,fields,changed,block,source_revision,job_id,execution_ref) ' +
    'VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12::jsonb)',
    [actorId, roomId, revision, previousRevision, authorityRevision, kind, JSON.stringify(fields), changed, block,
      sourceRevision ?? null, jobId ?? null, JSON.stringify(executionRef ?? null)]);
  const result = await client.query('UPDATE quellight_product_v1.rooms SET room_guidance_revision=$3,' +
    'room_guidance_authority=$4,room_guidance_available=$5 WHERE actor_id=$1 AND id=$2 AND room_guidance_revision=$6 RETURNING id',
    [actorId, roomId, revision, authorityRevision, block !== null, previousRevision]);
  if (!result.rows.length) throw new ProductError('ROOM_GUIDANCE_CHANGED', 409);
  return { revision, authorityRevision };
}

/** Runs inside existing durable native-care settlement while its owner authority lease is fenced. */
export async function rebaseRoomGuidanceAfterCare(client: FencedMemorySettingsClient, actorId: string,
  authorityRevision: string, excludedIds: readonly string[]) {
  await client.query('UPDATE ' + roomLearningJobs + ' SET state=$3,failure_code=$4,updated_at=now() ' +
    'WHERE actor_id=$1 AND authority_revision<>$2 AND state IN ($5,$6)',
    [actorId, authorityRevision, 'superseded', 'ROOM_GUIDANCE_AUTHORITY_CHANGED', 'pending', 'prepared']);
  const rows = (await client.query('SELECT id,room_guidance_revision,room_guidance_authority FROM quellight_product_v1.rooms ' +
    'WHERE actor_id=$1 AND room_guidance_revision>0 AND archived_at IS NULL ORDER BY id FOR UPDATE', [actorId])).rows;
  for (const room of rows) {
    if (room.room_guidance_authority === authorityRevision) continue;
    const current = await roomRevision(client, actorId, room.id, room.room_guidance_revision);
    if (!current) throw new ProductError('ROOM_GUIDANCE_UNAVAILABLE', 503);
    const fields = availableFields(current.fields, new Set(excludedIds), await roomConversations(client, actorId, room.id));
    const changed = current.fields.filter(field => !fields.includes(field)).map(field => field.dimension);
    await writeRoomRevision(client, { actorId, roomId: room.id, authorityRevision, previousRevision: current.revision,
      kind: changed.length ? 'forgotten' : 'revalidated', fields, changed });
  }
}
