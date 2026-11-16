import assert from 'node:assert/strict';
import test from 'node:test';
import { readRuntimeConfig, readiness } from '../config/runtime.mjs';
import { readBuildTarget } from '../config/build.mjs';

test('local foundation neither enables execution nor claims hosted readiness', () => {
  const config = readRuntimeConfig({});
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 4317);
  assert.equal(config.agentExecution, false);
  assert.equal(config.persistentStorage, false);
  assert.equal(config.ownerAuthentication, false);
  assert.equal(readiness().reason, 'FOUNDATION_ONLY');
});

test('unsupported runtime modes and obsolete enablement flags are rejected', () => {
  for (const mode of ['production', 'live', 'agent', '', 'FOUNDATION']) {
    assert.throws(() => readRuntimeConfig({ QUELLIGHT_MODE: mode }), /QUELLIGHT_MODE/);
  }
  const config = readRuntimeConfig({ QUELLIGHT_DEPLOYMENT: 'hosted', ORIGIN: 'https://quellight.example', QUELLIGHT_STORAGE_READY: 'true', QUELLIGHT_AGENT_ENABLED: 'true' });
  assert.equal(config.persistentStorage, false);
  assert.equal(config.agentExecution, false);
});

test('hosted foundation requires a valid public HTTPS origin', () => {
  for (const origin of [undefined, '', 'http://quellight.example', 'https://localhost', 'https://127.0.0.1', 'https://127.0.0.2', 'https://10.0.0.1', 'https://192.168.1.2', 'https://[::1]', 'https://1.1.1.1', 'https://127.1', 'https://quellight.local', 'https://quellight.internal', 'https://user:secret@quellight.example', 'https://quellight.example/path', 'https://quellight.example?q=1', 'https://quellight.example#test']) {
    assert.throws(() => readRuntimeConfig({ QUELLIGHT_DEPLOYMENT: 'hosted', ORIGIN: origin }));
  }
  const config = readRuntimeConfig({ QUELLIGHT_DEPLOYMENT: 'hosted', ORIGIN: 'https://quellight.example/', PORT: '10000' });
  assert.equal(config.origin, 'https://quellight.example');
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 10000);
});

test('Render origin fallback stays validated and cannot override an explicit origin', () => {
  assert.equal(readRuntimeConfig({ QUELLIGHT_DEPLOYMENT: 'hosted', RENDER_EXTERNAL_URL: 'https://quellight.onrender.com' }).origin, 'https://quellight.onrender.com');
  assert.throws(() => readRuntimeConfig({ QUELLIGHT_DEPLOYMENT: 'hosted', RENDER_EXTERNAL_URL: 'http://quellight.onrender.com' }));
  assert.equal(readRuntimeConfig({ QUELLIGHT_DEPLOYMENT: 'hosted', ORIGIN: 'https://quellight.example', RENDER_EXTERNAL_URL: 'https://other.onrender.com' }).origin, 'https://quellight.example');
});

test('invalid listener ports and deployment names fail closed', () => {
  for (const port of ['0', '-1', '65536', '4317x', '4.5', '']) {
    assert.throws(() => readRuntimeConfig({ PORT: port }), /PORT/);
  }
  assert.throws(() => readRuntimeConfig({ QUELLIGHT_DEPLOYMENT: 'production' }), /QUELLIGHT_DEPLOYMENT/);
});

test('Vercel defaults to hosted configuration and validates its deployment hostname', () => {
  const config = readRuntimeConfig({ VERCEL: '1', VERCEL_URL: 'quellight-fixture.vercel.app' });
  assert.equal(config.deployment, 'hosted');
  assert.equal(config.origin, 'https://quellight-fixture.vercel.app');
  assert.equal(config.agentExecution, false);
  assert.equal(config.ownerAuthentication, false);
  assert.equal(readRuntimeConfig({ VERCEL: '1', VERCEL_URL: 'quellight-fixture.vercel.app', ORIGIN: 'https://quellight.example' }).origin, 'https://quellight.example');
  for (const hostname of [undefined, '', 'localhost', '127.0.0.1', 'quellight.local', 'https://quellight.vercel.app', 'quellight.vercel.app/path', 'owner:secret@quellight.vercel.app']) {
    assert.throws(() => readRuntimeConfig({ VERCEL: '1', VERCEL_URL: hostname }));
  }
  assert.throws(() => readRuntimeConfig({ VERCEL: '1', VERCEL_URL: 'quellight-fixture.vercel.app', QUELLIGHT_DEPLOYMENT: 'local' }), /requires hosted/);
  assert.throws(() => readRuntimeConfig({ VERCEL: '1', VERCEL_URL: 'quellight-fixture.vercel.app', QUELLIGHT_MODE: 'live' }), /QUELLIGHT_MODE/);
  assert.equal(readRuntimeConfig({ VERCEL_URL: 'untrusted.example' }).origin, undefined, 'A Vercel hostname alone must not change local deployment intent.');
});

test('build target is explicit and cannot silently use the Node adapter on Vercel', () => {
  assert.equal(readBuildTarget({}), 'node');
  assert.equal(readBuildTarget({ VERCEL: '1' }), 'vercel');
  assert.equal(readBuildTarget({ QUELLIGHT_BUILD_TARGET: 'vercel' }), 'vercel');
  assert.throws(() => readBuildTarget({ VERCEL: '1', QUELLIGHT_BUILD_TARGET: 'node' }), /Vercel requires/);
  for (const target of ['edge', 'auto', 'VERCEL', '']) assert.throws(() => readBuildTarget({ QUELLIGHT_BUILD_TARGET: target }), /must be node or vercel/);
});

test('personal hosted configuration requires owner, persistent storage, provider and verified TLS inputs', () => {
  const fixture = { QUELLIGHT_MODE: 'personal', VERCEL: '1', VERCEL_URL: 'quellight-fixture.vercel.app',
    QUELLIGHT_DATABASE_URL: 'postgres://fixture', QUELLIGHT_DATABASE_CA: 'fixture-ca',
    SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'fixture-public',
    QUELLIGHT_OWNER_SUBJECT: '11111111-2222-4333-8444-555555555555', QUELLIGHT_OWNER_EMAIL: 'owner@example.invalid',
    ZHIPU_API_KEY: 'fixture-only' };
  const config = readRuntimeConfig(fixture);
  assert.equal(config.ownerAuthentication, true);
  assert.equal(config.persistentStorage, true);
  assert.equal(config.agentExecution, true);
  for (const key of ['QUELLIGHT_DATABASE_URL','QUELLIGHT_DATABASE_CA','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY',
    'QUELLIGHT_OWNER_SUBJECT','QUELLIGHT_OWNER_EMAIL','ZHIPU_API_KEY']) {
    assert.throws(() => readRuntimeConfig({ ...fixture, [key]: undefined }), new RegExp(key));
  }
  assert.throws(() => readRuntimeConfig({ ...fixture, QUELLIGHT_OWNER_SUBJECT: 'unverified-name' }), /UUID/);
});
