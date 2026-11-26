import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { openOwnerAccess } from '$lib/server/auth/index.js';
import { listProductData } from '$lib/server/domain/queries.js';

export const GET: RequestHandler = async event => {
  const { owner, stores } = await openOwnerAccess(event);
  try { return json({ user: { id: owner.id, email: owner.email }, ...await listProductData(stores, owner, event.url.searchParams.get('view') === 'sidebar') }); }
  finally { await stores.close(); }
};
