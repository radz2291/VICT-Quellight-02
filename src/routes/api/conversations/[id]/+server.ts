import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { openOwnerAccess } from '$lib/server/auth/index.js';
import { conversations } from '$lib/server/conversation/index.js';
import { conversationError } from '$lib/server/conversation/http.js';

export const GET: RequestHandler = async event => {
  try {
    const access = await openOwnerAccess(event);
    try {
      const before = event.url.searchParams.get('before') ?? undefined;
      return json(await conversations.detail(access.owner, event.params.id, before, access.stores));
    } finally { await access.stores.close(); }
  } catch (error) { return conversationError(error); }
};
