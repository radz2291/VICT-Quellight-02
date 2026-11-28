import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fixtureEmail, fixturePassword } from './synth-auth.mjs';

export async function fixtureClient(sessionFile) {
  const config = JSON.parse(await readFile(sessionFile, 'utf8'));
  assert.match(config.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(config.database, /^q4_014_/);
  let cookie = '';
  async function request(path, { method = 'GET', body, operator = false, origin, accept = [200] } = {}) {
    assert.ok(path.startsWith('/') && !path.startsWith('//'));
    const headers = {};
    if (operator) headers['x-q4-014-operator'] = config.operatorToken;
    else if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (!operator && method !== 'GET') headers.origin = origin ?? config.origin;
    const res = await fetch(config.origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { text: text.slice(0, 400) }; }
    assert.ok(accept.includes(res.status), method + ' ' + path + ' returned ' + res.status + ' ' + JSON.stringify(json).slice(0, 500));
    return { status: res.status, body: json, headers: res.headers };
  }
  async function signIn() {
    const signed = await request('/auth/sign-in', { method: 'POST', body: { email: fixtureEmail, password: fixturePassword } });
    assert.equal(signed.body.ok, true);
    cookie = signed.headers.getSetCookie().map(item => item.split(';', 1)[0]).join('; ');
    assert.ok(cookie.length > 0);
    return request('/api/bootstrap');
  }
  async function action(actionId, input, key = randomUUID()) {
    const response = await request('/api/actions', { method: 'POST', body: { actionId, input, idempotencyKey: key } });
    assert.equal(response.body.ok, true, 'Action failed: ' + actionId);
    return response.body.value;
  }
  const room = (name, purpose) => action('room.create', { name, purpose });
  const conversation = (roomId, title) => action('conversation.create', { roomId, title });
  async function settle(turnId) {
    let cursor = 0;
    const deadline = Date.now() + 320_000;
    do {
      const { body } = await request('/api/turns/' + turnId + '/events?after=' + cursor);
      cursor = body.nextCursor ?? cursor;
      if (body.turn?.projectionSettled) {
        assert.equal(body.turn.status, 'completed', JSON.stringify(body.turn).slice(0, 300));
        assert.ok(body.assistantMessage?.text);
        return body;
      }
      await delay(300);
    } while (Date.now() < deadline);
    throw new Error('Turn settlement was not observed within the test window');
  }
  async function say(id, input) {
    const response = await request('/api/conversations/' + id + '/turns', { method: 'POST',
      body: { input, idempotencyKey: randomUUID() }, accept: [202] });
    assert.ok(response.body.turnId);
    return { ...await settle(response.body.turnId), turnId: response.body.turnId };
  }
  const detail = async id => (await request('/api/conversations/' + id)).body;
  const inspect = async id => (await request('/api/conversations/' + id + '/room-guidance')).body;
  const care = async (id, action, input, key = randomUUID(), accept = [200]) =>
    request('/api/conversations/' + id + '/room-guidance', { method: 'POST', body: { action, input, idempotencyKey: key }, accept });
  const operator = async action => (await request('/__q4_014/' + action, { method: action === 'state' ? 'GET' : 'POST', operator: true })).body;
  return { config, request, signIn, action, room, conversation, say, detail, inspect, care, operator };
}
export async function until(probe, { timeout = 320_000, interval = 350, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  do {
    const result = await probe();
    if (result) return result;
    await delay(interval);
  } while (Date.now() < deadline);
  throw new Error('Timed out waiting for ' + label);
}
