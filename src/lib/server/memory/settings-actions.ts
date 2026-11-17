import type { PostgresStoreSet } from '@victframework/store-postgres';
import { memorySettingsActionBindings, type MemorySettingsActionId } from '../../product/memory-contracts.js';
import { ProductError, type Owner } from '../domain/queries.js';
import { MemoryPromptError } from '../prompts/memory-catalog.js';
import { MemoryConfigurationError } from './configuration.js';
import { executeMemoryMutation } from './governed.js';
import { saveMemorySettings, restoreMemorySettings, MemorySettingsError, type MemorySettingsTarget, type RoomMemorySettings } from './settings.js';

export function settingsError(error: unknown): never {
  if (error instanceof MemorySettingsError) {
    const status = error.code === 'MEMORY_SETTINGS_CONFLICT' ? 409 : error.code === 'MEMORY_SETTINGS_UNAVAILABLE' ? 503 : 400;
    throw new ProductError(error.code, status);
  }
  if (error instanceof MemoryPromptError || error instanceof MemoryConfigurationError) throw new ProductError(error.code);
  throw error;
}
export async function executeMemorySettingsAction(stores: PostgresStoreSet, owner: Owner, actionId: string, input: unknown, commandKey: string) {
  if (!Object.hasOwn(memorySettingsActionBindings, actionId)) throw new ProductError('ACTION_UNDECLARED');
  const binding = memorySettingsActionBindings[actionId as MemorySettingsActionId];
  return executeMemoryMutation(stores, owner, binding, input, commandKey, async (client, value) => {
    const target: MemorySettingsTarget = value.target === 'app' ? { kind: 'app' } : { kind: 'room', roomId: value.roomId };
    try {
      if (target.kind === 'room') {
        const row = await client.query('SELECT id,archived_at FROM quellight_product_v1.rooms WHERE id=$1 AND actor_id=$2 FOR UPDATE', [target.roomId, owner.actorId]);
        if (!row.rows[0]) throw new ProductError('ROOM_NOT_FOUND', 404);
        if (row.rows[0].archived_at) throw new ProductError('ROOM_ARCHIVED', 409);
      }
      let content: unknown;
      if (binding.id === 'memory.settings.save') {
        try { content = JSON.parse(value.content!); } catch { throw new ProductError('MEMORY_SETTINGS_INVALID'); }
      }
      const saved = binding.id === 'memory.settings.save'
        ? await saveMemorySettings(client, owner.actorId, target, { expectedRevision: value.expectedRevision, content })
        : await restoreMemorySettings(client, owner.actorId, target, { expectedRevision: value.expectedRevision, restoreRevision: value.restoreRevision! });
      if (target.kind === 'room') {
        await client.query(`UPDATE quellight_product_v1.rooms SET purpose=$3,revision=revision+1,updated_at=now()
          WHERE id=$1 AND actor_id=$2 AND purpose IS DISTINCT FROM $3`, [target.roomId, owner.actorId, (saved.content as RoomMemorySettings).configuration.purpose]);
      }
      return { settings: saved };
    } catch (error) { return settingsError(error); }
  });
}
