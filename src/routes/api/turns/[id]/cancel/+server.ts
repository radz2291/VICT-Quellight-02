import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner, requireSameOrigin } from '$lib/server/auth/index.js';
import { conversations } from '$lib/server/conversation/index.js';
import { conversationError } from '$lib/server/conversation/http.js';

export const POST: RequestHandler = async event => {
  try {
    requireSameOrigin(event);
    return json(await conversations.cancel(await requireOwner(event), event.params.id));
  } catch (error) { return conversationError(error); }
};
