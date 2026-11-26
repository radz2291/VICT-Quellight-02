import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/auth/index.js';
import { openProductDatabase } from '$lib/server/db/index.js';
import { ProductError } from '$lib/server/domain/queries.js';
import { listDesk, listDeskSummaries, type DeskListOptions } from '$lib/server/desk/domain.js';

export const GET: RequestHandler = async event => {
  const owner = await requireOwner(event);
  const headers = { 'cache-control': 'no-store' };
  const params = event.url.searchParams;
  const allowed = ['query', 'archived', 'attention', 'cursor', 'view'];
  if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1) ||
    params.has('archived') && !['true', 'false'].includes(params.get('archived')!) ||
    params.has('view') && params.get('view') !== 'summary') {
    return json({ code: 'DESK_QUERY_INVALID', message: 'Check the Desk filter.' }, { status: 400, headers });
  }
  const stores = await openProductDatabase();
  try {
    const read = params.get('view') === 'summary' ? listDeskSummaries : listDesk;
    const result = await read(stores, owner, event.params.id, {
      query: params.get('query') || undefined, archived: params.get('archived') === 'true',
      attention: (params.get('attention') || undefined) as DeskListOptions['attention'],
      cursor: params.get('cursor') || undefined,
    });
    return json(result, { headers });
  } catch (error) {
    return json({ code: error instanceof ProductError ? error.code : 'DESK_UNAVAILABLE',
      message: 'The Desk could not be opened. Please try again.' },
    { status: error instanceof ProductError ? error.status : 503, headers });
  } finally { await stores.close(); }
};
