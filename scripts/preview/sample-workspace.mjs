import { randomUUID } from 'node:crypto';
import { createSampleMemory } from './sample-memory.mjs';
import { createSampleDesk } from './sample-desk.mjs';

// Synthetic UI transport only. Nothing here is imported by a product route.
export const SAMPLE_OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const SAMPLE_ROOM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const SAMPLE_CONVERSATION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SECOND_CONVERSATION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const PREVIEW_LABEL = 'LOCAL UI PREVIEW · SAMPLE CONTENT';
const cannedReply = 'Sample reply — this is written in advance for the local preview.\n\nStart with one small pocket of space. Choose something that matters, give it an hour in your week, and leave the rest open for now.';

const copy = value => structuredClone(value);
const now = () => new Date().toISOString();
const failure = (status, code, message) => ({ status, body: { ok: false, code, message } });
const ok = (body, status = 200, headers) => ({ status, body: copy(body), headers });
const validKey = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{8,128}$/.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);

export function createSampleWorkspace() {
  const timestamp = now();
  const rooms = [{ id: SAMPLE_ROOM, name: 'Home', purpose: 'A little room for everyday thoughts.',
    archivedAt: null, revision: 1, createdAt: timestamp, updatedAt: timestamp }];
  const conversations = [
    { id: SAMPLE_CONVERSATION, roomId: SAMPLE_ROOM, threadId: `sample:${SAMPLE_CONVERSATION}`, title: 'Making room for the week', archivedAt: null, revision: 1, createdAt: timestamp, updatedAt: timestamp },
    { id: SECOND_CONVERSATION, roomId: SAMPLE_ROOM, threadId: `sample:${SECOND_CONVERSATION}`, title: 'A small idea', archivedAt: null, revision: 1, createdAt: timestamp, updatedAt: timestamp }
  ];
  const messages = new Map([
    [SAMPLE_CONVERSATION, [
      { id: 'sample-week-user', role: 'user', text: 'I want a little more room in my week. Everything feels useful, but I’m missing time for myself.', createdAt: timestamp },
      { id: 'sample-week-assistant', role: 'assistant', text: 'You don’t have to rearrange everything at once.\n\nWhat is one thing you would like to make time for this week — just because it matters to you?', createdAt: timestamp, status: 'completed' }
    ]],
    [SECOND_CONVERSATION, [
      { id: 'sample-idea-user', role: 'user', text: 'I’ve been thinking about keeping a small notebook of things I notice on my walks.', createdAt: timestamp },
      { id: 'sample-idea-assistant', role: 'assistant', text: 'That sounds like a lovely way to pay attention. A sentence, a colour, or something you overheard is enough to begin.', createdAt: timestamp, status: 'completed' }
    ]]
  ]);
  const receipts = new Map();
  const memory = createSampleMemory({ rooms, conversations, messages, receipts });
  const desk = createSampleDesk({ rooms, receipts });
  const turns = new Map();
  const latest = new Map();
  const requests = new Map();
  const timers = new Set();
  let disposed = false;

  const conversationById = id => conversations.find(item => item.id === id);
  const roomById = id => rooms.find(item => item.id === id);
  const turnView = turn => ({ id: turn.id, streamId: `sample:${turn.id}`, status: turn.status, projectionSettled: turn.status !== 'running' });
  const turnMessage = (turn, role) => messages.get(turn.conversationId).find(message => message.id === `${turn.id}:${role}`) ?? null;
  function finish(turn, status) {
    if (turn.status !== 'running') return;
    turn.status = status;
    if (turn.timer) { clearTimeout(turn.timer); timers.delete(turn.timer); }
    const text = turn.events.map(event => event.delta).join('');
    if (text) messages.get(turn.conversationId).push({ id: `${turn.id}:assistant`, role: 'assistant', text, createdAt: now(), status });
    conversationById(turn.conversationId).updatedAt = now();
  }
  function animate(turn) {
    const chunks = cannedReply.match(/.{1,30}(?:\s|$)|.{1,30}/gs) ?? [cannedReply];
    let index = 0;
    const next = () => {
      if (disposed || turn.status !== 'running') return;
      if (turn.timer) timers.delete(turn.timer);
      if (index >= chunks.length) { finish(turn, 'completed'); return; }
      turn.events.push({ sequence: turn.events.length + 1, kind: 'text.delta', delta: chunks[index++] });
      // Preview animation only: no model or inference budget exists here.
      turn.timer = setTimeout(next, 700);
      timers.add(turn.timer);
      turn.timer.unref();
    };
    turn.timer = setTimeout(next, 500);
    timers.add(turn.timer);
    turn.timer.unref();
  }
  function detail(id) {
    const conversation = conversationById(id);
    if (!conversation) return failure(404, 'CONVERSATION_NOT_FOUND', 'This sample conversation could not be found.');
    const last = turns.get(latest.get(id));
    return ok({ conversation, messages: messages.get(id), activeTurn: last?.status === 'running' ? turnView(last) : null, lastTurn: last ? turnView(last) : null });
  }

  function action(body) {
    if (!object(body) || !validKey(body.idempotencyKey) || !object(body.input)) return failure(400, 'ACTION_INPUT_INVALID', 'Check the sample values.');
    const signature = JSON.stringify({ actionId: body.actionId, input: body.input });
    const prior = receipts.get(body.idempotencyKey);
    if (prior) return prior.signature === signature ? ok({ ...prior.result, replay: true })
      : failure(409, 'ACTION_CONFLICT', 'This preview request was already used. Try the change again.');
    const input = body.input;
    let value;
    if (body.actionId === 'room.create') {
      if (typeof input.name !== 'string' || !input.name.trim()) return failure(400, 'ACTION_INPUT_INVALID', 'Give the room a name.');
      value = { id: randomUUID(), name: input.name.trim(), purpose: typeof input.purpose === 'string' ? input.purpose.trim() : '',
        archivedAt: null, revision: 1, createdAt: now(), updatedAt: now() };
      rooms.push(value);
    } else if (['room.rename', 'room.archive'].includes(body.actionId)) {
      value = roomById(input.id);
      if (!value || value.archivedAt) return failure(409, 'ROOM_UNAVAILABLE', 'Choose an active sample room.');
      if (value.revision !== input.revision) return failure(409, 'REVISION_CONFLICT', 'This sample room changed. Refresh and try again.');
      if (body.actionId === 'room.rename') {
        if (typeof input.name !== 'string' || !input.name.trim()) return failure(400, 'ACTION_INPUT_INVALID', 'Give the room a name.');
        value.name = input.name.trim();
      } else value.archivedAt = now();
      value.revision++;
      value.updatedAt = now();
    } else if (body.actionId === 'conversation.create') {
      const room = roomById(input.roomId);
      if (!room || room.archivedAt) return failure(409, 'ROOM_UNAVAILABLE', 'Choose an active sample room.');
      const id = randomUUID();
      value = { id, roomId: room.id, threadId: `sample:${id}`, title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : 'New conversation',
        archivedAt: null, revision: 1, createdAt: now(), updatedAt: now() };
      conversations.unshift(value);
      messages.set(id, []);
    } else return failure(403, 'PREVIEW_ACTION_UNAVAILABLE', 'That action is outside this local UI preview.');
    const result = { ok: true, value: copy(value), replay: false };
    receipts.set(body.idempotencyKey, { signature, result: copy(result) });
    return ok(result);
  }

  return {
    defaultQuery: `?room=${SAMPLE_ROOM}&conversation=${SAMPLE_CONVERSATION}`,
    handle(method, url, body) {
      if (disposed) return failure(503, 'PREVIEW_CLOSED', 'Restart the local preview.');
      const path = url.pathname;
      if (/^\/api\/conversations\/[^/]+\/desk-context$/.test(path) && method === 'GET') return ok({ status: 'selected', selection: { schema: 'quellight.desk-context@1', roomId: SAMPLE_ROOM, authorityRevision: '0', items: [{ id: 'sample-carried', revision: 1, attention: 'carried', title: 'Sample Desk selection · local preview only', kind: 'Note', status: '', body: 'Give the important things time, and let the rest wait.' }, { id: 'sample-within-reach', revision: 1, attention: 'within-reach', title: 'A little room in the week', kind: 'Plan', status: '' }], text: 'Sample Desk selection · local preview only\n\nCarried · What matters this month · version 1\nGive the important things time, and let the rest wait.\n\nWithin reach · A little room in the week · version 1\nIndex only; text was not opened by this selection.', digest: 'synthetic-desk-selection' }, reads: [{ invocationId: 'sample-read', itemId: 'sample-within-reach', revision: 1, title: 'A little room in the week', at: timestamp }] });
      const deskResult = desk.handle(method, url, body);
      if (deskResult) return deskResult;
      const memoryResult = memory.handle(method, url, body);
      if (memoryResult) return memoryResult;
      if (path.startsWith('/auth/') && method !== 'GET' && method !== 'HEAD') {
        return failure(403, 'LOCAL_PREVIEW_NO_AUTH', 'This local preview uses sample content and does not use sign-in.');
      }
      if (path === '/api/bootstrap' && method === 'GET') return ok({ user: { id: SAMPLE_OWNER, email: 'sample@quellight.invalid' }, rooms, conversations });
      if (path === '/api/actions' && method === 'POST') return action(body);
      const conversationPath = /^\/api\/conversations\/([^/]+)(?:\/(turns|export))?$/.exec(path);
      if (conversationPath) {
        const [, id, operation] = conversationPath;
        const conversation = conversationById(id);
        if (!conversation) return failure(404, 'CONVERSATION_NOT_FOUND', 'This sample conversation could not be found.');
        if (!operation && method === 'GET') return detail(id);
        if (operation === 'export' && method === 'GET') return { status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': 'attachment; filename="quellight-local-sample.txt"' },
          body: `${PREVIEW_LABEL}\nNothing in this file was generated by a model.\n\n# ${conversation.title}\n\n${messages.get(id).map(message => `## ${message.role === 'user' ? 'You' : 'Quellight'}\n\n${message.text}`).join('\n\n')}\n` };
        if (operation === 'turns' && method === 'POST') {
          if (!object(body) || typeof body.input !== 'string' || !body.input.trim() || !validKey(body.idempotencyKey)) return failure(400, 'TURN_INPUT_INVALID', 'Write a message to try the sample reply.');
          const requestKey = `${id}:${body.idempotencyKey}`;
          const prior = requests.get(requestKey);
          if (prior) return prior.input === body.input ? ok({ turnId: prior.id, conversationId: id, status: prior.status, userMessage: turnMessage(prior, 'user') }, 202)
            : failure(409, 'TURN_IDEMPOTENCY_CONFLICT', 'This sample request was already used for different text.');
          if (roomById(conversation.roomId)?.archivedAt) return failure(409, 'ROOM_ARCHIVED', 'Choose an active sample room.');
          if (turns.get(latest.get(id))?.status === 'running') return failure(409, 'CONVERSATION_BUSY', 'Stop the sample reply or let it finish first.');
          const turn = { id: `sample:${randomUUID()}`, conversationId: id, input: body.input, status: 'running', events: [], timer: undefined };
          turns.set(turn.id, turn); latest.set(id, turn.id); requests.set(requestKey, turn);
          messages.get(id).push({ id: `${turn.id}:user`, role: 'user', text: body.input, createdAt: now(), requestKey: body.idempotencyKey });
          conversation.updatedAt = now();
          animate(turn);
          return ok({ turnId: turn.id, conversationId: id, status: 'running', userMessage: turnMessage(turn, 'user') }, 202);
        }
      }
      const turnPath = /^\/api\/turns\/([^/]+)\/(stream|events|cancel)$/.exec(path);
      if (turnPath) {
        const turn = turns.get(turnPath[1]);
        if (!turn) return failure(404, 'TURN_NOT_FOUND', 'This sample reply could not be found.');
        if (turnPath[2] === 'stream' && method === 'GET') return failure(404, 'LOCAL_SAMPLE_CURSOR_READ', 'The local sample uses cursor reads.');
        if (turnPath[2] === 'cancel' && method === 'POST') { finish(turn, 'cancelled'); return ok({ turnId: turn.id, status: turn.status }); }
        if (turnPath[2] === 'events' && method === 'GET') {
          const after = Number(url.searchParams.get('after') ?? 0);
          if (!Number.isSafeInteger(after) || after < 0) return failure(400, 'CURSOR_INVALID', 'Refresh this sample conversation.');
          return ok({ events: turn.events.filter(event => event.sequence > after), nextCursor: Math.max(after, turn.events.length), turn: turnView(turn), assistantMessage: turnMessage(turn, 'assistant') });
        }
      }
      // Never pass an unexpected API request through to the real app server.
      return failure(403, 'LOCAL_PREVIEW_ROUTE_BLOCKED', 'That request is outside this local UI preview.');
    },
    dispose() { disposed = true; for (const timer of timers) clearTimeout(timer); timers.clear(); }
  };
}
