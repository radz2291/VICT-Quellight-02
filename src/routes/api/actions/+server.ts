import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOwner, readObject } from '$lib/server/auth/index.js';
import { openProductDatabase } from '$lib/server/db/index.js';
import { executeProductAction } from '$lib/server/domain/actions.js';
import { ProductError } from '$lib/server/domain/queries.js';
import { executeMemorySettingsAction } from '$lib/server/memory/settings-actions.js';
import { executeMemoryCareAction } from '$lib/server/memory/care-actions.js';
import { getDeadline, waitUntil } from '@vercel/functions';
import { dispatchMemory } from '$lib/server/memory/index.js';

export const config = { runtime: 'nodejs22.x', regions: ['sin1'], maxDuration: 300 };

export const POST: RequestHandler = async event => {
  const owner = await requireOwner(event);
  const request = await readObject(event);
  if (Object.keys(request).some(key => !['actionId', 'input', 'idempotencyKey'].includes(key)) || typeof request.actionId !== 'string' || typeof request.idempotencyKey !== 'string') {
    return json({ ok: false, code: 'ACTION_INPUT_INVALID', message: 'Check the supplied values.' }, { status: 400 });
  }
  const stores = await openProductDatabase();
  try {
    const care = request.actionId.startsWith('memory.') && !request.actionId.startsWith('memory.settings.');
    const execute = request.actionId.startsWith('memory.settings.') ? executeMemorySettingsAction : care ? executeMemoryCareAction : executeProductAction;
    const result = await execute(stores, owner, request.actionId, request.input, request.idempotencyKey);
    if (care) waitUntil(dispatchMemory(getDeadline()).catch(() => { console.error('QUELLIGHT_MEMORY_DISPATCH_UNCONFIRMED'); }));
    return json(result);
  }
  catch (error) {
    if (error instanceof ProductError) {
      const message = ['REVISION_CONFLICT', 'MEMORY_SETTINGS_CONFLICT'].includes(error.code) ? 'This changed on another device. Refresh and try again.'
        : error.code === 'ACTION_OUTCOME_UNCONFIRMED' ? 'The save could not be confirmed. Refresh to check its status.'
        : 'The change could not be saved. Refresh and try again.';
      return json({ ok: false, code: error.code, message }, { status: error.status });
    }
    return json({ ok: false, code: 'ACTION_UNAVAILABLE', message: 'The change could not be saved. Please try again.' }, { status: 503 });
  } finally { await stores.close(); }
};
