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
export async function listProductData(stores: PostgresStoreSet, owner: Owner) {
  await authorizedActor(stores, owner, 'app.data.read');
  const rooms = await stores.coordination.pool.query<Room>(`SELECT ${roomColumns} FROM quellight_product_v1.rooms WHERE actor_id=$1 ORDER BY created_at,id`, [owner.actorId]);
  const conversations = await stores.coordination.pool.query<Conversation>(`SELECT ${conversationColumns} FROM quellight_product_v1.conversations c JOIN quellight_product_v1.rooms r ON r.id=c.room_id AND r.actor_id=c.actor_id WHERE c.actor_id=$1 ORDER BY c.updated_at DESC,c.id`, [owner.actorId]);
  return { rooms: rooms.rows, conversations: conversations.rows };
}
export async function getConversation(stores: PostgresStoreSet, owner: Owner, id: string): Promise<Conversation> {
  await authorizedActor(stores, owner, 'app.data.read');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ProductError('CONVERSATION_NOT_FOUND', 404);
  const result = await stores.coordination.pool.query<Conversation>(`SELECT ${conversationColumns} FROM quellight_product_v1.conversations c JOIN quellight_product_v1.rooms r ON r.id=c.room_id AND r.actor_id=c.actor_id WHERE c.id=$1 AND c.actor_id=$2`, [id, owner.actorId]);
  if (!result.rows[0]) throw new ProductError('CONVERSATION_NOT_FOUND', 404);
  return result.rows[0];
}
