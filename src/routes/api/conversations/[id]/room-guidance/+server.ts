import { isHttpError, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readObject, requireOwner } from '$lib/server/auth/index.js';
import { openProductDatabase } from '$lib/server/db/index.js';
import { ProductError } from '$lib/server/domain/queries.js';
import { executeRoomLearningAction, inspectRoomLearning } from '$lib/server/room-learning/index.js';

const headers = { 'cache-control': 'no-store' };

function failure(cause: unknown, writing = false) {
  if (isHttpError(cause)) throw cause;
  const status = cause instanceof ProductError ? cause.status : 503;
  const code = cause instanceof ProductError ? cause.code : 'ROOM_GUIDANCE_UNAVAILABLE';
  const message = status === 409 ? 'Room guidance changed. Refresh to check the saved guidance.'
    : writing ? 'The room guidance change could not be confirmed. Refresh to check its status.'
      : 'Room guidance could not be opened. Please try again.';
  return json({ ok: false, code, message }, { status, headers });
}

export const GET: RequestHandler = async event => {
  const owner = await requireOwner(event);
  const stores = await openProductDatabase();
  try {
    if ([...event.url.searchParams].length) throw new ProductError('ROOM_GUIDANCE_QUERY_INVALID');
    return json(await inspectRoomLearning(stores, owner, event.params.id), { headers });
  } catch (cause) { return failure(cause); }
  finally { await stores.close(); }
};

export const POST: RequestHandler = async event => {
  const owner = await requireOwner(event);
  const request = await readObject(event);
  const { action, input, idempotencyKey } = request;
  if (Object.keys(request).some(key => !['action', 'input', 'idempotencyKey'].includes(key))
    || (action !== 'correct' && action !== 'forget' && action !== 'restore')
    || typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9:_-]{8,128}$/.test(idempotencyKey)) {
    return json({ ok: false, code: 'ROOM_GUIDANCE_INPUT_INVALID', message: 'Check the supplied values.' }, { status: 400, headers });
  }
  const stores = await openProductDatabase();
  try { return json(await executeRoomLearningAction(stores, owner, event.params.id, action, input, idempotencyKey), { headers }); }
  catch (cause) { return failure(cause, true); }
  finally { await stores.close(); }
};
