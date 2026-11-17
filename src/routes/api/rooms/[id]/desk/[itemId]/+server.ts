import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/auth/index.js';
import { openProductDatabase } from '$lib/server/db/index.js';
import { ProductError } from '$lib/server/domain/queries.js';
import { getDeskItem } from '$lib/server/desk/domain.js';

export const GET: RequestHandler = async event => {
  const owner = await requireOwner(event);
  const headers = { 'cache-control': 'no-store' };
  const stores = await openProductDatabase();
  try { return json(await getDeskItem(stores, owner, event.params.id, event.params.itemId), { headers }); }
  catch (error) {
    return json({ code: error instanceof ProductError ? error.code : 'DESK_UNAVAILABLE',
      message: 'This item could not be opened. Please try again.' },
    { status: error instanceof ProductError ? error.status : 503, headers });
  } finally { await stores.close(); }
};
