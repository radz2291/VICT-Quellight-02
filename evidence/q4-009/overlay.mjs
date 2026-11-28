import assert from 'node:assert/strict';

export const readEvent = Symbol.for('quellight.q4-009.room-read');

// This fixture-only selector is injected into the installed foreground composition.
// Approval is immutable within one owner/room/authority binding.
async function readApprovedRoom(stores, owner, conversation, authority) {
  const { rows } = await stores.coordination.pool.query(`SELECT x.revision,x.block,x.source_id
    FROM q4_009_room.approvals x
    JOIN quellight_product_v1.conversations c ON c.actor_id=x.actor_id AND c.room_id=x.room_id
    JOIN quellight_product_v1.rooms r ON r.actor_id=c.actor_id AND r.id=c.room_id
    WHERE c.id=$1 AND x.actor_id=$2 AND x.room_id=$3 AND x.authority=$4
      AND c.archived_at IS NULL AND r.archived_at IS NULL`,
    [conversation.id, owner.actorId, conversation.roomId, authority]);
  if (rows.length > 1) throw new Error('Q4_ROOM_APPROVAL_AMBIGUOUS');
  const selected = rows[0];
  globalThis[Symbol.for('quellight.q4-009.room-read')]?.({
    actorId: owner.actorId, conversationId: conversation.id, roomId: conversation.roomId, authority,
    revision: selected?.revision ?? null, sourceId: selected?.source_id ?? null,
    resultBytes: Buffer.byteLength(JSON.stringify(rows)),
  });
  return selected?.block ?? '';
}

export function roomBlock(revision, content) {
  assert.match(revision, /^r[123]$/);
  const { marker, territory, direction, posture } = content;
  const block = `<approved-room-state revision="${revision}">${JSON.stringify({ marker, territory, direction, posture })}</approved-room-state>`;
  assert.ok(Buffer.byteLength(block) <= 512);
  return block;
}

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'Unexpected pinned app insertion seam');
  return source.replace(before, after);
}

export function testRoomComposition() {
  const port = 'virtual:q4-009-room-approval';
  const edits = new Set();
  return { name: 'q4-009-test-room-approval', enforce: 'pre',
    resolveId(id) { if (id === port) return '\0' + port; },
    load(id) { if (id === '\0' + port) return `export ${readApprovedRoom.toString()}`; },
    transform(source, path) {
      const normal = path.replaceAll('\\', '/');
      if (normal.endsWith('/src/lib/server/conversation/service.ts')) {
        const original = 'profile = conversationActivation(effective.configuration.purpose, { effective,';
        const composition = 'const approvedRoomBlock = await readApprovedRoom(stores, owner, conversation, authorityRevision);\n' +
          '        profile = conversationActivation(effective.configuration.purpose, { effective, approvedRoomBlock,';
        edits.add('service');
        return { code: `import { readApprovedRoom } from '${port}';\n${replaceOnce(source, original, composition)}`, map: null };
      }
      if (normal.endsWith('/src/lib/server/conversation/activation.ts')) {
        const field = '  effective: EffectiveMemorySettings;';
        const original = 'conversationInstructions: baseInstructions.text,';
        const injected = 'conversationInstructions: managed.approvedRoomBlock\n' +
          '      ? `${baseInstructions.text}\\n\\n${managed.approvedRoomBlock}` : baseInstructions.text,';
        edits.add('activation');
        return { code: replaceOnce(replaceOnce(source, field, field + '\n  approvedRoomBlock?: string;'), original, injected), map: null };
      }
    },
    applied: () => [...edits].sort(),
  };
}
