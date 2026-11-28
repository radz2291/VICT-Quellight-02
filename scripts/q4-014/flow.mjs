import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixtureDsn, withDatabase } from './database.mjs';
import { fixtureClient, until } from './http.mjs';
import { mira, solo } from './cases.mjs';
import { miraLive, soloLive } from './live-cases.mjs';
import { fixtureOwner } from './synth-auth.mjs';

const [operation, sessionFile, outputDir] = process.argv.slice(2);
assert.ok(['offline', 'learn', 'resume-solo', 'refresh', 'deliver'].includes(operation));
await mkdir(outputDir, { recursive: true });
const c = await fixtureClient(sessionFile);
const dsn = fixtureDsn(c.config.database, c.config.pgPort);
const product = 'quellight_product_v1';
const sha = text => createHash('sha256').update(text).digest('hex');
const query = (sql, args = []) => withDatabase(dsn, async db => (await db.query(sql, args)).rows);
const updateLearn = ['resume-solo', 'refresh'].includes(operation);
const file = join(outputDir, (updateLearn ? 'learn' : operation) + '.json');
const report = updateLearn ? JSON.parse(await readFile(file, 'utf8')) :
  { operation, mode: c.config.mode, guidance: c.config.guidance, results: {} };
const save = () => writeFile(file, JSON.stringify(report, null, 2) + '\n');
await c.signIn();
const beforeDesk = (await query('SELECT count(*)::int n FROM '+product+'.desk_items WHERE actor_id=$1', [fixtureOwner]))[0].n;
const reportState = async (name, result) => { report.results[name] = result; await save(); };
const readGuidance = async id => (await c.request('/api/conversations/'+id+'/room-guidance', { accept: [200, 409] }));
const trace = async () => {
  let parsed;
  try { parsed = await readFile(c.config.trace, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return parsed.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
};
const fields = (view, dimension) => view.fields.find(field => field.dimension === dimension);
const expect = view => ({ expectedRevision: view.revision, expectedAuthorityRevision: view.authorityRevision });
async function waitGuidance(id, test, label) {
  return until(async () => {
    const read = await readGuidance(id);
    return read.status === 200 && test(read.body) && read.body;
  }, { timeout: c.config.mode === 'authorized-zai' ? 320_000 : 40_000, interval: 750, label });
}
async function seed(name, training, checkpoint = name) {
  const room = await c.room(name, 'Review the draft and keep the owner’s decisions clear.');
  const source = await c.conversation(room.id, 'Learning conversation');
  await reportState(checkpoint + 'Source', { room, source });
  const learnedTurn = await c.say(source.id, training);
  const view = await waitGuidance(source.id, x => x.fields.length === 3, name + ' learned fields');
  const [publication] = await query('SELECT job_id,source_revision,state,execution_ref FROM '+product+'.room_learning_jobs '+
    'WHERE actor_id=$1 AND room_id=$2 AND state=$3', [fixtureOwner, room.id, 'published']);
  assert.equal(publication?.execution_ref?.status, 'completed');
  assert.ok(publication.source_revision);
  for (const field of view.fields) {
    assert.equal(field.origin, 'learned');
    assert.ok(field.sources.length && field.sources.every(ref => ref.conversationId === source.id && training.includes(ref.quote)));
  }
  const fresh = await c.conversation(room.id, 'Fresh review');
  return { room, source, fresh, view, learnedTurn: { id: learnedTurn.turnId, reply: learnedTurn.assistantMessage.text },
    trainingMode: c.config.mode, publication };
}
const textOf = content => typeof content === 'string' ? content :
  Array.isArray(content) ? content.filter(part => part.type === 'text').map(part => part.text).join('\n') : '';
function sdkFor(log, input) {
  return log.find(row => row.kind === 'sdk-input' && row.role === 'conversation' && row.inputs.prompt.filter(m=>m.role==='user')
    .map(m => textOf(m.content)).at(-1)?.includes(input));
}
const tag = /<room-guidance>\n[\s\S]*?\n<\/room-guidance>/g;
async function witness(result, input, conversation) {
  const [bound] = await query('SELECT room_guidance_revision,activation_version FROM '+product+'.conversation_turns WHERE turn_id=$1',
    [result.turnId]);
  assert.ok(bound);
  const [revision] = bound.room_guidance_revision ? await query('SELECT v.block AS b,v.revision AS r FROM '+
    product+'.room_learning_revisions v JOIN '+product+'.conversations c ON c.room_id=v.room_id AND c.actor_id=v.actor_id '+
    'WHERE c.id=$1 AND v.revision=$2', [conversation, bound.room_guidance_revision]) : [];
  const log = await trace();
  const sdk = sdkFor(log, input);
  assert.ok(sdk, 'Model receipt not captured');
  const exact = sdk.inputs.prompt.filter(item => item.role === 'system').map(item => textOf(item.content)).join('\n');
  const voiceSha256 = sha(Buffer.from(exact).subarray(0, 30_489));
  assert.equal(voiceSha256,'23adc723ab5a8d25dcc1371e2a70df248c4f6db1eb9c141df58f5c2ca8b77254');
  const blocks = [...exact.matchAll(tag)].map(match => match[0]);
  assert.equal(blocks.length, revision ? 1 : 0);
  if (revision) assert.equal(blocks[0], revision.b);
  const normalized = structuredClone(sdk.inputs);
  for (const item of normalized.prompt) {
    if (item.role === 'system' && typeof item.content === 'string')
      item.content = item.content.replace(/\n\n<room-guidance>\n[\s\S]*?\n<\/room-guidance>/g, '');
    if (Array.isArray(item.content)) for (const part of item.content) {
      if (part.providerOptions?.mastra?.createdAt !== undefined) part.providerOptions.mastra.createdAt = 'capture-time';
    }
  }
  const wire = log.find(row => row.kind === 'wire-input' && row.payload.messages.filter(m=>m.role==='user')
    .map(m=>textOf(m.content)).at(-1)?.includes(input));
  let wireReceipt;
  if (wire) {
    const payload = structuredClone(wire.payload);
    for (const item of payload.messages) if (item.role === 'system' && typeof item.content === 'string')
      item.content = item.content.replace(/\n\n<room-guidance>\n[\s\S]*?\n<\/room-guidance>/g, '');
    wireReceipt = { bytes: wire.bytes, nonRoomInputSha256: sha(JSON.stringify(payload)),
      usage: log.findLast(row => row.kind === 'wire-usage' && row.wire === wire.wire)?.usage ?? null };
  }
  return {
    turnId: result.turnId, activationVersion: bound.activation_version, roomRevision: bound.room_guidance_revision,
    block: revision?.b ?? null, promptBytes: sdk.promptBytes, promptSha256: sdk.sha256,
    nonRoomSdkInputSha256: sha(JSON.stringify(normalized)), lookupRowBytes: Buffer.byteLength(JSON.stringify(revision ? [revision] : [])), voiceSha256,
    wire: wireReceipt, reply: result.assistantMessage.text,
  };
}

if (operation === 'offline') {
  assert.equal(c.config.mode, 'deterministic-fixture');
  const story = await seed('Cedar-47 correction and pending work', mira.training);
  await reportState('startingRevision', story);
  const pending = await c.conversation(story.room.id, 'Stale proposal in flight');
  await c.operator('hold');
  try {
    await c.say(pending.id, mira.pending);
    await until(async () => (await c.operator('state')).held === 1, { timeout: 30_000, label: 'held stale synthesis' });
    const [queued] = await query('SELECT j.job_id,j.state,j.base_revision FROM '+product+'.room_learning_jobs j '+
      'JOIN '+product+'.memory_jobs m ON m.id=j.job_id WHERE m.conversation_id=$1 AND j.state=$2', [pending.id, 'pending']);
    assert.ok(queued && queued.base_revision === story.view.revision);
    const key = randomUUID(), edit = { ...expect(story.view), dimension: 'intent', text: mira.ownerCorrection };
    const corrected = await c.care(story.fresh.id, 'correct', edit, key);
    assert.equal(corrected.body.ok, true);
    const repeat = await c.care(story.fresh.id, 'correct', edit, key);
    assert.equal(repeat.body.replay, true);
    assert.equal(repeat.body.value.revision, corrected.body.value.revision);
    const conflict = await c.care(story.fresh.id, 'correct', edit, randomUUID(), [409]);
    assert.equal(conflict.body.code, 'ROOM_GUIDANCE_CHANGED');
    await reportState('pendingAndCorrection', { queued, corrected: corrected.body.value, replay: repeat.body.replay, staleCorrectionRejected: true });
  } finally { await c.operator('release'); }
  const jobId = report.results.pendingAndCorrection.queued.job_id;
  const stale = await until(async () => (await query('SELECT state,failure_code FROM '+product+'.room_learning_jobs WHERE job_id=$1', [jobId]))[0]
    ?.state === 'superseded', { timeout: 30_000, label: 'fenced stale publication' });
  assert.equal(stale, true);
  const current = await c.inspect(story.source.id);
  assert.equal(current.revision, report.results.pendingAndCorrection.corrected.revision);
  assert.equal(fields(current, 'intent').text, mira.ownerCorrection);
  for (const id of ['understanding', 'attunement']) assert.deepEqual(fields(current,id),fields(story.view,id));
  const beforeDuplicate = (await trace()).filter(row=>row.kind==='sdk-input').length;
  const duplicate = await c.operator('dispatch');
  assert.equal(duplicate.handled,0);
  assert.equal((await trace()).filter(row=>row.kind==='sdk-input').length,beforeDuplicate);
  await reportState('offlineReplay', { staleJob: jobId, superseded: true, revision: current.revision,
    preservedDimensions: ['understanding','attunement'], duplicateModelCalls: 0 });
  const fresh = await witness(await c.say(story.fresh.id,mira.fresh),mira.fresh,story.fresh.id);
  assert.equal(fresh.roomRevision,current.revision);
  assert.match(fresh.reply,/You give final approval/i);
  const reopenInput = 'Having reopened the old chat, please summarize who has final approval now. Leave the Desk unchanged.';
  const reopened = await witness(await c.say(story.source.id,reopenInput),reopenInput,story.source.id);
  assert.equal(reopened.roomRevision,current.revision);
  assert.match(reopened.block,/I give final approval/);
  const otherRoom = await c.room('Distinct room isolation','Another packet');
  const other = await c.conversation(otherRoom.id,'An unrelated review');
  const otherInput = 'Who approves work in this room? Answer here without touching the Desk.';
  const isolated = await witness(await c.say(other.id,otherInput),otherInput,other.id);
  assert.equal(isolated.roomRevision,null);
  assert.equal(isolated.lookupRowBytes,2);
  await reportState('offlineAdmission', { fresh, reopened, isolated });
  const original = fields(current,'understanding').sources[0];
  const goodRestore = await c.care(story.fresh.id,'restore',{ ...expect(current), revision:story.view.revision });
  assert.ok(goodRestore.body.value.revision > current.revision);
  const restored = await c.inspect(story.fresh.id);
  const forgot = await c.care(story.fresh.id,'forget',{...expect(restored),sourceId:original.id,sourceConversationId:original.conversationId});
  assert.ok(forgot.body.value.revision > restored.revision);
  const forgotten = await c.inspect(story.fresh.id);
  assert.ok(forgotten.fields.every(field=>field.sources.every(source=>source.id!==original.id)));
  const refused = await c.care(story.fresh.id,'restore',{...expect(forgotten),revision:story.view.revision},randomUUID(),[409]);
  const transcript = await c.detail(story.source.id);
  assert.ok(transcript.messages.some(message=>message.text.includes(original.quote)));
  await reportState('offlineCare', { eligibleRestore:goodRestore.body.value, forgotten:forgot.body.value,
    refusedRestore:refused.body.code, originalTranscriptStillReadable:true });
} else if (operation === 'learn' || operation === 'resume-solo') {
  if (operation === 'learn') {
    const cedar = await seed('Cedar-47 draft approval',c.config.mode==='authorized-zai'?miraLive.training:mira.training,'mira');
    await reportState('miraBefore',cedar);
    const correction = await c.say(cedar.source.id,c.config.mode==="authorized-zai"?miraLive.correction:mira.correction);
    const corrected = await waitGuidance(cedar.source.id,x => x.revision>cedar.view.revision &&
      /(?:owner gives|I give) final approval/i.test(fields(x,'intent')?.text ?? ''),'ordinary conversation correction');
    assert.match(fields(corrected,'understanding').text,/Cedar-47/);
    assert.match(fields(corrected,'attunement').text,/vendor attendance|confirm/i);
    await reportState('mira',{...cedar,view:corrected,correctionReply:correction.assistantMessage.text});
  } else assert.ok(report.results.mira?.view?.fields?.length === 3, 'Mira facts required before resuming the second case');
  const practice = await seed(operation === 'resume-solo'?'Solo review working agreement · deterministic training':'Solo review working agreement',
    c.config.mode==='authorized-zai'?soloLive.training:solo.training,operation === 'resume-solo'?'soloRecovered':'solo');
  await reportState('solo',practice);
  const sandbox = await c.room('Other room control','General planning');
  const peer = await c.conversation(sandbox.id,'Fresh different-room check');
  await reportState('scope',{room:sandbox,conversation:peer});
} else if (operation === 'refresh') {
  for (const name of ['mira','solo']) {
    const stored = report.results[name];
    const view = await c.inspect(stored.fresh.id);
    assert.deepEqual(view.fields, stored.view.fields);
    await reportState(name,{...stored,admissionView:view});
  }
} else {
  const pipeline = JSON.parse(await readFile(join(outputDir,'learn.json'),'utf8'));
  for (const [name,prompt] of [['mira',mira.fresh],['solo',solo.fresh]]) {
    const caseRecord = pipeline.results[name];
    const id = caseRecord.fresh.id;
    const w = await witness(await c.say(id,prompt),prompt,id);
    assert.equal(w.roomRevision,c.config.guidance==='on'?(caseRecord.admissionView??caseRecord.view).revision:null);
    await reportState(name,w);
  }
}
const afterDesk = (await query('SELECT count(*)::int n FROM '+product+'.desk_items WHERE actor_id=$1', [fixtureOwner]))[0].n;
assert.equal(afterDesk,beforeDesk,'The synthetic conversations must not create Desk items.');
report.checks = { deskItemsBefore:beforeDesk, deskItemsAfter:afterDesk, passed:true };
await save();
console.log(JSON.stringify({ operation, mode:c.config.mode, guidance:c.config.guidance, stages:Object.keys(report.results), passed:true }));
