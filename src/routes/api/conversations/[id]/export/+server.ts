import type { RequestHandler } from './$types';
import { requireOwner } from '$lib/server/auth/index.js';
import { conversations } from '$lib/server/conversation/index.js';
import { conversationError } from '$lib/server/conversation/http.js';

export const GET: RequestHandler = async event => {
  try {
    const text = await conversations.exportText(await requireOwner(event), event.params.id);
    return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8',
      'content-disposition': 'attachment; filename="quellight-conversation.txt"' } });
  } catch (error) { return conversationError(error); }
};
