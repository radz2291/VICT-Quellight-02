// Browser-only synthetic transport: never authenticates against a real service.
// Start Vite on 4318. Supply a locally installed playwright module through
// QUELLIGHT_PLAYWRIGHT_MODULE, or install it in a separate QA workspace.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createSampleWorkspace } from './preview/sample-workspace.mjs';
const { chromium } = await import(process.env.QUELLIGHT_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.QUELLIGHT_PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.QUELLIGHT_UI_URL ?? 'http://127.0.0.1:4318';
const dropStartResponse = process.env.QUELLIGHT_UI_DROP_START === '1';
const outputRoot = process.env.QUELLIGHT_UI_OUTPUT ?? 'test-results/phase1-ui';
const output = dropStartResponse ? `${outputRoot}-recovery` : outputRoot;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !(dropStartResponse && message.text().includes('net::ERR_FAILED'))) errors.push(message.text()); });
const actor = '11111111-1111-4111-8111-111111111111';
const home = '22222222-2222-4222-8222-222222222222';
const conversationId = '33333333-3333-4333-8333-333333333333';
const nextConversationId = '44444444-4444-4444-8444-444444444444';
const turnId = '55555555-5555-4555-8555-555555555555';
let sequence = 0;
let active = null;
let lastTurn = null;
let stopRequested = false;
let sends = 0;
let settlingReads = 0;
const startKeys = [];
const rooms = [{ id: home, name: 'Home', purpose: 'A space for everyday thoughts.', archivedAt: null, revision: 1 }];
const conversations = [{ id: conversationId, roomId: home, title: 'Making room for the week', revision: 1 }, { id: nextConversationId, roomId: home, title: 'A small idea', revision: 1 }];
const messages = [{ id: 'fixture-user', role: 'user', text: 'I want a little more room in my week.' }, { id: 'fixture-assistant', role: 'assistant', text: 'Let’s start with what matters most.\n\nWhat is one thing you would like to make time for this week?' }];
const calls = [];
const sample = createSampleWorkspace();
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  const body = route.request().method() === 'POST' ? route.request().postDataJSON() : undefined;
  const respond = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
  calls.push({ path: url.pathname, method: route.request().method() });
  if (url.pathname === '/api/memory/settings' && route.request().method() === 'GET') return respond(sample.handle('GET', url).body);
  if (url.pathname === '/api/bootstrap') return respond({ user: { id: actor, email: 'fixture@example.test' }, rooms, conversations });
  if (url.pathname === '/api/actions') {
    assert.match(body.idempotencyKey, /^[a-f0-9-]{36}$/);
    let value;
    if (body.actionId === 'room.create') { value = { id: crypto.randomUUID(), ...body.input, archivedAt: null, revision: 1 }; rooms.push(value); }
    if (body.actionId === 'room.rename') { value = rooms.find(item => item.id === body.input.id); value.name = body.input.name; value.revision++; }
    if (body.actionId === 'room.archive') { value = rooms.find(item => item.id === body.input.id); value.archivedAt = new Date().toISOString(); value.revision++; }
    if (body.actionId === 'conversation.create') { value = { id: crypto.randomUUID(), roomId: body.input.roomId, title: 'New conversation', revision: 1 }; conversations.push(value); }
    assert.ok(value);
    return respond({ ok: true, value, replay: false });
  }
  if (/\/conversations\/[^/]+\/turns$/.test(url.pathname)) {
    assert.equal(body.input, 'Keep this test conversation going.'); startKeys.push(body.idempotencyKey);
    if (startKeys.length > 1) {
      assert.equal(startKeys[1], startKeys[0], 'Uncertain send reuses its original idempotency key');
      return respond({ turnId, conversationId, status: lastTurn.status, userMessage: messages.find(message => message.id === `${turnId}:user`) }, 202);
    }
    sends++;
    messages.push({ id: `${turnId}:user`, role: 'user', text: body.input, requestKey: body.idempotencyKey });
    active = { id: turnId, status: 'running', streamId: turnId }; lastTurn = active;
    if (dropStartResponse) return route.abort('failed');
    return respond({ turnId, conversationId, status: 'running', userMessage: messages.at(-1) }, 202);
  }
  if (url.pathname.endsWith('/cancel')) { stopRequested = true; lastTurn = { id: turnId, status: 'cancelled', projectionSettled: false }; active = lastTurn; return respond({ turnId, status: 'cancelled' }); }
  if (url.pathname.endsWith('/stream')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': fixture cursor fallback\n\n' });
  if (url.pathname.endsWith('/events')) {
    const after = Number(url.searchParams.get('after'));
    if (!sequence) sequence = 1;
    if (stopRequested && settlingReads++ >= 1) {
      active = null; lastTurn = { ...lastTurn, projectionSettled: true };
      if (!messages.some(message => message.id === `${turnId}:assistant`)) messages.push({ id: `${turnId}:assistant`, role: 'assistant', text: 'We can take this one step at a time.' });
    }
    return respond({ events: after < 1 ? [{ sequence: 1, kind: 'text.delta', delta: 'We can take this one step at a time.' }] : [], nextCursor: sequence, turn: lastTurn,
      assistantMessage: messages.find(message => message.id === `${turnId}:assistant`) ?? null });
  }
  if (/\/conversations\/[^/]+$/.test(url.pathname)) return respond({ conversation: conversations.find(item => item.id === url.pathname.split('/').at(-1)), messages: url.pathname.endsWith(conversationId) ? messages : [], activeTurn: active, lastTurn });
  throw new Error(`Unhandled fixture URL ${url.pathname}`);
});
await page.route('**/auth/sign-in', async route => {
  if (route.request().method() !== 'POST') return route.continue();
  assert.deepEqual(route.request().postDataJSON(), { email: 'fixture@example.test', password: 'synthetic-password' });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
});
try {
  await page.goto(`${base}/auth/sign-in`);
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('fixture@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'password');
  await page.screenshot({ path: `${output}/sign-in-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Making room for the week', exact: true }).waitFor();
  assert.equal(await page.locator('.ql-toolbar').getByRole('button', { name: 'New conversation', exact: true }).count(), 0, 'Header has no conversation-creation shortcut');
  assert.equal(await page.getByRole('button', { name: 'Start a conversation', exact: true }).count(), 0, 'Welcome has no conversation-creation shortcut');
  await page.locator('.ql-sidebar .ql-conversation-heading').getByRole('button', { name: 'New conversation', exact: true }).click();
  await page.getByRole('heading', { name: 'New conversation', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Making room for the week', exact: true }).click();
  await page.getByText('Let’s start with what matters most.', { exact: false }).waitFor();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('A draft to keep.');
  await page.getByRole('button', { name: 'A small idea', exact: true }).click();
  await page.getByRole('button', { name: 'Making room for the week', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), 'A draft to keep.');
  await page.screenshot({ path: `${output}/conversation-desktop.png`, fullPage: true });
  assert.ok((await page.locator('.ql-toolbar').boundingBox()).height <= 64, 'Conversation has one slim header');
  const lightTextareaColor = await page.getByRole('textbox', { name: 'Message', exact: true }).evaluate(element => getComputedStyle(element).color);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Dark appearance', exact: true }).click();
  await page.waitForFunction(light => getComputedStyle(document.querySelector('textarea')).color !== light, lightTextareaColor);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.screenshot({ path: `${output}/conversation-dark.png`, fullPage: true });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Dark appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('  Keep this test conversation going.  ');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  if (dropStartResponse) {
    await page.getByRole('button', { name: 'Retry delivery', exact: true }).click();
  }
  await page.getByText('We can take this one step at a time.').waitFor();
  if (!dropStartResponse) assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), '', 'Accepted VICT-trimmed messages clear the matching draft');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByText('Saving the response…', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled(), true);
  assert.equal(await page.getByText('We can take this one step at a time.').count(), 1);
  await page.getByText('Stopped. You can continue whenever you’re ready.').waitFor();
  assert.equal(sends, 1); assert.equal(stopRequested, true);
  if (dropStartResponse) assert.equal(startKeys.length, 2);
  await page.getByRole('button', { name: 'New room', exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'roomName');
  await page.getByRole('textbox', { name: 'Room name', exact: true }).fill('A calmer week');
  await page.getByRole('textbox', { name: 'Room purpose (optional)', exact: true }).fill('Space for small plans.');
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  await page.getByRole('heading', { name: 'A calmer week', exact: true }).waitFor();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Room details', exact: true }).click();
  await page.getByRole('textbox', { name: 'Room name', exact: true }).fill('Small plans');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await page.getByRole('heading', { name: 'Small plans', exact: true }).waitFor();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Room details', exact: true }).click();
  await page.getByRole('button', { name: 'Archive room', exact: true }).click();
  await page.getByRole('button', { name: 'Archive room', exact: true }).click();
  await page.getByRole('heading', { name: 'Making room for the week', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Making room for the week', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/conversation-phone.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const composer = await page.getByRole('textbox', { name: 'Message', exact: true }).boundingBox();
  assert.ok(composer.y + composer.height <= 844, 'Phone composer remains in viewport');
  assert.ok((await page.locator('.ql-toolbar').boundingBox()).height <= 64, 'Phone keeps a single slim header');
  for (const name of ['Open rooms', 'More']) {
    const target = await page.getByRole('button', { name, exact: true }).boundingBox();
    assert.ok(target.width >= 44 && target.height >= 44, `${name} retains a usable phone target`);
  }
  await page.getByRole('button', { name: 'Open rooms', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('dialog').locator('.ql-conversation-heading').getByRole('button', { name: 'New conversation', exact: true }).isVisible(), true, 'Phone starts conversations from its sidebar');
  await page.screenshot({ path: `${output}/rooms-phone.png`, fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'Open rooms', exact: true }).evaluate(element => element === document.activeElement), true, 'Drawer Escape restores the named trigger');
  await page.getByRole('button', { name: 'Open rooms', exact: true }).click();
  await page.getByRole('dialog').locator('.ql-conversation-heading').getByRole('button', { name: 'New conversation', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'New conversation', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open rooms', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'A small idea', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(new URL(page.url()).searchParams.get('conversation'), nextConversationId);
  await page.getByRole('button', { name: 'Open rooms', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(new URL(page.url()).searchParams.get('conversation'), nextConversationId, 'Reopening the room resumes its last conversation');
  assert.deepEqual(errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify({ kind: 'synthetic-browser-transport', passed: true, dropStartResponse, viewport: ['1440x1000', '390x844'], checks: ['canonical auth fields', 'draft across conversations', 'theme', 'turn streaming and Stop', 'terminal projection settlement', ...(dropStartResponse ? ['same-key retry after committed response loss and reconnect'] : []), 'room create/rename/archive', 'phone navigation', 'phone composer', 'no unexpected browser errors'], calls }, null, 2));
  console.log('Phase 1 synthetic browser journeys passed. No live provider or authentication used.');
} catch (error) {
  console.error(error);
  console.error(JSON.stringify({ url: page.url(), errors, calls }));
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true, timeout: 10000 }).catch(() => {});
  throw error;
} finally { await browser.close(); }
