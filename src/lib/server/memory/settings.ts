import { createHash } from 'node:crypto';
import { DEFAULT_MEMORY_CONFIGURATION, createRoomMemoryConfiguration, readMemoryDefaults,
  readRoomMemoryConfiguration, resolveMemoryConfiguration, type MemoryConfigurationValues,
  type RoomMemoryConfiguration, type ResolvedMemoryConfiguration } from './configuration.js';
import { DEFAULT_MEMORY_PROMPTS, createRoomMemoryPromptOverrides, readMemoryPromptSelections,
  readRoomMemoryPromptOverrides, resolveMemoryPrompts, type MemoryPromptSelections,
  type RoomMemoryPromptOverrides, type ResolvedMemoryPrompts } from '../prompts/memory-catalog.js';

export const MEMORY_SETTINGS_SCHEMA = 'quellight.memory-settings@1';
export type MemorySettingsTarget = Readonly<{ kind: 'app' } | { kind: 'room'; roomId: string }>;
export interface AppMemorySettings {
  readonly configuration: MemoryConfigurationValues;
  readonly prompts: MemoryPromptSelections;
}
export interface RoomMemorySettings {
  readonly configuration: RoomMemoryConfiguration;
  readonly prompts: RoomMemoryPromptOverrides;
}
export type MemorySettingsContent = AppMemorySettings | RoomMemorySettings;
/** Server composition only. For writes, pass the client supplied inside VICT coordination.withFence.
 * This module never opens a connection, creates authority, starts/commits a transaction or exposes an endpoint. */
export interface MemorySettingsSqlClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, any>[]; rowCount?: number | null }>;
}
export type FencedMemorySettingsClient = MemorySettingsSqlClient;
export interface MemorySettingsSnapshot {
  readonly target: MemorySettingsTarget;
  readonly revision: number;
  readonly contentRevision: string;
  readonly content: MemorySettingsContent;
  readonly operation: 'initial' | 'save' | 'restore';
  readonly restoredFromRevision: number | null;
  readonly createdAt: string | null;
}
export interface MemorySettingsPreview {
  readonly configuration: ResolvedMemoryConfiguration;
  readonly prompts: ResolvedMemoryPrompts;
  readonly revision: string;
}
export interface EffectiveMemorySettings extends MemorySettingsPreview {
  readonly roomId: string;
  readonly versions: Readonly<{
    app: { revision: number; contentRevision: string };
    room: { revision: number; contentRevision: string };
    roomRecordRevision: number;
  }>;
}
export class MemorySettingsError extends Error {
  constructor(readonly code: 'MEMORY_SETTINGS_INVALID' | 'MEMORY_SETTINGS_UNAVAILABLE' |
    'MEMORY_SETTINGS_CONFLICT' | 'MEMORY_SETTINGS_REVISION_NOT_FOUND', readonly currentRevision?: number) {
    super(code); this.name = 'MemorySettingsError';
  }
}
const invalid = (): never => { throw new MemorySettingsError('MEMORY_SETTINGS_INVALID'); };
const unavailable = (): never => { throw new MemorySettingsError('MEMORY_SETTINGS_UNAVAILABLE'); };
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
    const actual = Reflect.ownKeys(value);
    if (actual.length !== keys.length) return invalid();
    const copy: Record<string, unknown> = {};
    for (const key of actual) {
      if (typeof key !== 'string' || !keys.includes(key)) return invalid();
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (!field || !field.enumerable || !('value' in field)) return invalid();
      copy[key] = field.value;
    }
    return copy;
  } catch { return invalid(); }
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return invalid();
  return value.toLowerCase();
}
function targetOf(input: MemorySettingsTarget): MemorySettingsTarget {
  let kind: unknown;
  try { kind = Object.getOwnPropertyDescriptor(input, 'kind')?.value; } catch { return invalid(); }
  if (kind === 'app') { record(input, ['kind']); return Object.freeze({ kind }); }
  if (kind !== 'room') return invalid();
  const value = record(input, ['kind', 'roomId']);
  return Object.freeze({ kind, roomId: uuid(value.roomId) });
}
const scopeKey = (target: MemorySettingsTarget) => target.kind === 'app' ? 'app' : target.roomId;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify({ schema: MEMORY_SETTINGS_SCHEMA, value })).digest('hex');
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 0 || value > 2_147_483_647) return invalid();
  return value;
}
export function readAppMemorySettings(input: unknown): AppMemorySettings {
  const value = record(input, ['configuration', 'prompts']);
  return freeze({ configuration: readMemoryDefaults(value.configuration), prompts: readMemoryPromptSelections(value.prompts) });
}
export function readRoomMemorySettings(input: unknown): RoomMemorySettings {
  const value = record(input, ['configuration', 'prompts']);
  return freeze({ configuration: readRoomMemoryConfiguration(value.configuration), prompts: readRoomMemoryPromptOverrides(value.prompts) });
}
export function createAppMemorySettings(): AppMemorySettings {
  return readAppMemorySettings({ configuration: DEFAULT_MEMORY_CONFIGURATION, prompts: DEFAULT_MEMORY_PROMPTS });
}
export function createRoomMemorySettings(purpose = ''): RoomMemorySettings {
  return readRoomMemorySettings({ configuration: createRoomMemoryConfiguration(purpose), prompts: createRoomMemoryPromptOverrides() });
}
function contentOf(target: MemorySettingsTarget, value: unknown): MemorySettingsContent {
  return target.kind === 'app' ? readAppMemorySettings(value) : readRoomMemorySettings(value);
}
/** Pure preview: uses exactly the supplied prospective purpose, overrides and defaults. */
export function previewMemorySettings(appInput: unknown, roomInput: unknown): MemorySettingsPreview {
  const app = readAppMemorySettings(appInput), room = readRoomMemorySettings(roomInput);
  const configuration = resolveMemoryConfiguration(app.configuration, room.configuration);
  const prompts = resolveMemoryPrompts(app.prompts, room.prompts, configuration.purpose);
  return freeze({ configuration, prompts, revision: hash({ configuration: configuration.revision, prompts: prompts.revision }) });
}
async function roomRecord(client: MemorySettingsSqlClient, actorId: string, target: MemorySettingsTarget, lock = false) {
  if (target.kind === 'app') return null;
  const row = (await client.query(`SELECT id,purpose,revision,archived_at FROM quellight_product_v1.rooms WHERE id=$1 AND actor_id=$2${lock ? ' FOR UPDATE' : ''}`,
    [target.roomId, actorId])).rows[0];
  if (!row) return unavailable();
  return row;
}
function initial(target: MemorySettingsTarget, purpose = ''): MemorySettingsSnapshot {
  const content = target.kind === 'app' ? createAppMemorySettings() : createRoomMemorySettings(purpose);
  return freeze({ target, revision: 0, contentRevision: hash(content), content,
    operation: 'initial', restoredFromRevision: null, createdAt: null });
}
function stored(target: MemorySettingsTarget, row: Record<string, any>): MemorySettingsSnapshot {
  try {
    const content = contentOf(target, row.content), contentRevision = hash(content);
    if (row.content_revision !== contentRevision || !['initial', 'save', 'restore'].includes(row.operation)) return unavailable();
    return freeze({ target, revision: revision(row.revision), contentRevision, content, operation: row.operation,
      restoredFromRevision: row.restored_from_revision === null ? null : revision(row.restored_from_revision),
      createdAt: new Date(row.created_at).toISOString() });
  } catch { return unavailable(); }
}
const projection = 'revision,content_revision,content,operation,restored_from_revision,created_at';

