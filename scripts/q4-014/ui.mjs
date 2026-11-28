import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { fixtureEmail, fixturePassword } from './synth-auth.mjs';

const { values: options } = parseArgs({ options: {
  origin: { type: 'string', default: 'http://127.0.0.1:4317' },
  desktop: { type: 'string' }, phone: { type: 'string' },
  playwright: { type: 'string' }, chrome: { type: 'string' }, output: { type: 'string' },
  'forget-only': { type: 'boolean' }, screenshots: { type: 'boolean' },
} });
const origin = new URL(options.origin);
assert.equal(origin.hostname, '127.0.0.1');
assert.equal(origin.protocol, 'http:');
assert.equal(origin.href, origin.origin + '/');
assert.ok(options.playwright && options.chrome && options.output, 'Supply --playwright, --chrome and --output');
const targets = [['desktop', options.desktop, { width: 1280, height: 900 }], ['phone', options.phone, { width: 390, height: 844 }]]
  .filter(([, conversation]) => !!conversation);
assert.ok(targets.length, 'Supply a learned synthetic conversation ID for --desktop or --phone');
assert.notEqual(options.desktop, options.phone, 'Use separate synthetic rooms for each viewport');
for (const [, conversation] of targets) assert.match(conversation, /^[a-f0-9-]{36}$/i);
await mkdir(options.output, { recursive: true });
const { chromium } = await import(pathToFileURL(resolve(options.playwright)).href);
const browser = await chromium.launch({ executablePath: resolve(options.chrome), headless: true,
  args: ['--disk-cache-size=1', '--disable-extensions', '--disable-background-networking'] });
const result = { scope: 'Real loopback app with synthetic owner and distinct learned rooms', passed: false, checks: [], browserErrors: [] };
const check = (name, condition) => { assert.ok(condition, name); result.checks.push(name); };

