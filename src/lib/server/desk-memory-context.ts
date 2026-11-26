import { createHash } from 'node:crypto';
import { mastraThreadIdForConversation, mastraResourceIdForActor } from '@victframework/mastra';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import { openQuellightMemory } from './memory/native.js';
import { loadEffectiveMemorySettings, type EffectiveMemorySettings, type FencedMemorySettingsClient } from './memory/settings.js';
import { withMemoryAuthorityFence } from './memory/authority-fence.js';
import { getConversation, ProductError, type Conversation, type Owner } from './domain/queries.js';

type Native = Awaited<ReturnType<typeof openQuellightMemory>>;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plain = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function publicText(value: unknown): string {
  if (typeof value === 'string') return value;
  const object = plain(value);
  const parts = Array.isArray(value) ? value : Array.isArray(object.parts) ? object.parts : [];
  return parts.map(plain).filter(part => part.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n');
}
export interface DeskSourceSnapshot {
  authorityRevision: string;
  messages: Array<{ id: string; role: 'user' | 'assistant'; text: string }>;
  revision: string;
}

/** Public native source authority; no prompts, model calls or native mutations. */
export async function createDeskMemoryContext(stores: PostgresStoreSet, owner: Owner, conversationId: string,
  effective?: EffectiveMemorySettings, suppliedNative?: Native) {
  const conversation = await getConversation(stores, owner, conversationId);
  const configuration = effective ?? await loadEffectiveMemorySettings(stores.coordination.pool, owner.actorId, conversation.roomId);
  const native = suppliedNative ?? await openQuellightMemory({ stores, ownerActorId: owner.actorId, conversationId, effective: configuration });
  return { ...bindDeskMemoryContext(stores, owner, conversation, native),
    close: async () => { if (!suppliedNative) await native.hosted.close(); } };
}

/** Bind a conversation already authorized by the caller to its open native context. */
export function bindDeskMemoryContext(stores: PostgresStoreSet, owner: Owner, conversation: Conversation, native: Native) {
  if (conversation.actorId !== owner.actorId) throw new ProductError('CONVERSATION_NOT_FOUND', 404);
  const conversationId = conversation.id;
  const read = () => native.service.authority(conversationId);
  async function sourceSnapshot(): Promise<DeskSourceSnapshot> {
    const authority = await read();
    const excluded = new Set([...authority.excludedMessageIds, ...authority.quarantinedMessageIds]);
    const threadId = mastraThreadIdForConversation(conversationId), resourceId = mastraResourceIdForActor(owner.actorId);
    const result = await native.hosted.store.readNativeMemory(threadId, resourceId, async () =>
      (await native.hosted.store.getStore('memory'))!.listMessages({ threadId, resourceId, perPage: false }));
    const messages: DeskSourceSnapshot['messages'] = [];
    for (const message of result.messages) {
      if (message.threadId !== threadId || message.resourceId !== resourceId || excluded.has(message.id) ||
        !['user', 'assistant'].includes(message.role)) continue;
      const text = publicText(message.content);
      if (text) messages.push({ id: message.id, role: message.role as 'user' | 'assistant', text });
    }
    const after = await read();
    const policy = (value: typeof authority) => hash({ revision: value.revision,
      excluded: [...value.excludedMessageIds].sort(), quarantined: [...value.quarantinedMessageIds].sort() });
    if (policy(after) !== policy(authority)) throw new ProductError('DESK_AUTHORITY_CHANGED', 409);
    return { authorityRevision: authority.revision, messages,
      revision: hash({ schema: 'quellight.desk-sources@1', conversationId, authorityRevision: authority.revision, messages }) };
  }
  return {
    authority: { read }, sourceSnapshot,
    withAuthorityFence: <T>(expected: string, work: (client: FencedMemorySettingsClient) => Promise<T>, validate?: () => Promise<void>) =>
      withMemoryAuthorityFence(stores, owner.actorId, expected, read, work, validate),
  };
}
