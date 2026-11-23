import { env } from '$env/dynamic/private';
import { createIndexedPostgresStores } from '@victframework/store-postgres';
import { readStoreConfig } from '../../../../config/runtime.mjs';
import { databaseOptions, OPS_SCHEMA } from './config.js';

export { PRODUCT_SCHEMA, OPS_SCHEMA, MEMORY_SCHEMA, databaseOptions } from './config.js';
export async function openProductDatabase() {
  const store = readStoreConfig(env);
  const options = databaseOptions(env);
  const stores = await createIndexedPostgresStores({ ...options, migrate: false, writerEpoch: store.writerEpoch });
  try {
    const { rows: [identity] } = await stores.coordination.pool.query<{ matches: boolean }>(`
      SELECT current_database() = $1 AND session_user = $2 AND current_user = $2
        AND NOT (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)
        AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
        AND NOT has_schema_privilege(current_user, $3, 'CREATE') AS matches
      FROM pg_catalog.pg_roles WHERE rolname = current_user`,
    [store.database, store.role, OPS_SCHEMA]);
    if (identity?.matches !== true) throw new Error('DATABASE_IDENTITY_MISMATCH');
    return stores;
  } catch {
    await stores.close().catch(() => undefined);
    throw new Error('DATABASE_IDENTITY_UNVERIFIED');
  }
}
