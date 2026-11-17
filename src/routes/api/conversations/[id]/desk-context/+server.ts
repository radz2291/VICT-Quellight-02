import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/auth/index.js';
import { openProductDatabase } from '$lib/server/db/index.js';
import { getConversation, ProductError } from '$lib/server/domain/queries.js';
import { createDeskMemoryContext } from '$lib/server/desk-memory-context.js';
import { readDeskContext, readDeskReads } from '$lib/server/desk/context.js';

export const GET: RequestHandler = async event => {
  const owner = await requireOwner(event), turnId = event.url.searchParams.get('turnId');
  const headers = { 'cache-control': 'no-store' };
  if (!turnId) return json({ code: 'TURN_NOT_FOUND', message: 'Choose a reply to inspect its Desk context.' }, { status: 400, headers });
  const stores = await openProductDatabase();
  let context: Awaited<ReturnType<typeof createDeskMemoryContext>> | undefined;
  try {
    const conversation = await getConversation(stores, owner, event.params.id);
    const turn = (await stores.coordination.pool.query('SELECT turn_id FROM quellight_product_v1.conversation_turns WHERE actor_id=$1 AND conversation_id=$2 AND turn_id=$3', [owner.actorId, conversation.id, turnId])).rows[0];
    if (!turn) throw new ProductError('TURN_NOT_FOUND', 404);
    context = await createDeskMemoryContext(stores, owner, conversation.id);
    const selected = await readDeskContext(stores, owner, conversation.roomId, turnId, context.authority);
    if (selected.status !== 'selected') return json(selected, { headers });
    const completed = (await stores.invocations.listInvocationsForTurn(turnId))
      .filter(invocation => invocation.actorId === owner.actorId && invocation.status === 'completed' && invocation.capabilityId === 'quellight.desk.read')
      .map(invocation => invocation.invocationId);
    const reads = await readDeskReads(stores, owner, conversation.roomId, turnId, completed, context.authority);
    if ((await context.authority.read()).revision !== selected.selection.authorityRevision) return json({ status: 'invalidated' }, { headers });
    return json({ ...selected, reads }, { headers });
  } catch (error) {
    return json({ code: error instanceof ProductError ? error.code : 'DESK_CONTEXT_UNAVAILABLE',
      message: 'Desk context could not be opened. Please try again.' },
    { status: error instanceof ProductError ? error.status : 503, headers });
  } finally { await context?.close(); await stores.close(); }
};
