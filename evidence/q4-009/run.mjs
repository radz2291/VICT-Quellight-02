import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { join, resolve } from 'node:path';
import { designSha, git } from '../q4-008/fixture.mjs';
import { openFixture } from './fixture.mjs';
import { foreground, maintenance, frozen } from './replay.mjs';
import { sha256 } from './measurement/prompt.mjs';

const [app, design, dsn, outputPath, modeArg = 'short,long', armArg = 'control,room-block', existing] = process.argv.slice(2);
assert.ok(app && design && dsn && outputPath, 'Usage: node run.mjs APP DESIGN DSN OUTPUT [short,long] [control,room-block] [--existing]');
assert.equal(git(resolve(design), 'rev-parse', 'HEAD').toString().trim(), designSha);
assert.ok(existing === undefined || existing === '--existing');
const modes = modeArg.split(','), arms = armArg.split(',');
assert.ok(modes.every(mode => ['short', 'long'].includes(mode)) && new Set(modes).size === modes.length);
assert.ok(arms.every(arm => ['control', 'room-block'].includes(arm)) && new Set(arms).size === arms.length);
const output = resolve(outputPath);
await mkdir(output, { recursive: true });
const { workload, revisions, markerText } = frozen;
const report = { schema: 'quellight.q4-009.replay@1', status: 'started',
  design: designSha, expectedLong: modes.includes('long') ? workload.long.length : 0, markers: markerText, evidence: [], rows: [],
  liveProviderCalls: 0, study: { orders: { modes, arms }, idleMs: 2000, ...Object.fromEntries(await Promise.all(
    ['overlay.mjs', 'replay.mjs', 'measurement/workload.mjs'].map(async name => [name, sha256(await readFile(new URL(name, import.meta.url)))]))) } };
const save = () => writeFile(join(output, 'capture.json'), JSON.stringify(report, null, 2) + '\n');

const seedTurn = { caseId: 'approved-original', input: 'Owner-approved supporting evidence for the fictional versioned review portal.',
  reply: 'The versioned review portal has a synthetic approval source.', expectedRevision: null };
const compactProbe = { caseId: 'short-post-compaction', input: 'Check what remains after the review summary is compacted.',
  reply: 'Check the current review version and the saved retry receipt.', expectedRevision: 'r1' };
const reopenR2 = { caseId: 'short-reopen-r2', input: 'I reopened this thread again. Confirm the updated review checkpoint.',
  reply: 'Use the approved verification handoff and confirm the cut number.', expectedRevision: 'r2' };
const repeatR3 = { caseId: 'short-repeat-r3', input: 'Repeat the privacy and retry checkpoint for this review.',
  reply: 'Check that the review stays private and that retry leaves one comment.', expectedRevision: 'r3' };

