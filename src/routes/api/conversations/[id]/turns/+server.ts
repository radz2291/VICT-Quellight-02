import { json } from '@sveltejs/kit';
import { getDeadline, waitUntil } from '@vercel/functions';
import type { RequestHandler } from './$types';
import { openOwnerAccess, readObject } from '$lib/server/auth/index.js';
import { conversations } from '$lib/server/conversation/index.js';
import { conversationError } from '$lib/server/conversation/http.js';
import { dispatchMemory } from '$lib/server/memory/index.js';

// The actual selected Hobby platform maximum; generation itself has no app time limit.
export const config = { runtime: 'nodejs22.x', regions: ['sin1'], maxDuration: 300 };
export const POST: RequestHandler = async event => {
  try {
    const access = await openOwnerAccess(event);
    const request = await readObject(event).catch(async error => {
      await access.stores.close();
      throw error;
    });
    const deadline = getDeadline();
    // start owns this store after entry. On admission its background task
    // keeps it alive through projection settlement and closes it.
    const { completion, ...result } = await conversations.start(access.owner, event.params.id, request, deadline, access.stores);
    waitUntil(completion.then(() => dispatchMemory(deadline)).catch(() => { console.error('QUELLIGHT_MEMORY_DISPATCH_UNCONFIRMED'); }));
    return json(result, { status: 202 });
  } catch (error) { return conversationError(error); }
};
