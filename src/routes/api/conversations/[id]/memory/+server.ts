import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/auth/index.js';
import { openProductDatabase } from '$lib/server/db/index.js';
import { ProductError } from '$lib/server/domain/queries.js';
import { inspectConversationMemory } from '$lib/server/memory/inspection.js';

export const GET: RequestHandler = async event => {
  const owner = await requireOwner(event);
  const stores = await openProductDatabase();
  try {
    const result = await inspectConversationMemory(stores, owner, event.params.id, event.url.searchParams.get('turnId') || undefined);
    return json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return json({ code: error instanceof ProductError ? error.code : 'MEMORY_UNAVAILABLE',
      message: error instanceof ProductError && error.code === 'MEMORY_CHANGED' ? 'Memory changed while it was opening. Please refresh.' : 'Memory could not be opened. Please try again.' },
    { status: error instanceof ProductError ? error.status : 503, headers: { 'cache-control': 'no-store' } });
  } finally { await stores.close(); }
};
