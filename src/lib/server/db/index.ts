import { env } from '$env/dynamic/private';
import { createPostgresStores } from '@victframework/store-postgres';
import { databaseOptions } from './config.js';

export { PRODUCT_SCHEMA, OPS_SCHEMA, MEMORY_SCHEMA, databaseOptions } from './config.js';
export function openProductDatabase() {
  return createPostgresStores(databaseOptions(env));
}
