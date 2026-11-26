import { env } from '$env/dynamic/private';
import { readRuntimeConfig } from '../config/runtime.mjs';
import type { Handle } from '@sveltejs/kit';
import { createRequestAuth } from '$lib/server/auth/index.js';

/** Validate the selected runtime mode on serverless and long-lived hosts. */
export function init() {
  readRuntimeConfig(env);
}

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createRequestAuth(event);
  const response = await resolve(event);
  if (event.url.pathname.startsWith('/api/') || event.url.pathname.startsWith('/auth/') || event.locals.supabase) {
    const streaming = response.headers.get('content-type')?.startsWith('text/event-stream');
    response.headers.set('cache-control', streaming ? 'private, no-store, no-transform' : 'private, no-store');
  }
  response.headers.set('referrer-policy', 'same-origin');
  return response;
};
