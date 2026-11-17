import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { readiness } from '../../../config/runtime.mjs';
import { openProductDatabase } from '$lib/server/db/index.js';
import { createPostgresMastraStore } from '@victframework/mastra';
import { QUELLIGHT_NATIVE_MEMORY_SCHEMA } from '$lib/server/memory/native.js';

export async function GET() {
  const headers = { 'cache-control': 'no-store' };
  if (env.QUELLIGHT_MODE !== 'personal') return json(readiness(), { status: 503, headers });
  let stores, memory;
  try {
    stores = await openProductDatabase();
    const actor = await stores.actors.get(env.QUELLIGHT_OWNER_SUBJECT ?? '');
    const schema = await stores.coordination.pool.query(`SELECT
      to_regclass('quellight_product_v1.conversation_turns') IS NOT NULL AS turns,
      to_regclass('quellight_product_v1.memory_jobs') IS NOT NULL AS jobs,
      to_regclass('quellight_product_v1.memory_care_commands') IS NOT NULL AS care,
      to_regclass('quellight_product_v1.memory_settings_heads') IS NOT NULL AS settings,
      to_regclass('quellight_product_v1.desk_items') IS NOT NULL AS desk,
      to_regclass('quellight_product_v1.desk_contexts') IS NOT NULL AS desk_context,
      to_regclass('quellight_product_v1.desk_reads') IS NOT NULL AS desk_reads,
      to_regclass('quellight_product_v1.desk_method_jobs') IS NOT NULL AS method,
      to_regclass('quellight_product_v1.desk_method_settings') IS NOT NULL AS method_settings,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='quellight_product_v1'
        AND table_name='conversation_turns' AND column_name='desk_binding') AS desk_binding`);
    if (actor?.status !== 'active' || !schema.rows[0]?.turns || !schema.rows[0]?.jobs ||
      !schema.rows[0]?.care || !schema.rows[0]?.settings || !schema.rows[0]?.desk || !schema.rows[0]?.desk_context ||
      !schema.rows[0]?.desk_reads || !schema.rows[0]?.method || !schema.rows[0]?.method_settings || !schema.rows[0]?.desk_binding) throw new Error('NOT_READY');
    memory = await createPostgresMastraStore({ coordination: stores.coordination,
      schemaName: QUELLIGHT_NATIVE_MEMORY_SCHEMA, migration: 'verify', memoryProfile: 'native-thread-recoverable' });
    return json({ status: 'ready', mode: 'personal' }, { headers });
  } catch {
    return json({ status: 'unavailable', mode: 'personal' }, { status: 503, headers });
  } finally { await memory?.close(); await stores?.dispose(); }
}
