import type { PostgresStoresOptions } from '@victframework/store-postgres';
import { readStoreConfig } from '../../../../config/runtime.mjs';

export const PRODUCT_SCHEMA = 'quellight_product_v1';
export const OPS_SCHEMA = 'quellight_ops_v1';
export const MEMORY_SCHEMA = 'quellight_memory_v1';
export function databaseOptions(env: Record<string, string | undefined>): PostgresStoresOptions {
  const store = readStoreConfig(env);
  const connectionString = env.QUELLIGHT_DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_CONFIGURATION_MISSING');
  let url: URL;
  try { url = new URL(connectionString); }
  catch { throw new Error('DATABASE_CONFIGURATION_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash) throw new Error('DATABASE_CONFIGURATION_INVALID');
  // Direct or session-pooled logins must preserve this database and role.
  if (url.pathname !== `/${store.database}` || !url.username) {
    throw new Error('DATABASE_CONFIGURATION_INVALID');
  }
  const local = env.QUELLIGHT_DATABASE_LOCAL_TEST === 'true' && !env.VERCEL &&
    env.QUELLIGHT_DEPLOYMENT !== 'hosted' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (!local && !env.QUELLIGHT_DATABASE_CA) throw new Error('DATABASE_TLS_CONFIGURATION_MISSING');
  return { connectionString, schema: OPS_SCHEMA, namespace: 'quellight-v1', migrate: false,
    tls: local ? 'disable-loopback-only' : { ca: env.QUELLIGHT_DATABASE_CA }, maxConnections: 1,
    connectionTimeoutMs: 2000, statementTimeoutMs: 5000, lockTimeoutMs: 1000,
    onDiagnostic: () => console.error('QUELLIGHT_DATABASE_UNAVAILABLE') };
}
