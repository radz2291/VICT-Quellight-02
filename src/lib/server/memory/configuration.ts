import { createHash } from 'node:crypto';

/** Product configuration only. This module neither reads nor changes learned memory. */
export const MEMORY_CONFIGURATION_SCHEMA = 'quellight.memory-configuration@1';
export type MemoryRecallScope = 'current-room' | 'same-owner';
export interface MemoryConfigurationValues {
  readonly responseGuidance: string;
  /** Controls future automatic learning, independently of retaining message history. */
  readonly automaticLearning: boolean;
  /** Use applicable personal preferences across this owner's rooms; never across owners. */
  readonly personalPreferences: boolean;
  /** Relevance policy, not a substitute for server authorization. */
  readonly recallScope: MemoryRecallScope;
}
export type MemoryConfigurationKey = keyof MemoryConfigurationValues;
export type MemoryOverride<T> = Readonly<{ mode: 'inherit' } | { mode: 'override'; value: T }>;
export type RoomMemoryOverrides = {
  readonly [K in MemoryConfigurationKey]: MemoryOverride<MemoryConfigurationValues[K]>;
};
export interface RoomMemoryConfiguration {
  /** Literal user-authored purpose. Learned room interpretation belongs elsewhere. */
  readonly purpose: string;
  readonly overrides: RoomMemoryOverrides;
}
export interface ResolvedMemoryConfiguration {
  readonly purpose: string;
  readonly values: MemoryConfigurationValues;
  readonly sources: Readonly<Record<MemoryConfigurationKey, 'app' | 'room'>>;
  /** Effective content identity. Equal effective content has an equal revision. */
  readonly revision: string;
  /** Input identities preserve inheritance provenance even when values coincide. */
  readonly defaultsRevision: string;
  readonly roomRevision: string;
}

const keys = ['responseGuidance', 'automaticLearning', 'personalPreferences', 'recallScope'] as const;
const inherit = Object.freeze({ mode: 'inherit' } as const);

/** Empty guidance contains no model prompt. Actual prompts live in the prompt catalog. */
export const DEFAULT_MEMORY_CONFIGURATION: MemoryConfigurationValues = Object.freeze({
  responseGuidance: '', automaticLearning: true, personalPreferences: true, recallScope: 'current-room',
});

export class MemoryConfigurationError extends Error {
  readonly code = 'MEMORY_CONFIGURATION_INVALID';
  constructor() { super('MEMORY_CONFIGURATION_INVALID'); this.name = 'MemoryConfigurationError'; }
}
function invalid(): never { throw new MemoryConfigurationError(); }

/** Reject unknown fields, inherited properties and accessors before reading values. */
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(value);
  if (actual.length !== fields.length || actual.some(key =>
    typeof key !== 'string' || !fields.includes(key) || !('value' in descriptors[key]) || !descriptors[key].enumerable)) return invalid();
  return value as Record<string, unknown>;
}
function valueFor(key: MemoryConfigurationKey, value: unknown): string | boolean {
  if (key === 'responseGuidance') return typeof value === 'string' ? value : invalid();
  if (key === 'recallScope') return value === 'current-room' || value === 'same-owner' ? value : invalid();
  return typeof value === 'boolean' ? value : invalid();
}
function keyFor(value: unknown): MemoryConfigurationKey {
  return typeof value === 'string' && keys.includes(value as MemoryConfigurationKey) ? value as MemoryConfigurationKey : invalid();
}
function overrideFor(key: MemoryConfigurationKey, value: unknown): MemoryOverride<string | boolean> {
  // Inspect the mode descriptor without invoking a user-supplied getter.
  if (!value || typeof value !== 'object') return invalid();
  const mode = Object.getOwnPropertyDescriptor(value, 'mode');
  if (!mode || !('value' in mode)) return invalid();
  if (mode.value === 'inherit') { record(value, ['mode']); return inherit; }
  if (mode.value !== 'override') return invalid();
  const source = record(value, ['mode', 'value']);
  return Object.freeze({ mode: 'override', value: valueFor(key, source.value) });
}
function revision(kind: string, value: unknown): string {
  return createHash('sha256').update(JSON.stringify({ schema: MEMORY_CONFIGURATION_SCHEMA, kind, value })).digest('hex');
}

export function readMemoryDefaults(input: unknown): MemoryConfigurationValues {
  const source = record(input, keys);
  return Object.freeze(Object.fromEntries(keys.map(key => [key, valueFor(key, source[key])]))) as unknown as MemoryConfigurationValues;
}
export function readRoomMemoryConfiguration(input: unknown): RoomMemoryConfiguration {
  const source = record(input, ['purpose', 'overrides']);
  if (typeof source.purpose !== 'string') return invalid();
  const overrides = record(source.overrides, keys);
  return Object.freeze({ purpose: source.purpose,
    overrides: Object.freeze(Object.fromEntries(keys.map(key => [key, overrideFor(key, overrides[key])])) as RoomMemoryOverrides),
  });
}

/** Home and newly created rooms follow this identical inheritance path. */
export function createRoomMemoryConfiguration(purpose = ''): RoomMemoryConfiguration {
  return readRoomMemoryConfiguration({ purpose, overrides: Object.fromEntries(keys.map(key => [key, inherit])) });
}

export function resolveMemoryConfiguration(defaultsInput: unknown, roomInput: unknown): ResolvedMemoryConfiguration {
  const defaults = readMemoryDefaults(defaultsInput);
  const room = readRoomMemoryConfiguration(roomInput);
  const values = readMemoryDefaults(Object.fromEntries(keys.map(key => {
    const override = room.overrides[key];
    return [key, override.mode === 'inherit' ? defaults[key] : override.value];
  })));
  const sources = Object.freeze(Object.fromEntries(keys.map(key => [key, room.overrides[key].mode === 'inherit' ? 'app' : 'room']))) as ResolvedMemoryConfiguration['sources'];
  return Object.freeze({ purpose: room.purpose, values, sources,
    revision: revision('effective', { purpose: room.purpose, values }),
    defaultsRevision: revision('defaults', defaults), roomRevision: revision('room', room),
  });
}

/** Return a new configuration; never mutate its caller or any conversation/memory data. */
export function setRoomMemoryOverride(roomInput: unknown, keyInput: MemoryConfigurationKey, overrideInput: unknown): RoomMemoryConfiguration {
  const room = readRoomMemoryConfiguration(roomInput);
  const key = keyFor(keyInput);
  return readRoomMemoryConfiguration({ purpose: room.purpose,
    overrides: { ...room.overrides, [key]: overrideFor(key, overrideInput) },
  });
}

/** Remove one explicit value by restoring inheritance. Purpose and other fields survive. */
export function resetRoomMemoryOverride(roomInput: unknown, key: MemoryConfigurationKey): RoomMemoryConfiguration {
  return setRoomMemoryOverride(roomInput, key, inherit);
}
