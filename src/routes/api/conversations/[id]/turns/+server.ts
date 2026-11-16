import { json } from '@sveltejs/kit';
import { getDeadline, waitUntil } from '@vercel/functions';
import type { RequestHandler } from './$types';
import { requireOwner, readObject } from '$lib/server/auth/index.js';
import { conversations } from '$lib/server/conversation/index.js';
import { conversationError } from '$lib/server/conversation/http.js';

// The actual selected Hobby platform maximum; generation itself has no app time limit.
export const config = { runtime: 'nodejs22.x', regions: ['sin1'], maxDuration: 300 };
export const POST: RequestHandler = async event => {
  try {
    const owner = await requireOwner(event);
    const request = await readObject(event);
    const { completion, ...result } = await conversations.start(owner, event.params.id, request, getDeadline());
    waitUntil(completion);
    return json(result, { status: 202 });
  } catch (error) { return conversationError(error); }
};
