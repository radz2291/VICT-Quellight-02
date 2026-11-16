import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { readiness } from '../../../config/runtime.mjs';
import { openProductDatabase } from '$lib/server/db/index.js';

export async function GET() {
  const headers = { 'cache-control': 'no-store' };
  if (env.QUELLIGHT_MODE !== 'personal') return json(readiness(), { status: 503, headers });
  let stores;
  try {
    stores = await openProductDatabase();
    const actor = await stores.actors.get(env.QUELLIGHT_OWNER_SUBJECT ?? '');
    const schema = await stores.coordination.pool.query(`SELECT
      to_regclass('quellight_product_v1.conversation_turns') IS NOT NULL AS turns,
      to_regclass('quellight_memory_v1.mastra_messages') IS NOT NULL AS messages`);
    if (actor?.status !== 'active' || !schema.rows[0]?.turns || !schema.rows[0]?.messages) throw new Error('NOT_READY');
    return json({ status: 'ready', mode: 'personal' }, { headers });
  } catch {
    return json({ status: 'unavailable', mode: 'personal' }, { status: 503, headers });
  } finally { await stores?.dispose(); }
}