try {
  for (const [name, conversation, viewport] of targets) {
    const context = await browser.newContext({ viewport, isMobile: name === 'phone', hasTouch: name === 'phone' });
    try {
      await context.route('**/*', route => {
        const target = new URL(route.request().url());
        return target.protocol === 'data:' || target.origin === origin.origin
          ? route.continue() : route.abort('blockedbyclient');
      });
      const page = await context.newPage();
      const runtimeErrors = [];
      page.on('pageerror', error => { runtimeErrors.push(error.message); result.browserErrors.push({ viewport: name, message: error.message }); });
      page.setDefaultTimeout(90_000);
      const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
      const textbox = (name, scope = page) => scope.getByRole('textbox', { name, exact: true });
      const openDrawer = async () => {
        await button('More').click();
        await page.getByRole('menuitem', { name: 'Memory', exact: true }).click();
        const drawer = page.getByRole('dialog', { name: 'Memory', exact: true });
        await drawer.getByRole('heading', { name: 'Room guidance', exact: true }).waitFor();
        await drawer.getByRole('heading', { name: 'Attunement', exact: true }).waitFor();
        return drawer;
      };
      const fetchJson = path => page.evaluate(async path => {
        const response = await fetch(path, { cache: 'no-store' });
        return { status: response.status, body: await response.json() };
      }, path);
      const path = '/api/conversations/' + conversation + '/room-guidance';
      const guidance = async () => {
        const { status, body } = await fetchJson(path);
        assert.equal(status, 200, 'Owner can read saved room guidance');
        return body;
      };
      const commit = async (drawer, label) => {
        const [value] = await Promise.all([
          page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST', { timeout: 35_000 }),
          button(label, drawer).click(),
        ]);
        assert.equal(value.status(), 200, label + ' accepted');
        assert.equal((await value.json()).ok, true);
      };
      await page.goto(origin.origin + '/auth/sign-in');
      await textbox('Email').fill(fixtureEmail);
      await page.locator('input[type="password"]').fill(fixturePassword);
      await button('Sign in').click();
      await page.waitForURL(url => url.pathname === '/');
      const before = await guidance();
      if (options['forget-only']) assert.ok(before.fields.some(field => field.sources.length), 'The room still needs an eligible source');
      else assert.equal(before.fields.length, 3);
      const boot = await fetchJson('/api/bootstrap');
      assert.equal(boot.status, 200);
      check(name + ' belongs to the signed-in owner', boot.body.conversations.some(item => item.id === conversation && item.roomId === before.roomId));
      await page.goto(origin.origin + '/?room=' + before.roomId + '&conversation=' + conversation);
      const draft = 'A draft kept during room guidance review on ' + name + '.';
      await textbox('Message').fill(draft);
      await textbox('Message').press('Tab');
      let drawer = await openDrawer();
      const originalIntent = before.fields.find(field => field.dimension === 'intent');
      check(name + ' reads actual learned intent', (await drawer.locator('[data-ui-node="roomGuidance-intent-text"]').innerText()) === (originalIntent?.text ?? 'Nothing saved yet.'));
      for (const heading of ['Understanding', 'Intent', 'Attunement']) {
        check(name + ' displays ' + heading, await drawer.getByRole('heading', { name: heading, exact: true }).isVisible());
      }
      const panel = await drawer.boundingBox();
      check(name + ' drawer fits its viewport', !!panel && panel.x >= 0 && panel.x + panel.width <= viewport.width + 1);
      if (options.screenshots) await page.screenshot({ path: join(options.output, name + '-guidance.jpg'), quality: 70, type: 'jpeg' });

      let restored = before;
      if (!options['forget-only']) {
        await button('Correct intent', drawer).click();
        const editor = textbox('Corrected room guidance', drawer);
        await editor.waitFor();
        check(name + ' focuses and pre-fills the selected field', (await editor.inputValue()) === originalIntent.text
          && await editor.evaluate(element => element === document.activeElement));
        const correction = 'The creator gives the first observation before deciding.';
        await editor.fill(correction);
        await editor.press('Tab');
        await commit(drawer, 'Save room correction');
        await drawer.getByText('Room correction saved.', { exact: true }).waitFor();
        const corrected = await guidance();
        check(name + ' correction publishes a new room version', corrected.revision > before.revision && corrected.fields.some(field =>
          field.dimension === 'intent' && field.text === correction && field.origin === 'owner'));
        for (const field of before.fields.filter(field => field.dimension !== 'intent')) {
          check(name + ' retains unrelated ' + field.dimension, corrected.fields.some(entry => entry.dimension === field.dimension && entry.text === field.text));
        }
        await button('Close drawer', drawer).click();
        await drawer.waitFor({ state: 'hidden' });
        await page.waitForFunction(() => document.activeElement?.getAttribute('data-ui-node') === 'moreMenu');
        check(name + ' returns to the preserved conversation draft', await textbox('Message').inputValue() === draft);

        drawer = await openDrawer();
        check(name + ' correction survives reopening', await drawer.locator('[data-ui-node="roomGuidance-intent-text"]').innerText() === correction);
        await button('Guidance history', drawer).click();
        await drawer.getByRole('combobox', { name: 'Room guidance version', exact: true }).selectOption(String(before.revision));
        await commit(drawer, 'Restore room guidance');
        await drawer.getByText('Room guidance restored as a new version.', { exact: true }).waitFor();
        restored = await guidance();
        check(name + ' restores an eligible version as a new revision', restored.revision > corrected.revision && restored.fields.some(field =>
          field.dimension === 'intent' && field.text === originalIntent.text));
      }
      const source = restored.fields.flatMap(field => field.sources)[0];
      assert.ok(source, 'Restored guidance cites an original');
      await button('Guidance sources', drawer).click();
      const sourceRow = drawer.locator('[data-ui-node="roomGuidanceSourceRow"]').filter({ hasText: source.quote }).first();
      check(name + ' displays the original source for the current revision', await sourceRow.isVisible());
      await button('Forget source', sourceRow).click();
      await drawer.getByText('Forget this source for future memory?', { exact: false }).waitFor();
      await commit(drawer, 'Confirm source forget');
      await drawer.getByText('Source forgotten from future room guidance.', { exact: true }).waitFor();
      const after = await guidance();
      check(name + ' forgetting excludes source-backed room guidance', after.revision > restored.revision
        && after.fields.every(field => field.sources.every(item => item.id !== source.id))
        && after.history.some(item => item.revision === restored.revision && !item.eligible));
      const transcript = await fetchJson('/api/conversations/' + source.conversationId);
      check(name + ' leaves the original in its conversation', transcript.status === 200
        && transcript.body.messages.some(item => item.text.includes(source.quote)));
      await button('Close drawer', drawer).click();
      await drawer.waitFor({ state: 'hidden' });
      check(name + ' Forget preserves the conversation draft', await textbox('Message').inputValue() === draft);
      check(name + ' has no browser runtime errors', runtimeErrors.length === 0);
    } catch (error) {
      result.failure = { viewport: name, message: error.message.split('\n')[0] };
      throw error;
    } finally { await context.close(); }
  }
  result.passed = true;
} finally {
  await browser.close();
  await writeFile(join(options.output, 'room-guidance-ui.json'), JSON.stringify(result, null, 2) + '\n');
}
