import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/auth/index.js';
import { openProductDatabase } from '$lib/server/db/index.js';
import { listProductData } from '$lib/server/domain/queries.js';

export const GET: RequestHandler = async event => {
  const owner = await requireOwner(event);
  const stores = await openProductDatabase();
  try { return json({ user: { id: owner.id, email: owner.email }, ...await listProductData(stores, owner) }); }
  finally { await stores.close(); }
};
