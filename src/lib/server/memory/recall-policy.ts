import type { MemoryRecallScope } from './configuration.js';
import type { MemorySettingsSqlClient } from './settings.js';

/** Product relevance policy, additional to VICT's native actor/resource ownership boundary.
 * Archiving organizes history; it is not deletion or forgetting. Exclusions are enforced by native authority. */
export async function allowsMemorySource(client: MemorySettingsSqlClient, ownerActorId: string,
  activeConversationId: string, scope: MemoryRecallScope,
  request: { actorId: string; sourceConversationId: string; targetConversationId: string }): Promise<boolean> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (request.actorId !== ownerActorId || request.sourceConversationId !== activeConversationId ||
    !uuid.test(activeConversationId) || !uuid.test(request.targetConversationId) || !['current-room', 'same-owner'].includes(scope)) return false;
  const result = await client.query(`SELECT source.room_id=target.room_id AS same_room
    FROM quellight_product_v1.conversations source
    JOIN quellight_product_v1.conversations target ON target.actor_id=source.actor_id
    WHERE source.id=$1 AND source.actor_id=$2 AND target.id=$3`, [activeConversationId, ownerActorId, request.targetConversationId]);
  return !!result.rows[0] && (scope === 'same-owner' || result.rows[0].same_room === true);
}
