import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/auth/index.js';
import { openProductDatabase } from '$lib/server/db/index.js';
import { ProductError } from '$lib/server/domain/queries.js';
import { methodSettingsView } from '$lib/server/desk/method-settings.js';

export const GET: RequestHandler = async event => {
  const owner = await requireOwner(event);
  const roomId = event.url.searchParams.get('roomId') ?? '';
  if ([...event.url.searchParams.keys()].some(key => key !== 'roomId') || event.url.searchParams.getAll('roomId').length > 1)
    return json({ ok: false, code: 'DESK_METHOD_SETTINGS_INVALID' }, { status: 400 });
  const stores = await openProductDatabase();
  try { return json(await methodSettingsView(stores, owner, roomId ? 'room' : 'app', roomId), { headers: { 'cache-control': 'no-store' } }); }
  catch (error) { return json({ ok: false, code: error instanceof ProductError ? error.code : 'DESK_METHOD_SETTINGS_UNAVAILABLE',
    message: 'Desk method settings could not be opened. Please try again.' }, { status: error instanceof ProductError ? error.status : 503 }); }
  finally { await stores.close(); }
};