let fixture, rt;
try {
  fixture = await openFixture(app, dsn, output);
  report.pins = { ...fixture.identity, design: designSha, postgres: fixture.postgres };
  if (!existing) await fixture.provision();
  for (const mode of modes) for (const arm of arms) {
    rt = await fixture.runtime(arm);
    const story = await fixture.createStory(`${mode} ${arm}`);
    const evidence = { mode, arm, story, status: 'started', approvals: [], care: [], maintenance: [], desk: [], reopens: [] };
    report.evidence.push(evidence);
    evidence.seed = await foreground(fixture, rt, story, story.evidenceThread, arm, 'setup', seedTurn, { include: false });
    const source = await fixture.sourcePage(rt, story, story.evidenceThread);
    const eligible = source.sources.filter(message => message.role === 'user' && !message.excluded);
    assert.equal(eligible.length, 1);
    const sourceId = eligible[0].id;
    const approve = async revision => evidence.approvals.push(
      await fixture.approve(rt, story, story.evidenceThread, revision, revisions[revision], sourceId));
    await approve('r1');
    evidence.desk.push(await fixture.desk(rt, story));
    const admitted = async (turn, options = {}, thread = story.thread) => {
      const row = await foreground(fixture, rt, story, thread, arm, mode, turn, options);
      report.rows.push(row);
      return row;
    };
    const reopen = async after => {
      const before = rt.edits();
      await rt.close();
      rt = await fixture.runtime(arm);
      evidence.reopens.push({ after, thread: story.thread, priorRuntimeEdits: before });
    };
    const correct = async (revision, workingMemory) => {
      evidence.care.push(await fixture.care(rt, story, story.evidenceThread, 'memory.correct', { workingMemory }));
      await approve(revision);
    };
    const maintain = async (after, reflect = false) => evidence.maintenance.push({ after,
      ...await maintenance(fixture, rt, story, { reflect }) });
    if (mode === 'short') {
      const [first, repeat, reopened, fresh, other, changed, corrected, excluded] = workload.short;
      await admitted(first);
      await admitted(repeat, { echo: 'r1' });
      await reopen(repeat.caseId);
      await admitted(reopened, { carry: 'r1' });
      await admitted(fresh, {}, story.freshThread);
      await admitted(other, { absent: ['r1', 'r2', 'r3'] }, story.otherThread);
      await maintain(reopened.caseId, true);
      const compacted = await admitted(compactProbe, { carry: 'r1' });
      evidence.actualCompactedCarry = compacted.prompt.markers.r1.some(item => item.index > 0 && item.role === 'system');
      assert.equal(evidence.actualCompactedCarry, true);
      await correct('r2', 'The review portal uses a versioned handoff receipt.');
      await admitted(changed, { absent: ['r1'], echo: 'r2' });
      await reopen(changed.caseId);
      await admitted(reopenR2, { absent: ['r1'], carry: 'r2' });
      await correct('r3', 'The owner has confirmed private review for the versioned portal.');
      await admitted(corrected, { absent: ['r1', 'r2'], echo: 'r3' });
      await admitted(repeatR3, { absent: ['r1', 'r2'], carry: 'r3' });
      evidence.care.push(await fixture.care(rt, story, story.evidenceThread, 'memory.forget', { ids: [sourceId] }));
      const after = await fixture.sourcePage(rt, story, story.evidenceThread);
      assert.equal(after.sources.find(message => message.id === sourceId)?.excluded, true);
      evidence.excludedSource = { id: sourceId, authority: after.authorityRevision, excluded: true };
      await admitted(excluded, { absent: ['r1', 'r2', 'r3'] });
    } else {
      for (const turn of workload.long) {
        const { caseId, index } = turn;
        evidence.progress = caseId;
        if (index === 26) await delay(report.study.idleMs);
        if (index === 51) await correct('r2', 'The portal now verifies a versioned handoff receipt.');
        if (index === 70) evidence.desk.push(await fixture.desk(rt, story, evidence.desk[0]));
        const row = await admitted(turn, { include: workload.sampleIndices.includes(index) || index === 41,
          echo: index === 39 ? 'r1' : undefined, carry: index === 41 || index === 50 ? 'r1' : undefined,
          absent: index >= 51 ? ['r1'] : [] });
        if (index === 41) {
          evidence.actualCompactedCarry = row.prompt.markers.r1.some(item => item.index > 0 && item.role === 'system');
          assert.equal(evidence.actualCompactedCarry, true);
        }
        if (turn.dispatchAfter) await maintain(caseId, turn.reflectAfter || index === 40);
        if (index % 5 === 0 || index === workload.long.length) {
          await save();
          if (index % 10 === 0 || index === workload.long.length) console.log(`${arm} long ${index}/${workload.long.length}`);
        }
      }
    }
    evidence.runtimeEdits = rt.edits();
    assert.deepEqual(evidence.runtimeEdits, arm === 'room-block' ? ['activation', 'service'] : []);
    evidence.status = 'passed';
    await rt.close();
    rt = undefined;
    await save();
    console.log(`Passed ${mode} ${arm}`);
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = { name: error.name, message: error.message, stack: error.stack };
  console.error(error);
  process.exitCode = 1;
} finally { await save(); await rt?.close(); await fixture?.close(); }
