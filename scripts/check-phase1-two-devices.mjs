// Two simultaneous browser contexts against synthetic intercepted transport.
// Uses the real product renderer/client; no auth, database or provider call.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.QUELLIGHT_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.QUELLIGHT_PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.QUELLIGHT_UI_URL ?? 'http://127.0.0.1:4318';
const output = 'test-results/phase1-two-devices';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const startedAt = new Date().toISOString();
const actorId = '11111111-1111-4111-8111-111111111111';
const room = { id: '22222222-2222-4222-8222-222222222222', name: 'Home', purpose: 'A shared conversation across devices.', archivedAt: null, revision: 1 };
const conversation = { id: '33333333-3333-4333-8333-333333333333', roomId: room.id, title: 'Across phone and laptop', revision: 1 };
const firstId = 'quellight:44444444-4444-4444-8444-444444444444';
const secondId = 'quellight:55555555-5555-4555-8555-555555555555';
const firstText = 'This response is visible on both devices.';
const secondText = 'The next response continues on both devices.';
const firstTurn = { id: firstId, status: 'running', streamId: `stream:${firstId}`, projectionSettled: false };
const secondTurn = { id: secondId, status: 'running', streamId: `stream:${secondId}`, projectionSettled: false };
let activeTurn = firstTurn;
let lastTurn = firstTurn;
let phase = 'first-turn-running';
const messages = [{ id: 'first-user', role: 'user', text: 'Please keep this conversation open on my devices.' }];
const errors = [];
const observations = [];
const checks = [];
const devices = [];

async function device(name, viewport, draft) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push({ device: name, message: error.message }));
  page.on('console', message => { if (message.type() === 'error') errors.push({ device: name, message: message.text() }); });
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    assert.equal(route.request().method(), 'GET', 'Observation acceptance must not issue mutations');
    const respond = value => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/api/bootstrap') return respond({ user: { id: actorId, email: 'fixture@example.test' }, rooms: [room], conversations: [conversation] });
    if (url.pathname === `/api/conversations/${conversation.id}`) return respond({ conversation, messages, activeTurn, lastTurn });
    if (url.pathname.endsWith('/stream')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': fixture cursor fallback\n\n' });
    if (url.pathname.endsWith('/events')) {
      const turnId = url.pathname.split('/')[3];
      assert.ok([firstId, secondId].includes(turnId));
      const after = Number(url.searchParams.get('after'));
      observations.push({ device: name, phase, turnId, after });
      return respond({ events: after === 0 ? [{ sequence: 1, kind: 'text.delta', delta: turnId === firstId ? firstText : secondText }] : [], nextCursor: 1, turn: turnId === firstId ? firstTurn : secondTurn,
        assistantMessage: messages.find(message => message.id === `${turnId}:assistant`) ?? null,
        ...(turnId === firstId && activeTurn?.id === secondId ? { nextActiveTurn: secondTurn, nextUserMessage: messages.find(message => message.id === 'second-user') } : {}) });
    }
    throw new Error(`Unexpected synthetic route: ${url.pathname}`);
  });
  const result = { name, page, context, draft };
  devices.push(result);
  return result;
}

try {
  const [desktop, phone] = await Promise.all([
    device('desktop', { width: 1440, height: 1000 }, 'A draft kept on the laptop.'),
    device('phone', { width: 390, height: 844 }, 'A separate draft kept on the phone.')
  ]);
  const url = `${base}/?room=${room.id}&conversation=${conversation.id}`;
  await Promise.all(devices.map(async ({ page, draft }) => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByText(firstText, { exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill(draft);
    assert.equal(await page.getByRole('button', { name: 'Stop', exact: true }).isVisible(), true);
  }));
  for (const { name } of devices) assert.ok(observations.some(item => item.device === name && item.turnId === firstId && item.after === 0));
  checks.push('two independent contexts simultaneously observe the same active turn');
  await Promise.all(devices.map(({ name, page }) => page.screenshot({ path: `${output}/${name}-first-active.png`, fullPage: true })));

  // Inject the race where a remote device starts a new turn before either
  // observer finishes refreshing the prior terminal turn's transcript.
  firstTurn.status = 'completed'; firstTurn.projectionSettled = true;
  messages.push({ id: `${firstId}:assistant`, role: 'assistant', text: firstText }, { id: 'second-user', role: 'user', text: 'Continue with a new message from another device.' });
  activeTurn = secondTurn; lastTurn = secondTurn; phase = 'remote-turn-handoff';
  await Promise.all(devices.map(async ({ page, draft }) => {
    await page.getByText(secondText, { exact: true }).waitFor();
    assert.equal(await page.getByText(firstText, { exact: true }).count(), 1, 'Prior response is rendered once after durable replacement');
    assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), draft);
    assert.equal(await page.getByRole('button', { name: 'Stop', exact: true }).isVisible(), true);
  }));
  for (const { name } of devices) assert.ok(observations.some(item => item.device === name && item.turnId === secondId && item.after === 0));
  checks.push('both observers hand off to the new remote active turn and replay from cursor zero');
  await phone.page.getByRole('textbox', { name: 'Message', exact: true }).fill('Phone draft edited while both views are live.');
  phone.draft = 'Phone draft edited while both views are live.';
  assert.equal(await desktop.page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), desktop.draft);
  checks.push('phone editing does not replace the independent desktop draft');
  await Promise.all(devices.map(({ name, page }) => page.screenshot({ path: `${output}/${name}-remote-active.png`, fullPage: true })));

  secondTurn.status = 'completed'; secondTurn.projectionSettled = true;
  activeTurn = null; phase = 'all-settled';
  messages.push({ id: `${secondId}:assistant`, role: 'assistant', text: secondText });
  await Promise.all(devices.map(async ({ page, draft }) => {
    await page.waitForFunction(() => document.querySelector('[data-testid="conversation-send"]')?.disabled === false);
    assert.equal(await page.getByText(firstText, { exact: true }).count(), 1);
    assert.equal(await page.getByText(secondText, { exact: true }).count(), 1);
    assert.equal(await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue(), draft);
    const storedDraft = await page.evaluate(key => localStorage.getItem(key), `quellight:${actorId}:draft:${conversation.id}`);
    assert.equal(storedDraft, draft);
  }));
  checks.push('both settle to the same complete transcript while keeping separate persisted drafts');
  assert.deepEqual(errors, []);
  checks.push('no browser errors or mutations');
  const inputs = {};
  for (const file of ['src/routes/+page.svelte', 'src/lib/product/client.ts', 'src/lib/product/definition.ts']) inputs[file] = createHash('sha256').update(await readFile(file)).digest('hex');
  await writeFile(`${output}/result.json`, JSON.stringify({ schema: 'quellight.phase1-two-devices@1', kind: 'synthetic-browser-transport', startedAt, finishedAt: new Date().toISOString(), passed: true, contexts: ['desktop 1440x1000', 'phone 390x844'], checks, inputs, observations }, null, 2));
  console.log('Two simultaneous device contexts passed: shared observation, remote-turn handoff, terminal transcript and independent drafts. Synthetic transport only.');
} catch (error) {
  await Promise.all(devices.map(({ name, page }) => page.screenshot({ path: `${output}/${name}-failure.png`, fullPage: true }).catch(() => undefined)));
  console.error(JSON.stringify({ phase, errors, observations }));
  throw error;
} finally { await browser.close(); }
