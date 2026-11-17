import type { HostedLease } from '@victframework/runtime';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import { mastraThreadIdForConversation, mastraResourceIdForActor } from '@victframework/mastra';
import type { MastraDBMessage } from '@mastra/core/agent';
import type { Conversation, Owner } from '../domain/queries.js';
import { automaticMemoryWriter } from './automatic-authority.js';
import { publicConversationSources } from './jobs.js';
import { QUELLIGHT_NATIVE_MEMORY_SCHEMA, type openQuellightMemory } from './native.js';

/** One-time import before the first native chat. Later generated messages retain the
 * adapter's own IDs and authority provenance; never repair/re-import them as fresh sources. */
export async function ensureNativeSources(options: { stores: PostgresStoreSet; lease: HostedLease;
  owner: Owner; conversation: Conversation; memory: Awaited<ReturnType<typeof openQuellightMemory>> }) {
  const { stores, lease, owner, conversation, memory } = options;
  if (conversation.actorId !== owner.actorId || lease.actorId !== owner.actorId) throw new Error('MEMORY_SOURCE_OWNER_MISMATCH');
  const imported = await stores.coordination.pool.query(`SELECT source_revision FROM quellight_product_v1.memory_imports
    WHERE actor_id=$1 AND conversation_id=$2 AND schema_name=$3`, [owner.actorId, conversation.id, QUELLIGHT_NATIVE_MEMORY_SCHEMA]);
  if (imported.rows.length) return { imported: false };
  const sources = await publicConversationSources(stores.coordination.pool, owner.actorId, conversation.id);
  const writer = await automaticMemoryWriter(stores, owner.actorId);
  await writer({ kind: 'import-sources', actorId: owner.actorId, conversationId: conversation.id,
    operationId: `import:${conversation.id}:${sources.revision}`, configurationRevision: memory.service.configurationRevision,
    sourceRevision: sources.revision }, async () => {
    const threadId = mastraThreadIdForConversation(conversation.id), resourceId = mastraResourceIdForActor(owner.actorId);
    const handle = await memory.hosted.coordinator.beginTurn(threadId, resourceId);
    try {
      return await handle.run(async () => {
        const domain = await memory.hosted.store.getStore('memory');
        if (!domain) throw new Error('MEMORY_STORE_UNAVAILABLE');
        const existing = await domain.getThreadById({ threadId });
        if (existing && existing.resourceId !== resourceId) throw new Error('MEMORY_SOURCE_OWNER_MISMATCH');
        if (!existing) await domain.saveThread({ thread: { id: threadId, resourceId, title: conversation.title,
          createdAt: new Date(conversation.createdAt), updatedAt: new Date(conversation.updatedAt) } });
        const current = await domain.listMessages({ threadId, resourceId, perPage: false });
        const ids = new Set(current.messages.map(message => message.id));
        const messages: MastraDBMessage[] = sources.messages.filter(message => !ids.has(message.id)).map(message => ({
          id: message.id, threadId, resourceId, role: message.role, createdAt: new Date(message.at),
          content: { format: 2, parts: [{ type: 'text', text: message.text }] },
        }));
        if (messages.length) await domain.saveMessages({ messages });
        return { importedMessageIds: messages.map(message => message.id) };
      });
    } finally { await handle.release(); }
  });
  // This marker is committed before admission can run a new chat. A lost acknowledgement
  // repeats only stable original IDs; it cannot stamp later generated replies as current.
  await stores.coordination.withFence(lease, client => client.query(`INSERT INTO quellight_product_v1.memory_imports
    (actor_id,conversation_id,schema_name,source_revision) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [owner.actorId, conversation.id, QUELLIGHT_NATIVE_MEMORY_SCHEMA, sources.revision]));
  return { imported: true };
}
