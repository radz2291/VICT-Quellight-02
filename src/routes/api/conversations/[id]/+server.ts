import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/auth/index.js';
import { conversations } from '$lib/server/conversation/index.js';
import { conversationError } from '$lib/server/conversation/http.js';

export const GET: RequestHandler = async event => {
  try { return json(await conversations.detail(await requireOwner(event), event.params.id)); }
  catch (error) { return conversationError(error); }
};
