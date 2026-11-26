import { error } from '@sveltejs/kit';
import { getDeadline } from '@vercel/functions';
import { setTimeout as delay } from 'node:timers/promises';
import type { RequestHandler } from './$types';
import { openOwnerAccess } from '$lib/server/auth/index.js';
import { conversations } from '$lib/server/conversation/index.js';
import { conversationError } from '$lib/server/conversation/http.js';
import { ProductError } from '$lib/server/domain/queries.js';

export const config = { runtime: 'nodejs22.x', regions: ['sin1'], maxDuration: 30 };
const STREAM_WINDOW_MS = 25_000;
const IDLE_HEARTBEAT_MS = 5000;
const ACTIVE_READ_MS = 90;
const IDLE_READ_MS = 210;
const encoder = new TextEncoder();

export const GET: RequestHandler = async event => {
  try {
    const origin = event.request.headers.get('origin');
    const site = event.request.headers.get('sec-fetch-site');
    if ((origin && origin !== event.url.origin) || (site && !['same-origin', 'none'].includes(site))) {
      throw error(403, 'This request could not be verified.');
    }
    const after = event.request.headers.get('last-event-id') ?? event.url.searchParams.get('after') ?? '0';
    let cursor = /^\d+$/.test(after) ? Number(after) : NaN;
    const access = await openOwnerAccess(event);
    try {
      if (!(access.expiresAt > Date.now())) throw error(401, 'Sign in to continue.');
      const observer = await conversations.attachObservation(access, access.stores, event.params.id, cursor);
      const stop = new AbortController();
      const endedBy = Math.min(Date.now() + STREAM_WINDOW_MS, (getDeadline()?.getTime() ?? Infinity) - 1000);
      const signal = AbortSignal.any([stop.signal, event.request.signal, AbortSignal.timeout(Math.max(0, endedBy - Date.now()))]);
      let closing: Promise<void> | undefined;
      function close() {
        if (!closing) {
          closing = access.stores.close().catch(() => { console.error('QUELLIGHT_STREAM_CLEANUP_UNCONFIRMED'); });
          stop.abort();
        }
        return closing;
      }
      let updatedAt = Date.now();
      let heartbeatAt = updatedAt;
      let lastStatus = '';
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const detach = () => {
            try { controller.close(); } catch { /* Consumer already detached. */ }
            void close();
          };
          if (signal.aborted) detach();
          else {
            signal.addEventListener('abort', detach, { once: true });
            controller.enqueue(encoder.encode(': connected\n\n'));
          }
        },
        async pull(controller) {
          try {
            while (!signal.aborted) {
              const observed = await observer.read(cursor);
              if (signal.aborted) break;
              const status = observed.turn.status;
              const settled = observed.turn.projectionSettled;
              if (observed.nextCursor > cursor || status !== lastStatus || settled) {
                cursor = observed.nextCursor;
                lastStatus = status;
                updatedAt = Date.now();
                heartbeatAt = updatedAt;
                controller.enqueue(encoder.encode(`id: ${cursor}\ndata: ${JSON.stringify(observed)}\n\n`));
                if (settled) {
                  controller.close();
                  await close();
                }
                return;
              }
              if (Date.now() - heartbeatAt >= IDLE_HEARTBEAT_MS) {
                heartbeatAt = Date.now();
                controller.enqueue(encoder.encode(': heartbeat\n\n'));
                return;
              }
              await delay(Date.now() - updatedAt < 1000 ? ACTIVE_READ_MS : IDLE_READ_MS, undefined, { signal });
            }
          } catch (cause) {
            if (!signal.aborted && cause instanceof ProductError && cause.status === 401) {
              controller.enqueue(encoder.encode('event: access-revoked\ndata: {"code":"HTTP_401"}\n\n'));
            } else if (!signal.aborted) {
              console.error('QUELLIGHT_STREAM_READ_INTERRUPTED');
            }
          }
          // cancel() can run while a query is in flight. In that case the
          // underlying stream is already closed by the consumer.
          try { controller.close(); } catch { /* Consumer detached. */ }
          await close();
        },
        cancel: close,
      });
      return new Response(body, { headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'private, no-store, no-transform',
        'x-accel-buffering': 'no',
      } });
    } catch (cause) {
      await access.stores.close();
      throw cause;
    }
  } catch (cause) { return conversationError(cause); }
};
