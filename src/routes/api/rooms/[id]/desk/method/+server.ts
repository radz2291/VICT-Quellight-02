import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/auth/index.js';
import { openProductDatabase } from '$lib/server/db/index.js';
import { ProductError } from '$lib/server/domain/queries.js';
import { methodView } from '$lib/server/desk/method-jobs.js';

export const GET: RequestHandler = async event => {
  const owner = await requireOwner(event), stores = await openProductDatabase();
  try { return json(await methodView(stores, owner, event.params.id), { headers: { 'cache-control': 'no-store' } }); }
  catch (error) { return json({ ok: false, code: error instanceof ProductError ? error.code : 'DESK_METHOD_UNAVAILABLE',
    message: 'The room method could not be opened. Please try again.' }, { status: error instanceof ProductError ? error.status : 503 }); }
  finally { await stores.close(); }
};
