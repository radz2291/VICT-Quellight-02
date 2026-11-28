import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { readEvent } from './overlay.mjs';
import { markerText, revisions, workload } from './measurement/workload.mjs';
import { summarizePrompt, sha256 } from './measurement/prompt.mjs';

const contents = message => typeof message.content === 'string' ? message.content :
  message.content.map(part => part.text ?? '').join('\n');
const blockPattern = /<approved-room-state revision="(r[123])">[^\n]*?<\/approved-room-state>/g;
const elapsed = time => Math.round((performance.now() - time) * 1000) / 1000;
const matchBlock = prompt => prompt.flatMap((message, index) => [...contents(message).matchAll(blockPattern)]
  .map(match => ({ index, role: message.role, revision: match[1], block: match[0], offset: match.index })));

export async function foreground(fixture, runtime, story, thread, arm, scenario, turn, options = {}) {
  const { createConversationService } = await runtime.load('conversation/service');
  const base = fixture.adapter.createDeterministicOfflineModel({ script: {} });
  const captured = [], reads = [];
  const start = performance.now();
  let firstModelDeltaMs = null;
  const reply = options.echo ? `${turn.reply} Fixture carry ${markerText[options.echo]}.` : turn.reply;
  const inspect = (config, method) => {
    const blocks = matchBlock(config.prompt);
    const prompt = summarizePrompt(config.prompt, { includeMessages: options.include ?? scenario === 'short' });
    prompt.roomBlockBytes = blocks.reduce((total, entry) => total + Buffer.byteLength(entry.block), 0);
    captured.push({ method, prompt, blocks, view: config.prompt.map(message => message.role),
      firstSystem: config.prompt[0]?.role === 'system' ? {
        deskOffset: contents(config.prompt[0]).indexOf('<desk-context>'),
        baseInstructionSha256: sha256(contents(config.prompt[0]).split(/\n+<approved-room-state|\n+<desk-context>/)[0]),
      } : null });
  };
  const model = { ...base, modelId: 'zai-coding-plan/glm-5.3-flash',
    async doGenerate(config) {
      inspect(config, 'generate');
      const generated = await base.doGenerate(config);
      firstModelDeltaMs ??= elapsed(start);
      return { ...generated, content: [{ type: 'text', text: reply }] };
    },
    async doStream(config) {
      inspect(config, 'stream');
      return { stream: new ReadableStream({ start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        controller.enqueue({ type: 'text-start', id: 'fixture' });
        firstModelDeltaMs ??= elapsed(start);
        controller.enqueue({ type: 'text-delta', id: 'fixture', delta: reply });
        controller.enqueue({ type: 'text-end', id: 'fixture' });
        controller.enqueue({ type: 'finish', finishReason: 'stop', usage: { inputTokens: 12, outputTokens: 21, totalTokens: 33 } });
        controller.close();
      } }) };
    },
  };
  const service = createConversationService({ openDatabase: () => fixture.open(fixture.metered),
    readCredential: async () => 'fixture-unused', modelFactory: () => model });
  const before = fixture.meter.read();
  globalThis[readEvent] = event => reads.push(event);
  let accepted, admittedMs, settledMs;
  try {
    accepted = await service.start(story.owner, thread, { input: turn.input, idempotencyKey: randomUUID() });
    admittedMs = elapsed(start);
    await accepted.completion;
    settledMs = elapsed(start);
  } finally { delete globalThis[readEvent]; }
  const after = fixture.meter.read();
  const postgresWire = Object.fromEntries(Object.keys(after).map(key => [key, after[key] - before[key]]));
  const view = await service.events(story.owner, accepted.turnId, 0);
  assert.equal(view.turn.status, 'completed', JSON.stringify({ caseId: turn.caseId, view }));
  assert.equal(view.turn.projectionSettled, true);
  assert.equal(view.assistantMessage.text, reply);
  const admitted = await fixture.one(`SELECT activation_version,memory_authority_revision,memory_configuration->>'revision' AS memory_settings,
    desk_binding->>'roomId' AS room_id FROM quellight_product_v1.conversation_turns WHERE turn_id=$1 AND actor_id=$2`, [accepted.turnId, story.owner.actorId]);
  assert.equal(captured.length, 1, turn.caseId);
  assert.equal(reads.length, arm === 'room-block' ? 1 : 0);
  const [{ prompt, blocks, firstSystem }] = captured;
  const expected = arm === 'room-block' ? turn.expectedRevision : null;
  assert.equal(blocks.length, expected ? 1 : 0, turn.caseId);
  if (expected) {
    assert.equal(blocks[0].index, 0);
    assert.equal(blocks[0].role, 'system');
    assert.equal(blocks[0].revision, expected);
    assert.ok(firstSystem.deskOffset > blocks[0].offset + blocks[0].block.length);
  }
  if (reads.length) {
    assert.equal(reads[0].authority, admitted.memory_authority_revision);
    assert.equal(reads[0].revision, expected);
    assert.equal(reads[0].roomId, admitted.room_id);
    assert.equal(reads[0].actorId, story.owner.actorId);
    assert.equal(reads[0].conversationId, thread);
  }
  for (const revision of options.absent ?? []) assert.equal(prompt.markers[revision].length, 0, `${turn.caseId} leaked ${revision}`);
  if (options.carry) assert.ok(prompt.markers[options.carry].some(marker => marker.index > 0), `${turn.caseId} lacks prior carry`);
  return { caseId: turn.caseId, arm, scenario, index: turn.index, inputSha256: sha256(turn.input),
    replySha256: sha256(reply), expectedRevision: turn.expectedRevision, selectedRevision: reads[0]?.revision ?? null,
    ownerId: story.owner.actorId, thread, turnId: accepted.turnId, admitted, reads, prompt, blocks, firstSystem,
    echo: options.echo ?? null, confirmedAbsent: options.absent ?? [], requiredCarry: options.carry ?? null,
    foreground: { admittedMs, firstModelDeltaMs, firstEventMs: null, settledMs, modelCalls: captured.length, postgresWire,
      roomSelectionReads: reads.length, roomSelectionResultBytes: reads.reduce((n, e) => n + e.resultBytes, 0),
      namedReads: { roomApproval: reads.length },
      providerUsage: null } };
}

