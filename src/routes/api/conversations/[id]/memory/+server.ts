import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/auth/index.js';
import { openProductDatabase } from '$lib/server/db/index.js';
import { ProductError } from '$lib/server/domain/queries.js';
import { inspectConversationMemory } from '$lib/server/memory/inspection.js';
import { memoryInspectionSummary, memoryInspectionVersion, memoryObservationHistory, memoryReplyContext, memoryReplyPage, memorySourcePage } from '$lib/server/memory/inspection-views.js';

export const GET: RequestHandler = async event => {
  const owner = await requireOwner(event);
  const stores = await openProductDatabase();
  try {
    const params = event.url.searchParams;
    const view = params.get('view');
    const id = event.params.id;
    const allowed = view === 'sources' || view === 'replies' ? ['view', 'cursor']
      : view === null || view === 'context' ? ['view', 'turnId'] : ['view'];
    if (view !== null && !['summary', 'version', 'observations', 'sources', 'replies', 'context'].includes(view) ||
      [...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) throw new ProductError('MEMORY_QUERY_INVALID');
    const turnId = params.get('turnId') || undefined;
    const cursor = params.get('cursor') ?? undefined;
    const result = view === 'summary' ? await memoryInspectionSummary(stores, owner, id)
      : view === 'version' ? await memoryInspectionVersion(stores, owner, id)
      : view === 'observations' ? await memoryObservationHistory(stores, owner, id)
      : view === 'sources' ? await memorySourcePage(stores, owner, id, cursor)
      : view === 'replies' ? await memoryReplyPage(stores, owner, id, cursor)
      : view === 'context' ? await memoryReplyContext(stores, owner, id, turnId ?? '')
      : await inspectConversationMemory(stores, owner, id, turnId);
    return json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return json({ code: error instanceof ProductError ? error.code : 'MEMORY_UNAVAILABLE',
      message: error instanceof ProductError && error.code === 'MEMORY_CHANGED' ? 'Memory changed while it was opening. Please refresh.' : 'Memory could not be opened. Please try again.' },
    { status: error instanceof ProductError ? error.status : 503, headers: { 'cache-control': 'no-store' } });
  } finally { await stores.close(); }
};
