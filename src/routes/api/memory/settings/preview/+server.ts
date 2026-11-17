import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner, readObject } from '$lib/server/auth/index.js';
import { openProductDatabase } from '$lib/server/db/index.js';
import { authorizedActor, ProductError } from '$lib/server/domain/queries.js';
import { createRoomMemorySettings, previewMemorySettings, readMemorySettings } from '$lib/server/memory/settings.js';
import { settingsError } from '$lib/server/memory/settings-actions.js';

export const POST: RequestHandler = async event => {
  const owner = await requireOwner(event);
  const body = await readObject(event);
  if (Object.keys(body).some(key => !['target', 'roomId', 'content'].includes(key)) ||
    !['app', 'room'].includes(String(body.target)) || typeof body.roomId !== 'string' || typeof body.content !== 'string') {
    return json({ ok: false, code: 'MEMORY_SETTINGS_INVALID', message: 'Check the memory settings.' }, { status: 400 });
  }
  const stores = await openProductDatabase();
  try {
    await authorizedActor(stores, owner, 'app.data.read');
    let content: unknown;
    try { content = JSON.parse(body.content); } catch { throw new ProductError('MEMORY_SETTINGS_INVALID'); }
    const app = await readMemorySettings(stores.coordination.pool, owner.actorId, { kind: 'app' });
    const room = body.roomId ? (await readMemorySettings(stores.coordination.pool, owner.actorId, { kind: 'room', roomId: body.roomId })).content : createRoomMemorySettings();
    if (body.target === 'room' && !body.roomId) throw new ProductError('ROOM_NOT_FOUND', 404);
    const effective = previewMemorySettings(body.target === 'app' ? content : app.content, body.target === 'room' ? content : room);
    return json({ effective }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    try { settingsError(error); } catch (failure) {
      return json({ ok: false, code: failure instanceof ProductError ? failure.code : 'MEMORY_SETTINGS_UNAVAILABLE',
        message: 'The settings preview could not be prepared. Check the values and try again.' }, { status: failure instanceof ProductError ? failure.status : 503 });
    }
  } finally { await stores.close(); }
};
