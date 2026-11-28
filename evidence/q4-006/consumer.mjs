import { performance } from 'node:perf_hooks';

// Compatibility decoder for the pinned observation view. Endpoints are not
// evidence of interior membership. The reader carries no fixture knowledge.
export function observationGroups(text) {
  return [...(text ?? '').matchAll(/<observation-group id="([^"]+)" range="([^"]+)"(?: kind="([^"]+)")?>\n([\s\S]*?)\n<\/observation-group>/g)]
    .map(([, id, range, kind, body]) => ({ id, range, kind: kind ?? 'observe', body }));
}

const jsonBytes = value => Buffer.byteLength(JSON.stringify(value ?? null));

export function createConsumer({ stores, owner, roomId, ports, meter }) {
  return async function read({ label, conversationId, operationId }) {
    const start = performance.now();
    meter.reset();
    const row = { label, operationId, reads: [], groups: [], acceptedIds: [] };
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
      row.authority = { revision: authority.revision, excluded: authority.excludedMessageIds,
        quarantined: authority.quarantinedMessageIds };
      row.operation = operation && {
        id: operation.operation_id, threadId: operation.thread_id, kind: operation.kind,
        status: operation.status, authorityRevision: operation.authority_revision,
        configRevision: operation.configuration_revision, sourceDigest: operation.source_digest,
        publicationEvents: operation.events.filter(event => event.name === 'published'),
        resultPresent: result != null, checkpointPresent: operation.checkpoint != null,
        fields: { operation: Object.keys(operation).sort(), result: Object.keys(result ?? {}).sort(),
          snapshot: Object.keys(snapshot ?? {}).sort(), current: Object.keys(current ?? {}).sort() },
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
      if (!groups.length) {
        row.disposition = 'range-markup-unavailable';
        return row;
      }
      const page = await call('app.memorySourcePage', () => ports.memorySourcePage(stores, owner, conversationId));
      if (page.authorityRevision !== authority.revision) {
        row.disposition = 'authority-changed-during-read';
        return row;
      }
      if (page.nextCursor || page.sources.some(source => source.conversationId !== conversationId)) {
        row.disposition = 'bounded-source-page-unavailable';
        return row;
      }
      const index = new Map(page.sources.map((source, ordinal) => [source.id, ordinal]));
      const provisional = [];
      for (const group of groups) {
        const [first, last, ...rest] = group.range.split(':');
        const startIndex = index.get(first), endIndex = index.get(last);
        const groupRead = { groupId: group.id, kind: group.kind, range: group.range,
          apparentAllIds: [], apparentEligibleIds: [], rejectedIds: [], acceptedIds: [] };
        row.groups.push(groupRead);
        if (rest.length || startIndex === undefined || endIndex === undefined || endIndex < startIndex) {
          groupRead.disposition = 'endpoints-unresolved';
          continue;
        }
        const slice = page.sources.slice(startIndex, endIndex + 1);
        groupRead.apparentAllIds = slice.map(source => source.id);
        groupRead.apparentEligibleIds = slice.filter(source => !source.excluded).map(source => source.id);
        groupRead.rejectedIds = slice.filter(source => source.excluded).map(source => source.id);
        const singleton = slice.length === 1 && slice[0].role === 'user';
        const pair = slice.length === 2 && slice[0].role === 'user' &&
          slice[1].role === 'assistant' && slice[0].at < slice[1].at;
        if (groupRead.rejectedIds.length || group.kind !== 'observe' || (!singleton && !pair)) {
          groupRead.disposition = group.kind === 'reflection'
            ? 'reflected-membership-unverified' : 'observe-interior-membership-unverified';
          continue;
        }
        groupRead.disposition = 'bounded-endpoints-resolved';
        provisional.push(groupRead);
      }
      const after = await call('vict.authority', () => memory.service.authority(conversationId));
      if (ports.policyIdentity(after) !== ports.policyIdentity(authority)) {
        row.disposition = 'authority-changed-during-read';
        return row;
      }
      for (const group of provisional) group.acceptedIds = group.apparentEligibleIds;
      row.acceptedIds = [...new Set(provisional.flatMap(group => group.acceptedIds))];
      row.disposition = 'compared';
      return row;
    } finally {
      await memory?.hosted.close();
      row.metrics = { namedReads: row.reads.length, namedBytes: row.reads.reduce((sum, read) => sum + read.jsonBytes, 0),
        postgresWire: meter.read(), elapsedMs: Number((performance.now() - start).toFixed(3)) };
    }
  };
}
