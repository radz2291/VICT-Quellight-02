import { createHash } from 'node:crypto';
import catalog from '../../src/lib/server/prompts/memory-catalog.json' with { type: 'json' };
import conversationPrompt from '../../src/lib/server/prompts/conversation.json' with { type: 'json' };

// Labelled local presentation fixture only. No model, credentials, product data or native memory calls.
const roles = ['conversation', 'observer', 'reflector', 'recall', 'workingMemory'];
const clone = value => structuredClone(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const defaults = () => ({ configuration: { responseGuidance: '', automaticLearning: true, personalPreferences: true, recallScope: 'current-room' },
  prompts: { conversation: { mode: 'catalog' }, observer: { mode: 'native-default' }, reflector: { mode: 'native-default' }, recall: { mode: 'native-default' }, workingMemory: { mode: 'preset', id: 'personal-preferences' } } });
const inherited = purpose => ({ configuration: { purpose, overrides: Object.fromEntries(Object.keys(defaults().configuration).map(key => [key, { mode: 'inherit' }])) }, prompts: Object.fromEntries(roles.map(key => [key, { mode: 'inherit' }])) });
const result = (body, status = 200) => ({ status, body: clone(body) });
const error = (code, message, status = 400) => result({ ok: false, code, message }, status);
export function createSampleMemory({ rooms, conversations, messages, receipts }) {
  const revision = (content, number = 0, operation = 'initial', restoredFromRevision = null) => ({ revision: number, contentRevision: digest(content), content: clone(content), operation, restoredFromRevision, createdAt: number ? new Date().toISOString() : null });
  const saved = new Map([['app', [revision(defaults())]]]);
  const personal = new Map(), excluded = new Map(), authority = new Map();
  function history(key) {
    if (!saved.has(key)) saved.set(key, [revision(inherited(rooms.find(room => room.id === key)?.purpose ?? ''))]);
    return saved.get(key);
  }
  function effective(app, room) {
    const values = Object.fromEntries(Object.entries(room.configuration.overrides).map(([key, choice]) => [key, choice.mode === 'inherit' ? app.configuration[key] : choice.value]));
    const resolved = Object.fromEntries(roles.map(role => {
      const override = room.prompts[role], selected = override.mode === 'inherit' ? app.prompts[role] : override.value;
      let text = selected.text;
      if (selected.mode === 'catalog') text = conversationPrompt.template.join('\n');
      if (selected.mode === 'preset') text = catalog.presets['personal-preferences'].template.join('\n');
      if (role === 'conversation') text = text.replace(/\{\{\s*roomPurpose\s*\}\}/g, () => room.configuration.purpose);
      return [role, { selection: selected, source: override.mode === 'inherit' ? 'app' : 'room', ...(text === undefined ? {} : { text }) }];
    }));
    return { configuration: { purpose: room.configuration.purpose, values }, prompts: { roles: resolved } };
  }
  function settings(roomId) {
    const app = history('app')[0], room = roomId ? history(roomId)[0] : null;
    const roomContent = room ? clone(room.content) : inherited('');
    const record = rooms.find(room => room.id === roomId);
    roomContent.configuration.purpose = record?.purpose ?? '';
    return { app, room, appHistory: history('app'), roomHistory: roomId ? history(roomId) : [], effective: { ...effective(app.content, roomContent), ...(record ? { versions: { roomRecordRevision: record.revision } } : {}) }, catalog };
  }
  function inspect(id, turnId) {
    const source = messages.get(id) ?? [];
    const removed = excluded.get(id) ?? [];
    const text = personal.get(id) ?? '# Personal preferences\n\n- Prefers a calm, concise response.\n- Values time to think without pressure.';
    const selectedTurn = turnId || 'sample-reply';
    const timestamp = source.at(-1)?.createdAt ?? new Date().toISOString();
    return { conversationId: id, statusLabel: 'Sample memory · local preview only',
      observations: { id: removed.length ? null : 'sample-observation', text: removed.length ? '' : 'The user wants more room in their week and more time for themselves. Everything feels useful, making it difficult to choose what to leave out.',
        updatedAt: timestamp, emptyText: removed.length ? 'Derived observations were cleared after this sample change.' : 'No saved observations yet.', history: [], prepared: [] },
      personal: { text, updatedAt: timestamp, enabled: true, ownerManaged: personal.has(id) },
      activity: [{ id: 'sample-activity', label: removed.length ? 'Source exclusion saved' : 'Observations saved', status: 'Sample completed state', at: timestamp }],
      sources: source.map(message => ({ id: message.id, conversationId: id, label: message.role === 'user' ? 'Your message' : 'Quellight reply', text: message.text, role: message.role, at: message.createdAt, excluded: removed.includes(message.id) })),
      replies: [{ turnId: 'sample-reply', label: 'Reply about making room for the week' }],
      context: { turnId: selectedTurn, scope: 'memory-additions', stage: 'selected-before-call', text: 'Sample selected memory\n\nPersonal preference: prefers calm, concise responses.\n\nRecent message: wants more room in their week.', omissions: ['private reasoning', 'provider metadata', 'base instructions', 'current input', 'tool definitions', 'later steps'], revisionLabel: 'Sample record, selected before the reply' },
      authority: { revision: String(authority.get(id) ?? 0), excludedMessageIds: removed }, controls: { canCorrect: true, canForget: true, canRetry: true } };
  }
  return {
    handle(method, url, body) {
      const path = url.pathname;
      if (path === '/api/memory/settings' && method === 'GET') return result(settings(url.searchParams.get('roomId') ?? ''));
      if (path === '/api/memory/settings/preview' && method === 'POST') {
        try {
          const content = JSON.parse(body.content), current = settings(body.roomId ?? '');
          return result({ effective: effective(body.target === 'app' ? content : current.app.content, body.target === 'room' ? content : current.room?.content ?? inherited('')) });
        } catch { return error('MEMORY_SETTINGS_INVALID', 'Check the sample settings.'); }
      }
      const read = /^\/api\/conversations\/([^/]+)\/memory$/.exec(path);
      if (read && method === 'GET') {
        const id = read[1];
        if (!conversations.some(item => item.id === id)) return error('CONVERSATION_NOT_FOUND', 'Open a sample conversation.', 404);
        const data = inspect(id, url.searchParams.get('turnId'));
        const authorityRevision = data.authority.revision;
        const version = digest([authorityRevision, data.sources.length, personal.get(id)]);
        switch (url.searchParams.get('view')) {
          case 'summary': return result({ ...data, sources: [], context: null, version, repliesCursor: null, moreObservations: false });
          case 'version': return result({ version });
          case 'sources': return result({ sources: data.sources, nextCursor: null, authorityRevision });
          case 'replies': return result({ replies: data.replies, nextCursor: null });
          case 'context': return result({ context: data.context, authorityRevision });
          case 'observations': return result({ history: data.observations.history, authorityRevision });
          default: return result(data);
        }
      }
      if (path !== '/api/actions' || method !== 'POST' || !String(body?.actionId).startsWith('memory.')) return undefined;
      if (!body.input || !/^[a-zA-Z0-9:_-]{8,128}$/.test(body.idempotencyKey)) return error('ACTION_INPUT_INVALID', 'Check the sample request.');
      const signature = JSON.stringify({ actionId: body.actionId, input: body.input }), prior = receipts.get(body.idempotencyKey);
      if (prior) return prior.signature === signature ? result({ ...prior.result, replay: true }) : error('ACTION_CONFLICT', 'This request was already used.', 409);
      const input = body.input; let value;
      if (body.actionId === 'memory.settings.save' || body.actionId === 'memory.settings.restore') {
        const key = input.target === 'room' ? input.roomId : 'app', versions = history(key);
        if (input.expectedRevision !== versions[0].revision) return error('MEMORY_SETTINGS_CONFLICT', 'These settings changed. Reopen them and try again.', 409);
        try {
          const content = body.actionId.endsWith('restore') ? versions.find(item => item.revision === input.restoreRevision)?.content : JSON.parse(input.content);
          if (!content) return error('MEMORY_SETTINGS_INVALID', 'Choose an available version.');
          value = revision(content, versions[0].revision + 1, body.actionId.endsWith('restore') ? 'restore' : 'save', input.restoreRevision ?? null);
          versions.unshift(value);
          if (key !== 'app') { const room = rooms.find(item => item.id === key); room.purpose = content.configuration.purpose; room.revision++; }
        } catch { return error('MEMORY_SETTINGS_INVALID', 'Check the sample settings.'); }
      } else if (body.actionId === 'memory.retry') {
        value = { queued: true };
      } else if (['memory.correct', 'memory.forget', 'memory.resume'].includes(body.actionId)) {
        const id = input.conversationId;
        if (!conversations.some(item => item.id === id)) return error('CONVERSATION_NOT_FOUND', 'Open a sample conversation.', 404);
        if (input.expectedAuthorityRevision !== String(authority.get(id) ?? 0)) return error('MEMORY_AUTHORITY_CONFLICT', 'Memory changed. Reopen it and try again.', 409);
        const selected = JSON.parse(input.sourceMessageIds);
        if (!Array.isArray(selected) || (body.actionId === 'memory.forget' && !selected.length)) return error('MEMORY_INPUT_INVALID', 'Select an original source first.');
        if (selected.some(item => !(messages.get(id) ?? []).some(message => message.id === item))) return error('MEMORY_SOURCE_UNAVAILABLE', 'Select an available sample source.');
        excluded.set(id, [...new Set([...(excluded.get(id) ?? []), ...selected])]);
        authority.set(id, (authority.get(id) ?? 0) + 1);
        if (body.actionId === 'memory.correct') personal.set(id, input.workingMemory);
        if (body.actionId === 'memory.resume') personal.delete(id);
        value = { saved: true };
      } else return error('PREVIEW_ACTION_UNAVAILABLE', 'This action is not in the local preview.', 403);
      const output = { ok: true, value, replay: false };
      receipts.set(body.idempotencyKey, { signature, result: clone(output) });
      return result(output);
    }
  };
}
