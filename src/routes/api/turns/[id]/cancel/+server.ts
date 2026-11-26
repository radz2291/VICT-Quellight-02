import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { openOwnerAccess, requireSameOrigin } from '$lib/server/auth/index.js';
import { conversations } from '$lib/server/conversation/index.js';
import { conversationError } from '$lib/server/conversation/http.js';

export const POST: RequestHandler = async event => {
  try {
    requireSameOrigin(event);
    const access = await openOwnerAccess(event);
    try { return json(await conversations.cancel(access.owner, event.params.id, access.stores)); }
    finally { await access.stores.close(); }
  } catch (error) { return conversationError(error); }
};
