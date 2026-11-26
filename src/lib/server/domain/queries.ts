import type { PostgresStoreSet } from '@victframework/store-postgres';
import { authenticatedActorContext, assertActorScope } from '@victframework/runtime';

export interface Owner { id: string; actorId: string; email: string }
export interface Room { id: string; name: string; purpose: string; archivedAt: string | null; revision: number; createdAt: string; updatedAt: string }
export interface Conversation { id: string; actorId: string; roomId: string; threadId: string; title: string; archivedAt: string | null; roomArchivedAt: string | null; revision: number; createdAt: string; updatedAt: string }
export class ProductError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
export async function authorizedActor(stores: PostgresStoreSet, owner: Owner, scope: 'app.data.read' | 'app.data.write') {
  const actor = authenticatedActorContext(await stores.actors.get(owner.actorId), owner.actorId);
  assertActorScope(actor, scope);
  return actor;
}
const roomColumns = `id, name, purpose, archived_at AS "archivedAt", revision, created_at AS "createdAt", updated_at AS "updatedAt"`;
const conversationColumns = `c.id, c.actor_id AS "actorId", c.room_id AS "roomId", c.thread_id AS "threadId", c.title, c.archived_at AS "archivedAt", r.archived_at AS "roomArchivedAt", c.revision, c.created_at AS "createdAt", c.updated_at AS "updatedAt"`;
export async function listProductData(stores: PostgresStoreSet, owner: Owner, sidebar = false) {
  await authorizedActor(stores, owner, 'app.data.read');
  const columns = sidebar ? 'c.id, c.room_id AS "roomId", c.title' : conversationColumns;
  const [rooms, conversations] = await Promise.all([
    stores.coordination.pool.query<Room>(`SELECT ${roomColumns} FROM quellight_product_v1.rooms WHERE actor_id=$1 ORDER BY created_at,id`, [owner.actorId]),
    stores.coordination.pool.query<Pick<Conversation, 'id' | 'roomId' | 'title'>>(`SELECT ${columns} FROM quellight_product_v1.conversations c JOIN quellight_product_v1.rooms r ON r.id=c.room_id AND r.actor_id=c.actor_id WHERE c.actor_id=$1 ORDER BY c.updated_at DESC,c.id`, [owner.actorId])
  ]);
  return { rooms: rooms.rows, conversations: conversations.rows };
}
export async function getConversationAccess(stores: PostgresStoreSet, owner: Owner, id: string,
  additionalScope?: 'run.read' | 'agent.turn.start') {
  const actor = await authorizedActor(stores, owner, 'app.data.read');
  if (additionalScope) assertActorScope(actor, additionalScope);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ProductError('CONVERSATION_NOT_FOUND', 404);
  const result = await stores.coordination.pool.query<Conversation>(`SELECT ${conversationColumns} FROM quellight_product_v1.conversations c JOIN quellight_product_v1.rooms r ON r.id=c.room_id AND r.actor_id=c.actor_id WHERE c.id=$1 AND c.actor_id=$2`, [id, owner.actorId]);
  if (!result.rows[0]) throw new ProductError('CONVERSATION_NOT_FOUND', 404);
  return { conversation: result.rows[0], actor };
}
export async function getConversation(stores: PostgresStoreSet, owner: Owner, id: string): Promise<Conversation> {
  return (await getConversationAccess(stores, owner, id)).conversation;
}
