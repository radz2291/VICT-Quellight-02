import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { openOwnerAccess } from '$lib/server/auth/index.js';
import { conversations } from '$lib/server/conversation/index.js';
import { conversationError } from '$lib/server/conversation/http.js';

export const GET: RequestHandler = async event => {
  try {
    const after = event.url.searchParams.get('after') ?? '0';
    const access = await openOwnerAccess(event);
    try {
      return json(await conversations.events(access.owner, event.params.id, /^\d+$/.test(after) ? Number(after) : NaN, access.stores));
    } finally { await access.stores.close(); }
  } catch (error) { return conversationError(error); }
};
