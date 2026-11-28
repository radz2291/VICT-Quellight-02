import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const invoke = promisify(execFile);

export function isolatedDatabase(Client, dsn, bin) {
  const url = new URL(dsn);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.username, 'q4_fixture');
  assert.ok(url.port && !url.password && !url.search && !url.hash);
  const [name] = url.pathname.slice(1).match(/^q4_009_[a-z][a-z0-9]*$/) ?? [];
  assert.ok(name);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const query = async sql => {
    const client = new Client({ connectionString: admin.href });
    await client.connect();
    try { await client.query(sql); } finally { await client.end(); }
  };
  const exe = command => join(bin, command + (process.platform === 'win32' ? '.exe' : ''));
  const dump = async file => {
    await invoke(exe('pg_dump'), ['--format=custom', '--no-owner', '--file=' + file, '--dbname=' + url.href]);
  };
  async function use(archive, callback, save) {
    await query('CREATE DATABASE ' + name);
    try {
      if (archive) await invoke(exe('pg_restore'), ['--exit-on-error', '--no-owner', '--dbname=' + url.href, archive]);
      const result = await callback();
      const target = save?.(result);
      if (target) await dump(target);
      return result;
    } finally {
      await query('DROP DATABASE ' + name);
    }
  }
  return { use };
}
