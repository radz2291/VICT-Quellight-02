import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fixtureDsn, withDatabase } from './database.mjs';

const exec = promisify(execFile);
const [operation, database, toolPath, archive, pgPort = '55443'] = process.argv.slice(2);
assert.ok(['save', 'restore', 'drop'].includes(operation));
const dsn = fixtureDsn(database, pgPort);
const admin = new URL(dsn);
admin.pathname = '/postgres';
const exe = tool => join(toolPath, tool + (process.platform === 'win32' ? '.exe' : ''));
const exists = () => withDatabase(admin.href, async db =>
  (await db.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount === 1);
const requireFixture = () => withDatabase(dsn, async db => {
  const marker = await db.query("SELECT to_regclass('q4_014_fixture.migrations') IS NOT NULL AS marker");
  assert.equal(marker.rows[0].marker, true, 'Target must be a successfully identified Q4-014 synthetic database');
});
if (operation === 'save') {
  assert.ok(archive && toolPath);
  await requireFixture();
  await exec(exe('pg_dump'), [dsn, '--format=custom', '--no-owner', '--file=' + archive]);
} else if (operation === 'drop') {
  if (await exists()) {
    await requireFixture();
    // The application must release all connections first.
    await withDatabase(admin.href, db => db.query('DROP DATABASE ' + database));
  }
} else {
  assert.ok(archive && toolPath);
  if (!await exists()) await withDatabase(admin.href, db => db.query('CREATE DATABASE ' + database));
  else await withDatabase(dsn, async db => {
    const count = await db.query(
      "SELECT count(*)::int AS custom FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')");
    assert.equal(count.rows[0].custom, 0, 'Restore into a new empty disposable database only');
    const objects = await db.query("SELECT count(*)::int AS custom FROM pg_class WHERE relnamespace='public'::regnamespace");
    assert.equal(objects.rows[0].custom, 0, 'The fixture database already contains objects');
  });
  await exec(exe('pg_restore'), ['--exit-on-error', '--no-owner', '--dbname=' + dsn, archive]);
  await requireFixture();
}
