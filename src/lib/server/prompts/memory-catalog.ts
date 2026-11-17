import { createHash } from 'node:crypto';
import catalog from './memory-catalog.json' with { type: 'json' };
import { promptCatalog, renderPrompt } from './catalog.js';
import type { MemoryOverride } from '../memory/configuration.js';

export const MEMORY_PROMPT_ROLES = ['conversation', 'observer', 'reflector', 'recall', 'workingMemory'] as const;
export type MemoryPromptRole = typeof MEMORY_PROMPT_ROLES[number];
export type MemoryPromptSelection = Readonly<
  { mode: 'catalog' } | { mode: 'native-default' } |
  { mode: 'replace' | 'append' | 'template'; text: string } |
  { mode: 'preset'; id: 'personal-preferences' }
>;
export type MemoryPromptSelections = Readonly<Record<MemoryPromptRole, MemoryPromptSelection>>;
export type RoomMemoryPromptOverrides = Readonly<Record<MemoryPromptRole, MemoryOverride<MemoryPromptSelection>>>;
export interface ResolvedMemoryPrompt {
  readonly id: string;
  readonly source: 'app' | 'room';
  readonly selection: MemoryPromptSelection;
  /** Undefined means native default, including its native template. Empty is an explicit custom addition/template. */
  readonly text: string | undefined;
  readonly revision: string;
  /** Package/configuration identity, not a claim to contain the upstream base prompt text. */
  readonly native: Readonly<{ package: string; version: string; field: string; mode: string }> | null;
}
export interface ResolvedMemoryPrompts {
  readonly roles: Readonly<Record<MemoryPromptRole, ResolvedMemoryPrompt>>;
  readonly revision: string;
  readonly defaultsRevision: string;
  readonly roomRevision: string;
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const memoryPromptCatalog = freeze(structuredClone(catalog));
export const DEFAULT_MEMORY_PROMPTS: MemoryPromptSelections = freeze({
  conversation: { mode: 'catalog' }, observer: { mode: 'native-default' },
  reflector: { mode: 'native-default' }, recall: { mode: 'native-default' },
  workingMemory: { mode: 'preset', id: 'personal-preferences' },
});
export class MemoryPromptError extends Error {
  readonly code = 'MEMORY_PROMPT_INVALID';
  constructor() { super('MEMORY_PROMPT_INVALID'); this.name = 'MemoryPromptError'; }
}
function invalid(): never { throw new MemoryPromptError(); }
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
    const own = Reflect.ownKeys(value);
    if (own.length !== keys.length) return invalid();
    const result: Record<string, unknown> = {};
    for (const key of own) {
      if (typeof key !== 'string' || !keys.includes(key)) return invalid();
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (!field || !field.enumerable || !('value' in field)) return invalid();
      result[key] = field.value;
    }
    return result;
  } catch { return invalid(); }
}
function modeOf(value: unknown): unknown {
  try { return value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, 'mode')?.value : undefined; }
  catch { return invalid(); }
}
function selection(role: MemoryPromptRole, input: unknown): MemoryPromptSelection {
  const mode = modeOf(input);
  if ((role === 'conversation' && mode === 'catalog') || (role !== 'conversation' && mode === 'native-default')) {
    record(input, ['mode']); return Object.freeze({ mode }) as MemoryPromptSelection;
  }
  if (role === 'workingMemory' && mode === 'preset') {
    const value = record(input, ['mode', 'id']);
    if (value.id !== 'personal-preferences') return invalid();
    return Object.freeze({ mode, id: 'personal-preferences' });
  }
  const requiredMode = role === 'conversation' ? 'replace' : role === 'workingMemory' ? 'template' : 'append';
  if (mode !== requiredMode) return invalid();
  const value = record(input, ['mode', 'text']);
  if (typeof value.text !== 'string' || (role === 'conversation' && !value.text.trim())) return invalid();
  if (role === 'conversation') renderConversation(value.text, '');
  return Object.freeze({ mode, text: value.text }) as MemoryPromptSelection;
}
const digest = (kind: string, value: unknown) => createHash('sha256')
  .update(JSON.stringify({ schema: catalog.schema, kind, value })).digest('hex');

export function readMemoryPromptSelections(input: unknown): MemoryPromptSelections {
  const values = record(input, MEMORY_PROMPT_ROLES);
  return Object.freeze(Object.fromEntries(MEMORY_PROMPT_ROLES.map(role => [role, selection(role, values[role])]))) as MemoryPromptSelections;
}
export function readRoomMemoryPromptOverrides(input: unknown): RoomMemoryPromptOverrides {
  const values = record(input, MEMORY_PROMPT_ROLES);
  return Object.freeze(Object.fromEntries(MEMORY_PROMPT_ROLES.map(role => {
    const mode = modeOf(values[role]);
    if (mode === 'inherit') { record(values[role], ['mode']); return [role, Object.freeze({ mode })]; }
    if (mode !== 'override') return invalid();
    const value = record(values[role], ['mode', 'value']);
    return [role, Object.freeze({ mode, value: selection(role, value.value) })];
  }))) as RoomMemoryPromptOverrides;
}
export function createRoomMemoryPromptOverrides(): RoomMemoryPromptOverrides {
  return readRoomMemoryPromptOverrides(Object.fromEntries(MEMORY_PROMPT_ROLES.map(role => [role, { mode: 'inherit' }])));
}
function renderConversation(text: string, roomPurpose: string): string {
  const fields = [...text.matchAll(/\{\{([^{}]*)\}\}/g)].map(match => match[1].trim());
  if (fields.some(field => field !== 'roomPurpose')) return invalid();
  const variables = fields.length ? ['roomPurpose'] : [];
  try { return renderPrompt({ id: catalog.roles.conversation.id, description: 'Saved conversation replacement',
    template: [text], variables }, fields.length ? { roomPurpose } : {}).text; }
  catch { return invalid(); }
}
export function resolveMemoryPrompts(defaultsInput: unknown, roomInput: unknown, roomPurpose: string): ResolvedMemoryPrompts {
  if (typeof roomPurpose !== 'string') return invalid();
  const defaults = readMemoryPromptSelections(defaultsInput);
  const room = readRoomMemoryPromptOverrides(roomInput);
  const roles = Object.fromEntries(MEMORY_PROMPT_ROLES.map(role => {
    const override = room[role];
    const selected = override.mode === 'inherit' ? defaults[role] : override.value;
    const entry = catalog.roles[role];
    const native = 'native' in entry ? freeze({ ...entry.native }) : null;
    let text: string | undefined;
    if (selected.mode === 'catalog') text = renderPrompt(promptCatalog.conversation, { roomPurpose }).text;
    else if (selected.mode === 'replace') text = renderConversation(selected.text, roomPurpose);
    else if (selected.mode === 'preset') text = catalog.presets[selected.id].template.join('\n');
    else if (selected.mode !== 'native-default') text = selected.text;
    const revision = digest('effective-role', { id: entry.id, selection: selected, text, native });
    return [role, freeze({ id: entry.id, source: override.mode === 'inherit' ? 'app' : 'room', selection: selected, text, native, revision })];
  })) as Record<MemoryPromptRole, ResolvedMemoryPrompt>;
  return freeze({ roles, revision: digest('effective', MEMORY_PROMPT_ROLES.map(role => [role, roles[role].revision])),
    defaultsRevision: digest('defaults', defaults), roomRevision: digest('room', room) });
}
