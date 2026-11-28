import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { arms, sha, digest } from './voices.mjs';

const [action, privatePath, orderFile, responseFile] = process.argv.slice(2);
assert.ok(['freeze', 'render'].includes(action) && privatePath && orderFile,
  'Usage: node reader.mjs freeze PRIVATE_DIR ORDER_JSON | render PRIVATE_DIR ORDER_JSON [PRIVATE_RESPONSES_JSON]');
const dir = resolve(privatePath);
assert.ok(!dir.replaceAll('\\', '/').toLowerCase().includes('/review/'), 'Use a private path outside the Git checkout');
const scenarioBytes = await readFile(new URL('scenarios.json', import.meta.url));
const cases = JSON.parse(scenarioBytes);
const keyFile = join(dir, 'reveal-key.private.json');
const modes = ['empty', 'approved'];

if (action === 'freeze') {
  await mkdir(dir, { recursive: true });
  assert.equal(responseFile, undefined);
  const codes = new Set();
  while (codes.size < arms.length) codes.add('Q-' + randomBytes(3).toString('hex').toUpperCase());
  const order = [...codes];
  for (let index = order.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [order[index], order[other]] = [order[other], order[index]];
  }
  const key = { nonce: randomBytes(32).toString('hex'), mapping: Object.fromEntries(arms.map((arm, index) => [arm, order[index]])) };
  const start = randomInt(order.length);
  const rotate = offset => order.map((_, index) => order[(index + offset) % order.length]);
  const plan = { schema: 'quellight.q4-011.blind-order@1', scenarioSha256: sha(scenarioBytes), keyCommitment: digest(key),
    sequence: modes.flatMap((room, roomIndex) => cases.order.map(({ id }, caseIndex) =>
      ({ room, case: id, order: rotate((start + caseIndex + roomIndex) % order.length) }))) };
  await writeFile(keyFile, JSON.stringify(key, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await writeFile(orderFile, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
  console.log('Froze ' + plan.sequence.length + ' blind comparison groups.');
} else {
  const plan = JSON.parse(await readFile(orderFile, 'utf8'));
  const key = JSON.parse(await readFile(keyFile, 'utf8'));
  assert.equal(plan.scenarioSha256, sha(scenarioBytes));
  assert.equal(plan.keyCommitment, digest(key));
  assert.equal(plan.sequence.length, modes.length * cases.order.length);
  const reversed = Object.fromEntries(Object.entries(key.mapping).map(([arm, code]) => [code, arm]));
  const responses = new Map();
  if (responseFile) {
    const contents = JSON.parse(await readFile(responseFile, 'utf8'));
    assert.equal(contents.schema, 'quellight.q4-011.live-replies@1');
    assert.ok(typeof contents.routeEvidenceSha256 === 'string' && /^[a-f0-9]{64}$/.test(contents.routeEvidenceSha256));
    for (const item of contents.replies) {
      assert.ok(modes.includes(item.room) && arms.includes(item.arm));
      assert.ok(cases.order.some(scenario => scenario.id === item.case));
      assert.ok(typeof item.text === 'string' && item.text.trim() && !item.text.includes('\0'));
      const id = [item.room, item.case, item.arm].join('/');
      assert.ok(!responses.has(id));
      responses.set(id, item.text);
    }
    assert.equal(responses.size, modes.length * cases.order.length * arms.length);
  }
  const lines = [
    '# Quellight voice audition',
    '',
    responseFile ? 'Privately prepared provider replies. Voice labels are concealed.' :
      'Preparation sheet. The historical voice mapping is sealed. Provider replies are pending.',
    '',
    'Read the empty-room set first and the approved-room set second. The codes travel with each voice. Note your first impression before the source key is opened.',
    '',
  ];
  let currentRoom;
  for (const group of plan.sequence) {
    if (currentRoom !== group.room) {
      currentRoom = group.room;
      lines.push('## ' + (group.room === 'empty' ? 'Empty approved context' : 'Same approved context for all three voices'), '');
    }
    const scenario = cases.order.find(item => item.id === group.case);
    assert.ok(scenario && group.order.length === arms.length && new Set(group.order).size === arms.length &&
      group.order.every(code => Object.hasOwn(reversed, code)));
    lines.push('### ' + scenario.id, '');
    for (const step of scenario.turns) {
      lines.push('**You** ' + step.input, '');
      if (step.fixedReply) lines.push('**Shared setup reply** ' + step.fixedReply, '');
    }
    for (const code of group.order) {
      lines.push('#### ' + code, '');
      const text = responses.get([group.room, group.case, reversed[code]].join('/'));
      if (text) lines.push(...text.split('\n').map(line => '> ' + line), '');
      else lines.push('_Awaiting a provider reply._', '');
    }
    lines.push('**What stood out and which turn showed it?**', '', '___', '');
  }
  lines.push('## Continue in your own words', '', cases.ownerContinuation.instructions, '',
    '**Code you chose** ___', '', '**Your next message** ___', '', '**What you noticed** ___', '');
  await writeFile(join(dir, 'owner-reading.private.md'), lines.join('\n'), { mode: 0o600 });
  console.log('Rendered the private owner reading sheet.');
}
