import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createSampleWorkspace, SAMPLE_CONVERSATION, SAMPLE_ROOM } from './preview/sample-workspace.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await import(pathToFileURL(resolve(app, '../qualification/public-ui/node_modules/playwright-core/index.mjs')).href);
const origin = 'http://127.0.0.1:4320';
const output = resolve(app, 'test-results/phase2-memory-ui');
await mkdir(output, { recursive: true });
const report = { schema: 'quellight.phase2-memory-ui@1', at: new Date().toISOString(), scope: 'Real local rendered app, isolated synthetic transport per viewport; no provider, credentials or production writes.', passed: false, checks: [], screenshots: [], errors: [], forbiddenRequests: [], source: {} };
for (const file of ['src/lib/product/definition.ts', 'src/lib/product/memory-ui.ts', 'src/lib/product/memory-client.ts', 'src/lib/product/action-definitions.ts', 'src/routes/+page.svelte', 'src/lib/theme.css', 'scripts/preview/sample-memory.mjs']) report.source[file] = createHash('sha256').update(await readFile(resolve(app, file))).digest('hex');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/RZ1/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' });
function check(name, value) { assert.ok(value, name); report.checks.push(name); }
try {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport });
    const sample = createSampleWorkspace();
    const writes = [];
    let dropNextSettingsReply = true;
    let inspectionReads = 0, failNextInspection = false, holdOldAuthority = false;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { report.forbiddenRequests.push(request.url()); return route.abort('blockedbyclient'); }
      if (url.pathname.startsWith('/api/')) {
        const body = request.method() === 'POST' ? request.postDataJSON() : undefined;
        if (body) writes.push({ path: url.pathname, body });
        const value = sample.handle(request.method(), url, body);
        if (/\/conversations\/[^/]+\/memory$/.test(url.pathname)) {
          inspectionReads++;
          if (failNextInspection) { failNextInspection = false; return route.abort('failed'); }
          if (inspectionReads === 1) value.body.statusLabel = 'Sample memory update pending';
          if (holdOldAuthority) value.body.authority.revision = '0';
        }
        if (body?.actionId === 'memory.settings.save' && dropNextSettingsReply) {
          dropNextSettingsReply = false;
          return route.abort('failed'); // The synthetic save committed; only its HTTP acknowledgement is lost.
        }
        return route.fulfill({ status: value.status, headers: { 'content-type': 'application/json', ...(value.headers ?? {}) }, body: typeof value.body === 'string' ? value.body : JSON.stringify(value.body) });
      }
      if (!['GET', 'HEAD'].includes(request.method())) { report.forbiddenRequests.push(`${request.method()} ${request.url()}`); return route.abort('blockedbyclient'); }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.errors.push({ viewport: name, message: error.message }));
    const shot = async label => { const path = resolve(output, `${name}-${label}.png`); await page.screenshot({ path }); report.screenshots.push(path); };
    try {
      await page.goto(`${origin}/?room=${SAMPLE_ROOM}&conversation=${SAMPLE_CONVERSATION}`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
      check(`${name}: local sample is labelled`, await page.locator('[data-local-ui-preview]').count() === 1);
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Memory', exact: true }).click();
      const drawer = page.getByRole('dialog', { name: 'Memory', exact: true });
      await drawer.getByText('Sample memory update pending', { exact: true }).waitFor();
      await drawer.getByText('Sample memory · local preview only', { exact: true }).waitFor();
      check(`${name}: open memory refreshes pending to completed`, inspectionReads >= 2);
      check(`${name}: observations first in ready drawer`, await drawer.getByRole('heading', { name: 'Observations in this conversation' }).count() === 1);
      check(`${name}: personal memory initially collapsed`, await drawer.getByRole('button', { name: 'Personal memory', exact: true }).getAttribute('aria-expanded') === 'false');
      await shot('observations');
      await drawer.getByRole('button', { name: 'Memory used for a reply', exact: true }).click();
      await drawer.getByRole('button', { name: 'Show selected reply', exact: true }).click();
      await drawer.getByText(/Sample selected memory/).waitFor();
      check(`${name}: selected-reply context declares omissions`, (await drawer.locator('[data-ui-node="memoryContextText"]').textContent()).includes('private reasoning'));
      await drawer.getByRole('button', { name: 'Correct or forget', exact: true }).click();
      await drawer.getByRole('textbox', { name: 'Corrected personal memory', exact: true }).fill('# Personal preferences\n\n- Prefer concise answers with one next step.');
      await drawer.getByRole('textbox', { name: 'Corrected personal memory', exact: true }).press('Tab');
      await drawer.getByRole('button', { name: 'Memory activity', exact: true }).click();
      await drawer.getByRole('button', { name: 'Retry pending memory', exact: true }).click();
      check(`${name}: explicit retry preserves correction draft`, writes.findLast(item => item.body.actionId === 'memory.retry').body.input.sourceMessageIds === '[]' && (await drawer.getByRole('textbox', { name: 'Corrected personal memory', exact: true }).inputValue()).includes('one next step'));
      failNextInspection = true;
      await drawer.getByText('Connection interrupted. Reconnecting to saved memory…', { exact: true }).waitFor();
      await drawer.getByText('Sample memory · local preview only', { exact: true }).waitFor();
      check(`${name}: reconnect preserves correction draft and selected reply`, (await drawer.getByRole('textbox', { name: 'Corrected personal memory', exact: true }).inputValue()).includes('one next step') && await drawer.getByRole('combobox', { name: 'Reply', exact: true }).inputValue() === 'sample-reply');
      holdOldAuthority = true;
      sample.handle('POST', new URL('/api/actions', origin), { actionId: 'memory.correct', idempotencyKey: 'external-correction', input: { conversationId: SAMPLE_CONVERSATION, expectedAuthorityRevision: '0', sourceMessageIds: '[]', workingMemory: 'A newer correction from another device.' } });
      await drawer.getByRole('button', { name: 'Save correction', exact: true }).click();
      await drawer.getByText('Memory changed elsewhere. Your draft is kept. Reload saved memory to replace this draft before making a change.', { exact: true }).waitFor();
      check(`${name}: conflict retains pinned revision and draft`, writes.findLast(item => item.body.actionId === 'memory.correct').body.input.expectedAuthorityRevision === '0' && (await drawer.getByRole('textbox', { name: 'Corrected personal memory', exact: true }).inputValue()).includes('one next step'));
      check(`${name}: stale correction cannot overwrite a newer revision`, await drawer.getByRole('button', { name: 'Save correction', exact: true }).isDisabled());
      holdOldAuthority = false;
      await drawer.getByRole('button', { name: 'Reload saved memory', exact: true }).click();
      check(`${name}: explicit reload replaces the draft with saved content`, await drawer.getByRole('textbox', { name: 'Corrected personal memory', exact: true }).inputValue() === 'A newer correction from another device.');
      await drawer.getByRole('textbox', { name: 'Corrected personal memory', exact: true }).fill('# Personal preferences\n\n- Prefer concise answers with one next step.');
      await drawer.getByRole('textbox', { name: 'Corrected personal memory', exact: true }).press('Tab');
      await drawer.getByRole('button', { name: 'Save correction', exact: true }).click();
      await drawer.getByText('Correction saved. Your conversation is unchanged.', { exact: true }).waitFor();
      const corrected = writes.findLast(item => item.body.actionId === 'memory.correct').body;
      check(`${name}: correction carries explicit revision and exact profile`, corrected.input.expectedAuthorityRevision === '1' && corrected.input.sourceMessageIds === '[]' && corrected.input.workingMemory.includes('one next step'));
      await drawer.getByRole('button', { name: 'Personal memory', exact: true }).click();
      await drawer.getByText('Your edited personal memory is kept as written. Observations continue to update automatically.', { exact: true }).waitFor();
      await drawer.getByRole('button', { name: 'Resume automatic updates', exact: true }).click();
      await drawer.getByText('Personal memory can update automatically again.', { exact: true }).waitFor();
      check(`${name}: automatic personal updates can resume`, writes.some(item => item.body.actionId === 'memory.resume'));
      await drawer.getByRole('button', { name: 'Original sources', exact: true }).click();
      await drawer.getByRole('checkbox', { name: 'Your message', exact: true }).check();
      await drawer.getByRole('button', { name: 'Forget selected sources', exact: true }).click();
      check(`${name}: forget is explicitly confirmed`, await drawer.getByRole('button', { name: 'Confirm forget', exact: true }).count() === 1);
      await drawer.getByRole('button', { name: 'Confirm forget', exact: true }).click();
      await drawer.getByText('Selected sources are excluded from memory. Your conversation is unchanged.', { exact: true }).waitFor();
      const forgotten = writes.findLast(item => item.body.actionId === 'memory.forget').body;
      check(`${name}: selected original source ID is sent`, forgotten.input.sourceMessageIds === '["sample-week-user"]');
      check(`${name}: source exclusion visibly recorded`, await drawer.getByRole('checkbox', { name: 'Your message · excluded from memory', exact: true }).isDisabled());
      await shot('care');
      await drawer.getByRole('button', { name: 'Close drawer', exact: true }).click();
      check(`${name}: closing Memory restores focus to More`, await page.getByRole('button', { name: 'More', exact: true }).evaluate(button => button === document.activeElement));
      const closedReads = inspectionReads;
      await page.waitForTimeout(1500);
      check(`${name}: closing memory stops its read polling`, inspectionReads === closedReads);
      check(`${name}: original conversation retained`, await page.getByText('I want a little more room in my week. Everything feels useful, but I’m missing time for myself.', { exact: true }).count() === 1);
      if (name === 'phone') await page.getByRole('button', { name: 'Open rooms', exact: true }).click();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Memory defaults', exact: true }).click();
      await page.getByRole('combobox', { name: 'Automatic learning', exact: true }).waitFor();
      await page.getByRole('combobox', { name: 'Automatic learning', exact: true }).selectOption('false');
      await page.getByRole('textbox', { name: 'Additional response guidance', exact: true }).fill('Start with one clear next step.');
      await page.getByRole('textbox', { name: 'Additional response guidance', exact: true }).press('Tab');
      await page.getByRole('button', { name: 'Prompts and templates', exact: true }).click();
      await page.getByRole('combobox', { name: 'Observer', exact: true }).selectOption('append');
      await page.getByRole('textbox', { name: 'Observer additions', exact: true }).fill('Preserve explicit corrections.');
      await page.getByRole('textbox', { name: 'Observer additions', exact: true }).press('Tab');
      await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
      await page.getByText('Preview only. Nothing has been saved.', { exact: true }).waitFor();
      check(`${name}: preview has no saved mutation`, !writes.some(item => item.body.actionId === 'memory.settings.save'));
      await page.getByRole('button', { name: 'Save settings', exact: true }).click();
      await page.locator('[data-ui-node="errorBox"]').waitFor();
      check(`${name}: lost save acknowledgement preserves draft`, await page.getByRole('textbox', { name: 'Observer additions', exact: true }).inputValue() === 'Preserve explicit corrections.');
      await page.getByRole('button', { name: 'Save settings', exact: true }).click();
      await page.getByText('Settings saved. Learned memory is unchanged.', { exact: true }).waitFor();
      const retries = writes.filter(item => item.body.actionId === 'memory.settings.save');
      check(`${name}: retry retains original idempotency key`, retries.length === 2 && retries[0].body.idempotencyKey === retries[1].body.idempotencyKey);
      const saved = writes.findLast(item => item.body.actionId === 'memory.settings.save').body.input;
      check(`${name}: defaults save full versioned prompt configuration`, saved.target === 'app' && saved.roomId === '' && saved.expectedRevision === 0 && JSON.parse(saved.content).prompts.observer.text === 'Preserve explicit corrections.');
      await page.getByRole('button', { name: 'Saved versions', exact: true }).click();
      await page.getByRole('combobox', { name: 'Version to restore', exact: true }).selectOption('0');
      await page.getByRole('button', { name: 'Restore this version', exact: true }).click();
      await page.getByText('Version restored and saved. Learned memory is unchanged.', { exact: true }).waitFor();
      check(`${name}: restore creates a new version`, writes.findLast(item => item.body.actionId === 'memory.settings.restore').body.input.expectedRevision === 1);
      await shot('defaults');
      await page.getByRole('button', { name: 'Back to conversation', exact: true }).click();
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Room details', exact: true }).click();
      await page.getByRole('textbox', { name: 'Room purpose', exact: true }).waitFor();
      check(`${name}: room initially inherits`, await page.getByRole('combobox', { name: 'Automatic learning', exact: true }).inputValue() === 'inherit');
      await page.getByRole('combobox', { name: 'Automatic learning', exact: true }).selectOption('false');
      await page.getByRole('combobox', { name: 'Response guidance', exact: true }).selectOption('override');
      await page.getByRole('textbox', { name: 'Additional response guidance', exact: true }).fill('');
      await page.getByRole('textbox', { name: 'Room purpose', exact: true }).fill('My quiet place to think.');
      await page.getByRole('textbox', { name: 'Room purpose', exact: true }).press('Tab');
      await page.getByRole('button', { name: 'Save settings', exact: true }).click();
      await page.getByText('Settings saved. Learned memory is unchanged.', { exact: true }).waitFor();
      const roomSave = writes.findLast(item => item.body.actionId === 'memory.settings.save').body.input;
      const roomContent = JSON.parse(roomSave.content);
      check(`${name}: room keeps intentional empty and false`, roomSave.target === 'room' && roomContent.configuration.overrides.automaticLearning.value === false && roomContent.configuration.overrides.responseGuidance.value === '');
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('textbox', { name: 'Room purpose', exact: true }).waitFor();
      check(`${name}: settings reopen after reload`, await page.getByRole('textbox', { name: 'Room purpose', exact: true }).inputValue() === 'My quiet place to think.');
      check(`${name}: no horizontal page overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await shot('room');
    } catch (error) { await shot('failure'); report.lastAccessibility = await page.locator('body').ariaSnapshot(); throw error; }
    finally { sample.dispose(); await context.close(); }
  }
  check('no page errors', report.errors.length === 0);
  check('no nonlocal or nonfixture requests', report.forbiddenRequests.length === 0);
  report.passed = true;
} catch (error) { report.failure = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally { await browser.close(); await writeFile(resolve(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2)); }