export async function readMemorySettings(client: MemorySettingsSqlClient, actorInput: string,
  targetInput: MemorySettingsTarget): Promise<MemorySettingsSnapshot> {
  const actorId = uuid(actorInput), target = targetOf(targetInput);
  const room = await roomRecord(client, actorId, target);
  const row = (await client.query(`SELECT ${projection} FROM quellight_product_v1.memory_settings_heads WHERE actor_id=$1 AND scope_key=$2`,
    [actorId, scopeKey(target)])).rows[0];
  return row ? stored(target, row) : initial(target, room?.purpose ?? '');
}
export async function listMemorySettingsHistory(client: MemorySettingsSqlClient, actorInput: string,
  targetInput: MemorySettingsTarget): Promise<readonly MemorySettingsSnapshot[]> {
  const actorId = uuid(actorInput), target = targetOf(targetInput);
  const room = await roomRecord(client, actorId, target);
  const rows = (await client.query(`SELECT ${projection} FROM quellight_product_v1.memory_settings_revisions WHERE actor_id=$1 AND scope_key=$2 ORDER BY revision DESC`,
    [actorId, scopeKey(target)])).rows;
  return Object.freeze(rows.length ? rows.map(row => stored(target, row)) : [initial(target, room?.purpose ?? '')]);
}
/** Call only in the caller's authorized VICT fenced transaction. No learned memory is read or written. */
async function write(client: FencedMemorySettingsClient, actorId: string, target: MemorySettingsTarget,
  expectedRevision: number, content: MemorySettingsContent, operation: 'save' | 'restore', restoredFromRevision: number | null) {
  if (expectedRevision === 2_147_483_647) return invalid();
  const room = await roomRecord(client, actorId, target, true);
  if (room?.archived_at) return unavailable();
  const seed = initial(target, room?.purpose ?? '');
  const inserted = await client.query(`INSERT INTO quellight_product_v1.memory_settings_heads
    (actor_id,scope_key,room_id,revision,content_revision,content,operation,restored_from_revision)
    VALUES($1,$2,$3,0,$4,$5::jsonb,'initial',NULL) ON CONFLICT(actor_id,scope_key) DO NOTHING RETURNING revision`,
    [actorId, scopeKey(target), target.kind === 'room' ? target.roomId : null, seed.contentRevision, JSON.stringify(seed.content)]);
  const current = (await client.query(`SELECT ${projection} FROM quellight_product_v1.memory_settings_heads
    WHERE actor_id=$1 AND scope_key=$2 FOR UPDATE`, [actorId, scopeKey(target)])).rows[0];
  if (!current) return unavailable();
  if (current.revision !== expectedRevision) throw new MemorySettingsError('MEMORY_SETTINGS_CONFLICT', current.revision);
  if (inserted.rows.length) await client.query(`INSERT INTO quellight_product_v1.memory_settings_revisions
    (actor_id,scope_key,revision,content_revision,content,operation,restored_from_revision)
    VALUES($1,$2,0,$3,$4::jsonb,'initial',NULL)`, [actorId, scopeKey(target), seed.contentRevision, JSON.stringify(seed.content)]);
  const next = expectedRevision + 1, contentRevision = hash(content);
  await client.query(`INSERT INTO quellight_product_v1.memory_settings_revisions
    (actor_id,scope_key,revision,content_revision,content,operation,restored_from_revision)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)`, [actorId, scopeKey(target), next, contentRevision, JSON.stringify(content), operation, restoredFromRevision]);
  const row = (await client.query(`UPDATE quellight_product_v1.memory_settings_heads SET
    revision=$3,content_revision=$4,content=$5::jsonb,operation=$6,restored_from_revision=$7,created_at=now()
    WHERE actor_id=$1 AND scope_key=$2 RETURNING ${projection}`,
    [actorId, scopeKey(target), next, contentRevision, JSON.stringify(content), operation, restoredFromRevision])).rows[0];
  return stored(target, row);
}
export async function saveMemorySettings(client: FencedMemorySettingsClient, actorInput: string, targetInput: MemorySettingsTarget,
  command: { expectedRevision: number; content: unknown }): Promise<MemorySettingsSnapshot> {
  const actorId = uuid(actorInput), target = targetOf(targetInput);
  const input = record(command, ['expectedRevision', 'content']);
  return write(client, actorId, target, revision(input.expectedRevision), contentOf(target, input.content), 'save', null);
}
export async function restoreMemorySettings(client: FencedMemorySettingsClient, actorInput: string, targetInput: MemorySettingsTarget,
  command: { expectedRevision: number; restoreRevision: number }): Promise<MemorySettingsSnapshot> {
  const actorId = uuid(actorInput), target = targetOf(targetInput);
  const input = record(command, ['expectedRevision', 'restoreRevision']);
  const expectedRevision = revision(input.expectedRevision), restoreRevision = revision(input.restoreRevision);
  await roomRecord(client, actorId, target);
  const row = (await client.query(`SELECT ${projection} FROM quellight_product_v1.memory_settings_revisions
    WHERE actor_id=$1 AND scope_key=$2 AND revision=$3`, [actorId, scopeKey(target), restoreRevision])).rows[0];
  if (!row) throw new MemorySettingsError('MEMORY_SETTINGS_REVISION_NOT_FOUND');
  return write(client, actorId, target, expectedRevision, stored(target, row).content, 'restore', restoreRevision);
}
/** Current rooms.purpose remains authoritative; saved room history keeps the purpose authored at that revision. */
export async function loadEffectiveMemorySettings(client: MemorySettingsSqlClient, actorInput: string, roomInput: string): Promise<EffectiveMemorySettings> {
  const actorId = uuid(actorInput), roomId = uuid(roomInput), target = { kind: 'room' as const, roomId };
  // A single statement supplies one PostgreSQL snapshot even when the read client is a pool.
  const room = (await client.query(`SELECT r.purpose,r.revision,to_jsonb(a) AS app_settings,to_jsonb(s) AS room_settings
    FROM quellight_product_v1.rooms r
    LEFT JOIN quellight_product_v1.memory_settings_heads a ON a.actor_id=r.actor_id AND a.scope_key='app'
    LEFT JOIN quellight_product_v1.memory_settings_heads s ON s.actor_id=r.actor_id AND s.scope_key=r.id::text
    WHERE r.id=$1 AND r.actor_id=$2`, [roomId, actorId])).rows[0];
  if (!room) return unavailable();
  const app = room.app_settings ? stored({ kind: 'app' }, room.app_settings) : initial({ kind: 'app' });
  const savedRoom = room.room_settings ? stored(target, room.room_settings) : initial(target, room.purpose);
  const roomContent = savedRoom.content as RoomMemorySettings;
  const effective = previewMemorySettings(app.content, { ...roomContent,
    configuration: { ...roomContent.configuration, purpose: room.purpose } });
  return freeze({ ...effective, roomId, versions: {
    app: { revision: app.revision, contentRevision: app.contentRevision },
    room: { revision: savedRoom.revision, contentRevision: savedRoom.contentRevision }, roomRecordRevision: room.revision,
  } });
}
