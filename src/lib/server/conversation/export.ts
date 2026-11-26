import type { PostgresStoreSet } from '@victframework/store-postgres';
import type { Conversation, Owner } from '../domain/queries.js';

interface ExportTurn {
  turn_id: string;
  input_text: string;
  output_text: string | null;
  execution_state: string;
}

async function ownedStatuses(stores: PostgresStoreSet, owner: Owner, conversation: Conversation, ids: ReadonlySet<string>) {
  try {
    const turns = await stores.turns.listTurns();
    return new Map(turns.filter(turn => turn.actorId === owner.actorId && turn.threadId === conversation.threadId &&
      ids.has(turn.turnId)).map(turn => [turn.turnId, turn.status]));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'HOSTED_SCHEMA_MISMATCH')) throw error;
    // The public bulk port decodes the entire namespace before we can filter
    // it. Retry the original owner-scoped reads when a legacy record cannot be
    // decoded. A targeted record that still fails validation stays a failure.
    const statuses = new Map<string, string>();
    for (const id of ids) {
      const turn = await stores.turns.getTurn(id);
      if (turn && turn.actorId === owner.actorId && turn.threadId === conversation.threadId) statuses.set(id, turn.status);
    }
    return statuses;
  }
}

/** The caller has verified owner, run.read authority, and recovery for this conversation. */
export async function renderConversationExport(stores: PostgresStoreSet, owner: Owner, conversation: Conversation) {
  const { rows } = await stores.coordination.pool.query<ExportTurn>(`SELECT turn_id,input_text,output_text,execution_state
    FROM quellight_product_v1.conversation_turns WHERE conversation_id=$1 AND actor_id=$2 ORDER BY created_at,turn_id`,
  [conversation.id, owner.actorId]);
  const chunks = [`# ${conversation.title}`];
  if (!rows.length) return chunks[0] + '\n';

  // Use the public bulk operational read once. Historical stopped turns may
  // have a settled product row without an error code. Their exact VICT status
  // decides partial labels and the final footer.
  const ids = new Set(rows.map(row => row.turn_id));
  const statuses = await ownedStatuses(stores, owner, conversation, ids);
  let active = false;
  for (const row of rows) {
    chunks.push(`## You\n\n${row.input_text}`);
    if (row.execution_state === 'queued' || row.execution_state === 'running') active = true;
    else if (row.output_text) {
      const partial = statuses.get(row.turn_id) === 'completed' ? '' : ' (partial reply)';
      chunks.push(`## Quellight${partial}\n\n${row.output_text}`);
    }
  }
  const latestStatus = statuses.get(rows.at(-1)!.turn_id);
  if (active) chunks.push('A reply was still in progress when this conversation was exported.');
  else if (latestStatus === 'cancelled') chunks.push('The last reply was stopped.');
  else if (latestStatus !== 'completed') chunks.push('The last reply did not finish.');
  return chunks.join('\n\n') + '\n';
}
