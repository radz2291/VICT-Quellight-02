import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresMastraStore } from '@victframework/mastra';
import { createIndexedPostgresStores } from '@victframework/store-postgres';
import { indexedSchemaStatements } from '@victframework/store-postgres/operator';
import { fixtureOwner, fixtureSession } from './synth-auth.mjs';

export const app = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const { Client } = require('pg');
export const databaseRole = 'q4_014_writer';
export const settings = { schema: 'quellight_ops_v1', namespace: 'quellight-v1',
  writerEpoch: 1, tls: 'disable-loopback-only', migrate: false, maxConnections: 1 };
const product = 'quellight_product_v1';

export function fixtureDsn(database, port = '55443', role = 'q4_fixture') {
  assert.match(database, /^q4_014_[a-z0-9_]+$/);
  assert.match(port, /^\d{2,5}$/);
  assert.ok([databaseRole, 'q4_fixture'].includes(role));
  return 'postgresql://' + role + '@127.0.0.1:' + port + '/' + database;
}
export async function withDatabase(dsn, fn) {
  const url = new URL(dsn);
  assert.equal(url.hostname, '127.0.0.1');
  assert.match(url.pathname, /^\/(?:q4_014_[a-z0-9_]+|postgres)$/);
  const client = new Client({ connectionString: dsn });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

export async function prepareDatabase(database, port) {
  const connectionString = fixtureDsn(database, port);
  const admin = new URL(connectionString);
  admin.pathname = '/postgres';
  await withDatabase(admin.href, async db => {
    const self = (await db.query("SELECT rolname, rolsuper FROM pg_roles WHERE rolname=current_user")).rows[0];
    assert.equal(self?.rolname, 'q4_fixture');
    assert.equal(self.rolsuper, true, 'Run only against the isolated qualification PostgreSQL instance');
    for (const role of ['anon', 'authenticated', 'ql_app_runtime', databaseRole]) {
      const current = (await db.query('SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=$1',
        [role])).rows[0];
      if (!current) await db.query('CREATE ROLE ' + role + (role === databaseRole ? ' LOGIN INHERIT' : ''));
      else assert.ok(Object.values(current).every(value => value === false));
    }
    await db.query('GRANT ql_app_runtime TO ' + databaseRole);
    const present = (await db.query('SELECT oid FROM pg_database WHERE datname=$1', [database])).rows.length !== 0;
    if (!present) await db.query('CREATE DATABASE ' + database);
  });
  await withDatabase(connectionString, async db => {
    const report = await db.query("SELECT to_regclass('q4_014_fixture.migrations') AS fixture, to_regnamespace($1) AS product", [product]);
    if (!report.rows[0].fixture) {
      assert.equal(report.rows[0].product, null, 'This database is not a Q4-014 fixture');
      await db.query('CREATE SCHEMA q4_014_fixture; CREATE TABLE q4_014_fixture.migrations(name text PRIMARY KEY, sha256 text NOT NULL)');
      await db.query('CREATE SCHEMA auth; CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz)');
      for (const sql of await indexedSchemaStatements(settings.schema)) await db.query(sql);
      await db.query("INSERT INTO quellight_ops_v1.namespaces VALUES ('quellight-v1',1); INSERT INTO quellight_ops_v1.callback_admission VALUES ('quellight-v1')");
    }
    const dir = join(app, 'migrations');
    for (const name of (await readdir(dir)).sort()) {
      // The synthetic scheduler calls the actual dispatcher locally. Hosted pg_cron/vault remain absent.
      if (!name.endsWith('.sql') || (name.includes('wakeup') && !name.endsWith('_foreground_turn_wakeup.sql'))) continue;
      const source = await readFile(join(dir, name), 'utf8');
      const boundary = source.indexOf('-- A configured scope matches');
      if (name.includes('wakeup')) assert.ok(boundary > 0);
      const sql = name.includes('wakeup') ? source.slice(0, boundary) : source;
      const hash = createHash('sha256').update(sql).digest('hex');
      const existing = (await db.query('SELECT sha256 FROM q4_014_fixture.migrations WHERE name=$1', [name])).rows[0];
      if (existing) {
        if (existing.sha256 === createHash('sha256').update(sql.replace(/(?<!\r)\n$/, '\r\n')).digest('hex')) {
          await db.query('UPDATE q4_014_fixture.migrations SET sha256=$2 WHERE name=$1', [name, hash]);
          continue;
        }
        assert.equal(existing.sha256, hash, 'An applied fixture migration changed. Use a new isolated database.');
        continue;
      }
      await db.query('BEGIN');
      try {
        await db.query(sql);
        await db.query('INSERT INTO q4_014_fixture.migrations VALUES($1,$2)', [name, hash]);
        await db.query('COMMIT');
      } catch (error) { await db.query('ROLLBACK'); throw error; }
    }
    await db.query("INSERT INTO auth.sessions VALUES($1,$2,now()+interval '2 days') ON CONFLICT(id) DO UPDATE SET not_after=EXCLUDED.not_after",
      [fixtureSession, fixtureOwner]);
    // Baseline runtime turns grants and row policies normally come from private provisioning.
    for (const table of ['conversation_turns', 'turn_fragments']) {
      await db.query('GRANT SELECT,INSERT,UPDATE ON ' + product + '.' + table + ' TO ql_app_runtime');
      const policy = await db.query('SELECT 1 FROM pg_policies WHERE schemaname=$1 AND tablename=$2 AND policyname=$3',
        [product, table, 'q4_014_local_runtime']);
      if (!policy.rowCount) await db.query('CREATE POLICY q4_014_local_runtime ON ' + product + '.' + table +
        ' TO ql_app_runtime USING (true) WITH CHECK (true)');
    }
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await db.query('REVOKE CREATE ON DATABASE ' + database + ' FROM PUBLIC');
    await db.query('GRANT CONNECT ON DATABASE ' + database + ' TO ql_app_runtime');
  });
  const stores = await createIndexedPostgresStores({ ...settings, connectionString });
  try {
    await stores.actors.upsert({ actorId: fixtureOwner, roles: ['developer', 'operator'], status: 'active', createdAt: Date.now() });
    for (const [schemaName, memoryProfile] of [['quellight_memory_v1', 'history'], ['quellight_memory_v2', 'native-thread-recoverable']]) {
      const native = await createPostgresMastraStore({ coordination: stores.coordination, schemaName,
        memoryProfile, migration: 'apply' });
      await native.close();
    }
  } finally { await stores.close(); }
  await withDatabase(connectionString, async db => {
    // Direct grants in product migrations stay intact. The fixture only grants the indexed and native stores.
    const schemas = 'quellight_ops_v1,quellight_memory_v1,quellight_memory_v2';
    await db.query('GRANT USAGE ON SCHEMA ' + schemas + ' TO ql_app_runtime');
    await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ' + schemas + ' TO ql_app_runtime');
    await db.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ' + schemas + ' TO ql_app_runtime');
  });
  return { admin: connectionString, writer: fixtureDsn(database, port, databaseRole) };
}
