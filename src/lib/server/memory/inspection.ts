import { assertActorScope } from '@victframework/runtime';
import { mastraResourceIdForActor, mastraThreadIdForConversation } from '@victframework/mastra';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import type { MemoryInspection } from '../../product/memory-client.js';
import { authorizedActor, getConversation, ProductError, type Owner } from '../domain/queries.js';
import { loadEffectiveMemorySettings } from './settings.js';
import { memoryActivity } from './jobs.js';
import { openQuellightMemory } from './native.js';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' ? value : '';
function date(value: unknown): string | null {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
/** Text only. Reasoning, tool payloads and provider metadata are never serialized into the DTO. */
function publicText(value: unknown): string {
  if (typeof value === 'string') return value;
  const content = record(value);
  const parts = Array.isArray(value) ? value : Array.isArray(content.parts) ? content.parts : [];
  return parts.map(part => record(part)).filter(part => part.type === 'text').map(part => text(part.text)).join('\n');
}
const policyIdentity = (value: unknown) => {
  const policy = record(value);
  return JSON.stringify([policy.revision, [...(Array.isArray(policy.excludedMessageIds) ? policy.excludedMessageIds : [])].sort(),
    [...(Array.isArray(policy.quarantinedMessageIds) ? policy.quarantinedMessageIds : [])].sort()]);
};
const queueLabels: Record<string, string> = { queued: 'Learning queued', running: 'Learning from this conversation', retryable: 'Waiting to retry',
  completed: 'Memory work completed', superseded: 'Replaced by newer memory', blocked: 'Memory needs attention' };
const nativeLabels: Record<string, string> = { 'observe-started': 'Observation started', 'observer-started': 'Reading messages',
  'observer-completed': 'Observation ready', 'observer-failed': 'Observation could not finish', 'reflect-started': 'Reflection started',
  'reflector-started': 'Reflecting on observations', 'reflector-completed': 'Reflection ready', 'reflector-failed': 'Reflection could not finish',
  prepared: 'Memory prepared', published: 'Memory applied', 'publication-pending': 'Prepared memory waiting to be applied',
  'stage-failed': 'Memory work will retry', 'abandoned-stage-reconciled': 'Interrupted work ready to retry', 'authority-invalidated': 'Replaced by a memory change' };
const omissionLabels: Record<string, string> = { reasoning: 'Private model reasoning', providerOptions: 'Provider settings', providerMetadata: 'Provider metadata',
  activationInstructions: 'Conversation instructions', currentInput: 'The current message', toolDefinitions: 'Tool definitions', laterToolSteps: 'Later tool activity' };
// The public store intentionally uses the same unavailable result for a missing or
// differently owned native thread. Product ownership was already checked above.
const unavailableThread = (error: unknown) => ['VICT_MEMORY_THREAD_UNAVAILABLE', 'VICT_AGENT_THREAD_ACTOR_MISMATCH'].includes(text(record(error).code));

/** Injectable only at trusted server composition; the route uses the public native reader. */
export function createMemoryInspectionReader(openMemory = openQuellightMemory) {
  return async function inspectMemory(stores: PostgresStoreSet, owner: Owner, conversationId: string, selectedTurnId?: string): Promise<MemoryInspection> {
    const conversation = await getConversation(stores, owner, conversationId);
    const actor = await authorizedActor(stores, owner, 'app.data.read');
    let canWrite = false;
    try { assertActorScope(actor, 'app.data.write'); canWrite = true; } catch { /* Read access remains useful without care authority. */ }
    const client = stores.coordination.pool;
    const effective = await loadEffectiveMemorySettings(client, owner.actorId, conversation.roomId);
    const [jobs, turns, activity, care] = await Promise.all([
      client.query('SELECT id,kind,state,created_at,updated_at FROM quellight_product_v1.memory_jobs WHERE actor_id=$1 AND conversation_id=$2 ORDER BY created_at DESC,id', [owner.actorId, conversationId]),
      client.query("SELECT turn_id,created_at,updated_at FROM quellight_product_v1.conversation_turns WHERE actor_id=$1 AND conversation_id=$2 AND memory_configuration IS NOT NULL AND execution_state='settled' AND error_code IS NULL ORDER BY created_at DESC,turn_id", [owner.actorId, conversationId]),
      memoryActivity(client, owner.actorId, conversationId),
      client.query("SELECT command_key,conversation_id,action_id,state,created_at,updated_at FROM quellight_product_v1.memory_care_commands WHERE actor_id=$1 AND (conversation_id=$2 OR state<>'applied') ORDER BY created_at DESC,command_key", [owner.actorId, conversationId]),
    ]);
    if (selectedTurnId && !turns.rows.some(row => row.turn_id === selectedTurnId)) throw new ProductError('TURN_NOT_FOUND', 404);
    const unfinishedCare = care.rows.some(row => row.state !== 'applied');
    // A newer settled job must not hide older work that is still running or needs attention.
    const activeJobState = ['blocked', 'retryable', 'running', 'queued'].find(state => jobs.rows.some(row => row.state === state));
    const canRetry = canWrite && !care.rows.some(row => row.state === 'blocked') &&
      (care.rows.some(row => row.state === 'retryable') || activeJobState === 'retryable' || activeJobState === 'blocked');
    const dto: MemoryInspection = {
      conversationId, statusLabel: effective.configuration.values.automaticLearning ? 'No observations yet' : 'Automatic learning is off',
      observations: { id: null, text: '', updatedAt: null, emptyText: 'There are no saved observations for this conversation yet.', history: [], prepared: [] },
      personal: { text: '', updatedAt: null, enabled: effective.configuration.values.personalPreferences, ownerManaged: false },
      activity: activity.map(row => ({ id: `job-event:${row.id}`, label: queueLabels[row.state] ?? 'Memory activity', status: text(row.state), at: date(row.at) })),
      sources: [], replies: [], context: null, authority: { revision: '0', excludedMessageIds: [] },
      controls: { canCorrect: false, canForget: false, canRetry },
    };
    for (const row of care.rows) dto.activity.push({ id: `care:${row.command_key}`, status: text(row.state), at: date(row.updated_at),
      label: row.state === 'applied' ? 'Memory change applied'
        : row.state === 'blocked' ? 'Memory change needs attention' : row.state === 'retryable' ? 'Memory change waiting to retry'
        : row.conversation_id === conversationId ? 'Applying your memory change' : 'A memory change in another conversation is pending' });
    if (unfinishedCare) dto.statusLabel = care.rows.some(row => row.state === 'blocked') ? 'A memory change needs attention' : 'Your memory change is still finishing';
    else if (activeJobState) dto.statusLabel = queueLabels[activeJobState];
    const native = await openMemory({ stores, ownerActorId: owner.actorId, conversationId, effective });
    try {
      let snapshot, authority;
      try { authority = await native.service.authority(conversationId); snapshot = await native.service.inspect(conversationId); }
      catch (error) {
        if (!unavailableThread(error)) throw error;
        dto.observations.emptyText = 'Memory for this conversation is not available to inspect yet.';
        dto.controls = { canCorrect: false, canForget: false, canRetry: false };
        if (!unfinishedCare && !jobs.rows.length) dto.statusLabel = 'Memory is not available';
        dto.activity.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '') || a.id.localeCompare(b.id));
        return dto;
      }
      const excluded = new Set(authority.excludedMessageIds), quarantined = new Set(authority.quarantinedMessageIds ?? []);
      dto.authority = { revision: authority.revision, excludedMessageIds: [...excluded] };
      dto.personal.text = snapshot.workingMemory ?? '';
      dto.personal.ownerManaged = typeof snapshot.workingMemoryOverride === 'string';
      dto.observations.id = snapshot.current?.id ?? null;
      dto.observations.text = snapshot.current?.observations ?? '';
      dto.observations.updatedAt = date(snapshot.current?.updatedAt);
      dto.observations.history = snapshot.history.filter(item => item.id !== snapshot.current?.id)
        .map(item => ({ id: item.id, text: item.observations, updatedAt: date(item.updatedAt) }));
      if (snapshot.current && !unfinishedCare && !activeJobState) dto.statusLabel = 'Saved memory';
      const raw = await native.hosted.store.readNativeMemory(mastraThreadIdForConversation(conversationId), mastraResourceIdForActor(owner.actorId), async () => {
        const domain = await native.hosted.store.getStore('memory');
        if (!domain) throw new ProductError('MEMORY_UNAVAILABLE', 503);
        const [messages, resource] = await Promise.all([domain.listMessages({ threadId: mastraThreadIdForConversation(conversationId), perPage: false }),
          domain.getResourceById({ resourceId: mastraResourceIdForActor(owner.actorId) })]);
        return { messages: messages.messages, resource };
      });
      dto.personal.updatedAt = !dto.personal.ownerManaged && dto.personal.text && raw.resource?.workingMemory === dto.personal.text ? date(raw.resource.updatedAt) : null;
      dto.sources = raw.messages.filter(message => ['user', 'assistant'].includes(message.role)).map(message => ({ id: message.id, conversationId,
        label: excluded.has(message.id) ? 'Excluded by you' : quarantined.has(message.id) ? 'Excluded · earlier memory context' : message.role === 'user' ? 'Your message' : 'Quellight reply',
        text: publicText(message.content), role: message.role, at: date(message.createdAt), excluded: excluded.has(message.id) || quarantined.has(message.id) }));
      dto.replies = turns.rows.map(row => ({ turnId: row.turn_id,
        label: `Reply · ${date(row.created_at)?.replace('T', ' ').slice(0, 16) ?? 'Saved conversation'}` }));
      const selectedTurn = selectedTurnId ? turns.rows.find(row => row.turn_id === selectedTurnId) : turns.rows[0];
      if (selectedTurn) {
        const selected = await native.service.selectedContext(conversationId, selectedTurn.turn_id);
        const payload = record(selected?.payload);
        const messages = Array.isArray(payload.context) ? payload.context.map(item => { const message = record(item); const content = publicText(message.content); return content ? `${text(message.role)}\n${content}` : ''; }).filter(Boolean) : [];
        const invalidated = payload.stage === 'invalidated-by-authority-revision';
        dto.context = { turnId: selectedTurn.turn_id, scope: selected ? text(payload.scope) : 'memory-additions', stage: selected ? text(payload.stage) : 'not-recorded',
          text: !selected ? 'No saved memory selection is available for this reply.' : invalidated ? 'This memory selection was invalidated by a later memory change.' : [text(payload.systemMessage), ...messages].filter(Boolean).join('\n\n'),
          omissions: Array.isArray(payload.omittedFields) ? payload.omittedFields.filter(value => typeof value === 'string').map(value => omissionLabels[value] ?? value) : [],
          revisionLabel: !selected ? 'No saved memory selection' : invalidated ? 'Invalidated by a later memory change' : `Memory configuration ${text(payload.configurationRevision)}` };
      }
      for (const job of jobs.rows) {
        const operation = await native.service.operation(conversationId, `memory-job:${job.id}`);
        if (!operation) continue;
        const events = Array.isArray(operation.events) ? operation.events.map(record) : [];
        events.forEach((event, index) => {
          const name = text(event.name);
          const status = name.endsWith('-started') ? 'running' : name.endsWith('-failed') ? 'failed'
            : name.endsWith('-completed') || name === 'published' ? 'completed'
            : ['prepared', 'publication-pending'].includes(name) ? 'prepared'
            : name === 'authority-invalidated' ? 'superseded' : text(operation.status);
          dto.activity.push({ id: `native:${job.id}:${index}`, label: nativeLabels[name] ?? 'Memory processing', status, at: date(event.at) });
        });
        if (operation.status === 'prepared') {
          const checkpoint = record(operation.checkpoint);
          for (const item of Array.isArray(checkpoint.observations) ? checkpoint.observations : []) {
            const observation = record(item);
            if (typeof observation.id === 'string' && typeof observation.activeObservations === 'string') dto.observations.prepared.push({ id: observation.id,
              text: observation.activeObservations, updatedAt: date(observation.updatedAt) });
          }
        }
      }
      const finalAuthority = await native.service.authority(conversationId);
      if (policyIdentity(finalAuthority) !== policyIdentity(authority) || snapshot.authorityRevision !== authority.revision) throw new ProductError('MEMORY_CHANGED', 409);
      dto.activity.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '') || a.id.localeCompare(b.id));
      dto.controls = { canCorrect: canWrite && !unfinishedCare, canForget: canWrite && !unfinishedCare && dto.sources.some(source => !source.excluded),
        canRetry };
      return dto;
    } finally { await native.hosted.close(); }
  };
}

export const inspectConversationMemory = createMemoryInspectionReader();
