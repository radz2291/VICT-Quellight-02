import assert from 'node:assert/strict';

export const membershipSchema = 'vict.mastra-observation-membership@1';

// Observation text is inspected only for coverage and display compatibility.
// Membership is accepted entirely from the installed public VICT result.
export function observationGroups(text) {
  return [...(text ?? '').matchAll(/<observation-group id="([^"]+)" range="([^"]+)"(?: kind="([^"]+)")?>\n([\s\S]*?)\n<\/observation-group>/g)]
    .map(([, id, range, kind, body]) => ({ id, range, kind: kind ?? 'observe', body }));
}

const jsonBytes = value => Buffer.byteLength(JSON.stringify(value ?? null));

export function createConsumer({ stores, owner, roomId, ports, meter }) {
  return async function read({ label, conversationId, operationId }) {
    const start = performance.now();
    meter.reset();
    const row = { label, operationId, reads: [], acceptedIds: [], groups: [], operationMembershipDeltaBytes: 0 };
    const call = async (port, work) => {
      const response = await work();
      row.reads.push({ port, jsonBytes: jsonBytes(response) });
      return response;
    };
    let memory;
    try {
      const thread = await call('app.getConversation', () => ports.getConversation(stores, owner, conversationId));
      if (thread.actorId !== owner.actorId || thread.roomId !== roomId) {
        row.disposition = 'scope-refused';
        return row;
      }
      const effective = await call('app.loadEffectiveMemorySettings',
        () => ports.loadEffectiveMemorySettings(stores.coordination.pool, owner.actorId, roomId));
      memory = await ports.openQuellightMemory({ stores, ownerActorId: owner.actorId, conversationId, effective });
      const authority = await call('vict.authority', () => memory.service.authority(conversationId));
      const operation = await call('vict.operation', () => memory.service.operation(conversationId, operationId));
      const result = operation?.result;
      const snapshot = result?.snapshot;
      const current = snapshot?.current;
      const membership = result?.sourceMembership;
      if (membership) {
        const { sourceMembership, ...base } = result;
        row.operationMembershipDeltaBytes = jsonBytes(operation) - jsonBytes({ ...operation, result: base });
      }
      row.authority = { revision: authority.revision, excluded: authority.excludedMessageIds,
        quarantined: authority.quarantinedMessageIds };
      row.operation = operation && {
        id: operation.operation_id, threadId: operation.thread_id, kind: operation.kind,
        status: operation.status, authorityRevision: operation.authority_revision,
        configRevision: operation.configuration_revision, sourceDigest: operation.source_digest,
        publicationEvents: operation.events.filter(event => event.name === 'published'),
        resultPresent: result != null, checkpointPresent: operation.checkpoint != null,
        sourceMembership: membership ?? null, containsMembershipInPrivateFields: Boolean(operation.checkpoint &&
          JSON.stringify(operation.checkpoint).includes(membershipSchema)),
        containsMembership: JSON.stringify(operation).includes(membershipSchema),
      };
      if (!operation || operation.operation_id !== operationId || operation.thread_id !== thread.threadId) {
        row.disposition = 'operation-scope-unresolved';
        return row;
      }
      if (operation.status === 'superseded' || operation.authority_revision !== authority.revision) {
        row.disposition = 'stale-authority';
        return row;
      }
      if (operation.status !== 'completed' || row.operation.publicationEvents.length !== 1 ||
          (!result?.observed && !result?.reflected) || snapshot?.authorityRevision !== authority.revision ||
          snapshot?.conversationId !== conversationId || snapshot?.resourceId !== 'vict-actor-' + owner.actorId ||
          result.configurationRevision !== operation.configuration_revision || result.sourceRevision !== operation.source_digest) {
        row.disposition = 'no-committed-scope-verified-result';
        return row;
      }
      const groups = observationGroups(current?.observations);
      assert.ok(groups.length, 'Expected at least one group in the published observation text');
      assert.equal(membership?.schema, membershipSchema, 'Installed VICT operation lacks the public typed membership field');
      assert.ok(Array.isArray(membership.groups));
      assert.deepEqual(membership.groups.map(group => group.groupId).sort(), groups.map(group => group.id).sort());
      const membershipByGroup = new Map(membership.groups.map(group => [group.groupId, group]));
      const ineligible = new Set([...authority.excludedMessageIds, ...authority.quarantinedMessageIds]);
      for (const group of groups) {
        const entry = membershipByGroup.get(group.id);
        if (entry.status === 'unavailable') {
          assert.equal(Object.hasOwn(entry, 'messageIds'), false);
          row.groups.push({ groupId: group.id, kind: group.kind, status: entry.status, acceptedIds: [] });
          continue;
        }
        assert.equal(entry.status, 'available');
        assert.equal(entry.basis, group.kind === 'reflection' ? 'retained-parents' : 'observe-input');
        assert.ok(Array.isArray(entry.messageIds) && entry.messageIds.length > 0);
        assert.ok(entry.messageIds.every(id => typeof id === 'string' && id.length > 0 && !ineligible.has(id)));
        assert.equal(new Set(entry.messageIds).size, entry.messageIds.length);
        row.groups.push({ groupId: group.id, kind: group.kind, basis: entry.basis, status: entry.status,
          acceptedIds: [...entry.messageIds] });
      }
      const after = await call('vict.authority', () => memory.service.authority(conversationId));
      if (ports.policyIdentity(after) !== ports.policyIdentity(authority)) {
        row.disposition = 'authority-changed-during-read';
        for (const group of row.groups) group.acceptedIds = [];
        return row;
      }
      row.acceptedIds = [...new Set(row.groups.flatMap(group => group.acceptedIds))];
      row.disposition = 'typed-publication';
      return row;
    } finally {
      await memory?.hosted.close();
      row.metrics = { namedReads: row.reads.length, namedBytes: row.reads.reduce((sum, read) => sum + read.jsonBytes, 0),
        postgresWire: meter.read(), elapsedMs: Number((performance.now() - start).toFixed(3)) };
    }
  };
}
