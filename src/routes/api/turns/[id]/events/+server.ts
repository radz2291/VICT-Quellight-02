import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/auth/index.js';
import { conversations } from '$lib/server/conversation/index.js';
import { conversationError } from '$lib/server/conversation/http.js';

export const GET: RequestHandler = async event => {
  try {
    const after = event.url.searchParams.get('after') ?? '0';
    return json(await conversations.events(await requireOwner(event), event.params.id, /^\d+$/.test(after) ? Number(after) : NaN));
  } catch (error) { return conversationError(error); }
};
