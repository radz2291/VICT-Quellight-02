import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/auth/index.js';
import { openProductDatabase } from '$lib/server/db/index.js';
import { ProductError } from '$lib/server/domain/queries.js';
import { getDeskCurrent, getDeskItem, getDeskRevision, getDeskRevisionPage } from '$lib/server/desk/domain.js';

export const GET: RequestHandler = async event => {
  const owner = await requireOwner(event);
  const headers = { 'cache-control': 'no-store' };
  const params = event.url.searchParams;
  const stores = await openProductDatabase();
  try {
    const { id, itemId } = event.params;
    const view = params.get('view');
    const revisionKey = view === 'history' ? 'beforeRevision' : view === 'revision' ? 'revision' : null;
    if (view !== null && !['current', 'history', 'revision'].includes(view) ||
      [...params.keys()].some(key => key !== 'view' && key !== revisionKey || params.getAll(key).length !== 1))
      throw new ProductError('DESK_QUERY_INVALID');
    const raw = revisionKey ? params.get(revisionKey) : null;
    const revision = raw === null ? undefined : Number(raw);
    if (raw !== null && (!/^[1-9][0-9]{0,9}$/.test(raw) || revision! > 2_147_483_647) || view === 'revision' && revision === undefined)
      throw new ProductError('DESK_QUERY_INVALID');
    const value = view === 'current' ? await getDeskCurrent(stores, owner, id, itemId)
      : view === 'history' ? await getDeskRevisionPage(stores, owner, id, itemId, revision)
      : view === 'revision' ? await getDeskRevision(stores, owner, id, itemId, revision!)
      : await getDeskItem(stores, owner, id, itemId);
    return json(value, { headers });
  }
  catch (error) {
    return json({ code: error instanceof ProductError ? error.code : 'DESK_UNAVAILABLE',
      message: 'This item could not be opened. Please try again.' },
    { status: error instanceof ProductError ? error.status : 503, headers });
  } finally { await stores.close(); }
};
