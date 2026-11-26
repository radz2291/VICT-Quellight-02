import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDeadline, waitUntil } from '@vercel/functions';
import type { RequestHandler } from './$types';
import { authorizeMemoryWake } from '$lib/server/memory/dispatch-auth.js';
import { dispatchMemory } from '$lib/server/memory/index.js';

export const config = { runtime: 'nodejs22.x', regions: ['sin1'], maxDuration: 300 };
export const POST: RequestHandler = async event => {
  if (!await authorizeMemoryWake(event.request, env.QUELLIGHT_MEMORY_DISPATCH_SECRET)) {
    return json({ accepted: false }, { status: 401 });
  }
  // The jobs are already durable. A wake acknowledgement is not a completion receipt.
  waitUntil(dispatchMemory(getDeadline(), true).catch(() => { console.error('QUELLIGHT_MEMORY_DISPATCH_UNCONFIRMED'); }));
  return json({ accepted: true }, { status: 202 });
};