export async function maintenance(fixture, rt, story, options = {}) {
  const { createMemoryJobProcessor } = await rt.load('memory/worker');
  const { createMemoryDispatcher } = await rt.load('memory/dispatcher');
  const { processPendingMemoryCare } = await rt.load('memory/care-actions');
  const { publicConversationSources, enqueueMemoryJob } = await rt.load('memory/jobs');
  const { loadEffectiveMemorySettings } = await rt.load('memory/settings');
  const { openQuellightMemory } = await rt.load('memory/native');
  const calls = [], jobs = [];
  const base = fixture.adapter.createDeterministicOfflineModel({ script: {} });
  async function withMemory(work) {
    return fixture.withStores(async stores => {
      const effective = await loadEffectiveMemorySettings(stores.coordination.pool, story.owner.actorId, story.roomId);
      const open = await openQuellightMemory({ stores, ownerActorId: story.owner.actorId, conversationId: story.thread, effective });
      try { return await work(open, stores, effective); }
      finally { await open.hosted.close(); }
    });
  }

  const note = '- Preserve the original cut and retry identifier during fictional portal review.';
  const modelFor = job => {
    function plan(config) {
      const marker = job.kind === 'reflect' ? '## OBSERVATIONS TO REFLECT ON' : '## New Message History to Observe';
      const body = config.prompt.filter(message => message.role === 'user').map(contents).find(text => text.includes(marker));
      assert.ok(body);
      const carry = Object.keys(markerText).filter(key => body.includes(markerText[key]));
      const line = `${note}${carry.length ? ' Fixture carry ' + carry.map(key => markerText[key]).join(' ') + '.' : ''}`;
      const text = '<observations>\n' + (job.kind === 'reflect' ? '## Group portal\n' : '') + line + '\n</observations>';
      calls.push({ jobId: job.id, kind: job.kind, promptSha256: sha256(JSON.stringify(config.prompt)), markers: carry, reply: text });
      return text;
    }
    return { ...base, async doGenerate(config) { return { ...await base.doGenerate(config), content: [{ type: 'text', text: plan(config) }] }; },
      async doStream(config) {
        const text = plan(config);
        return { stream: new ReadableStream({ start(controller) {
          for (const event of [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'fixture' },
            { type: 'text-delta', id: 'fixture', delta: text }, { type: 'text-end', id: 'fixture' },
            { type: 'finish', finishReason: 'stop', usage: { inputTokens: 12, outputTokens: 21, totalTokens: 33 } }]) controller.enqueue(event);
          controller.close();
        } }) };
      },
    };
  };
  const process = createMemoryJobProcessor({ modelFactory: async job => () => modelFor(job) });
  const dispatch = createMemoryDispatcher({ actorId: story.owner.actorId, openDatabase: () => fixture.open(),
    reconcileCare: (stores, deadline, owner) => processPendingMemoryCare(stores, deadline.getTime(), {}, owner),
    async process(job, stores, deadline) {
      const outcome = await process(job, stores, deadline);
      jobs.push({ id: job.id, kind: job.kind, conversationId: job.conversation_id, authority: job.authority_revision, ...outcome });
      return outcome;
    },
  });
  await dispatch();
  let reflection;
  if (options.reflect) {
    const queued = await withMemory(async ({ service }, stores, effective) => {
      const current = await service.inspect(story.thread);
      assert.ok(current.current?.observations);
      const source = await publicConversationSources(stores.coordination.pool, story.owner.actorId, story.thread);
      const claim = await stores.coordination.acquire({ scopeId: 'quellight:conversation:' + story.thread,
        actorId: story.owner.actorId, ownerId: randomUUID(), leaseMs: 15000 });
      assert.equal(claim.status, 'acquired');
      try { return await stores.coordination.withFence(claim.lease, sql => enqueueMemoryJob(sql, {
        actorId: story.owner.actorId, conversationId: story.thread, kind: 'reflect', sourceRevision: source.revision,
        configuration: effective, authorityRevision: current.authorityRevision,
      })); }
      finally { await stores.coordination.release(claim.lease); }
    });
    await dispatch();
    reflection = await withMemory(async ({ service }) => {
      const row = await service.operation(story.thread, 'memory-job:' + queued.id);
      assert.equal(row?.status, 'completed', JSON.stringify(jobs));
      assert.equal(row.result?.reflected, true);
      assert.equal(row.events.filter(event => event.name === 'published').length, 1);
      return { jobId: queued.id, operationId: row.operation_id, authority: row.authority_revision,
        generation: row.result.snapshot.current.generation, observations: row.result.snapshot.current.observations };
    });
  }
  return { calls, jobs, ...(reflection ? { reflection } : {}) };
}

export const frozen = { workload, markerText, revisions };
