import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/auth/index.js';
import { openProductDatabase } from '$lib/server/db/index.js';
import { authorizedActor, ProductError } from '$lib/server/domain/queries.js';
import { memoryPromptCatalog } from '$lib/server/prompts/memory-catalog.js';
import { createRoomMemorySettings, loadEffectiveMemorySettings, listMemorySettingsHistory, previewMemorySettings, readMemorySettings } from '$lib/server/memory/settings.js';
import { settingsError } from '$lib/server/memory/settings-actions.js';

export const GET: RequestHandler = async event => {
  const owner = await requireOwner(event);
  const roomId = event.url.searchParams.get('roomId');
  const stores = await openProductDatabase();
  try {
    await authorizedActor(stores, owner, 'app.data.read');
    const client = stores.coordination.pool;
    const app = await readMemorySettings(client, owner.actorId, { kind: 'app' });
    const room = roomId ? await readMemorySettings(client, owner.actorId, { kind: 'room', roomId }) : null;
    const effective = roomId ? await loadEffectiveMemorySettings(client, owner.actorId, roomId)
      : previewMemorySettings(app.content, createRoomMemorySettings());
    const appHistory = await listMemorySettingsHistory(client, owner.actorId, { kind: 'app' });
    const roomHistory = roomId ? await listMemorySettingsHistory(client, owner.actorId, { kind: 'room', roomId }) : [];
    return json({ app, room, effective, appHistory, roomHistory, catalog: memoryPromptCatalog }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    try { settingsError(error); } catch (failure) {
      return json({ ok: false, code: failure instanceof ProductError ? failure.code : 'MEMORY_SETTINGS_UNAVAILABLE',
        message: 'Memory settings could not be opened. Please try again.' }, { status: failure instanceof ProductError ? failure.status : 503 });
    }
  } finally { await stores.close(); }
};
