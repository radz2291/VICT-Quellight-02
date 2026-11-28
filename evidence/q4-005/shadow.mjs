import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const jsonBytes = value => Buffer.byteLength(JSON.stringify(value ?? null));
const groupPattern = /<observation-group id="([^"]+)" range="([^":]+):([^":]+)">\n([\s\S]*?)\n<\/observation-group>/g;

function operationView(row) {
  if (!row) return null;
  const result = row.result;
  const snapshot = result?.snapshot;
  const current = snapshot?.current;
  return {
    id: row.operation_id, threadId: row.thread_id, status: row.status,
    authorityRevision: row.authority_revision, configurationRevision: row.configuration_revision,
    sourceDigest: row.source_digest, events: row.events,
    resultPresent: result != null, checkpointPresent: row.checkpoint != null,
    operationFields: Object.keys(row).sort(), resultFields: Object.keys(result ?? {}).sort(),
    snapshotFields: Object.keys(snapshot ?? {}).sort(), currentFields: Object.keys(current ?? {}).sort(),
    observation: current?.observations ?? null, observationId: current?.id ?? null,
  };
}

export function createShadow({ stores, owner, roomId, ports, meter }) {
  const acceptedOperations = new Set();
  const acceptedRanges = new Set();

  return async function read({ caseId, conversationId, operationId }) {
    const begin = performance.now();
    meter.reset();
    const reads = [];
    const call = async (port, action) => {
      const result = await action();
      reads.push({ port, resultBytes: jsonBytes(result) });
      return result;
    };
    const result = { caseId, conversationId, operationId, accepted: [], unknown: [], ranges: [], reads };
    let memory;
    try {
      const conversation = await call('app.getConversation', () => ports.getConversation(stores, owner, conversationId));
      result.scope = { actorId: conversation.actorId, roomId: conversation.roomId, threadId: conversation.threadId };
      if (conversation.roomId !== roomId) {
        result.refusal = 'foreign-room';
        return result;
      }
      assert.equal(conversation.actorId, owner.actorId);
      const effective = await call('app.loadEffectiveMemorySettings',
        () => ports.loadEffectiveMemorySettings(stores.coordination.pool, owner.actorId, roomId));
      memory = await ports.openQuellightMemory({ stores, ownerActorId: owner.actorId, conversationId, effective });
      const policy = await call('vict.authority', () => memory.service.authority(conversationId));
      result.currentAuthorityRevision = policy.revision;
      result.exclusions = { excluded: policy.excludedMessageIds, quarantined: policy.quarantinedMessageIds };
      const operation = await call('vict.operation', () => memory.service.operation(conversationId, operationId));
      result.operation = operationView(operation);
      if (!operation || operation.thread_id !== conversation.threadId || operation.operation_id !== operationId) {
        result.refusal = 'operation-scope-unresolved';
        return result;
      }
      if (operation.status === 'superseded' || operation.authority_revision !== policy.revision) {
        result.refusal = 'stale-authority';
        return result;
      }
      if (operation.status !== 'completed' || !operation.result?.observed ||
          operation.result.snapshot?.conversationId !== conversationId ||
          operation.result.snapshot?.resourceId !== 'vict-actor-' + owner.actorId ||
          operation.result.snapshot?.authorityRevision !== policy.revision ||
          operation.result.configurationRevision !== operation.configuration_revision ||
          operation.result.sourceRevision !== operation.source_digest ||
          operation.events?.filter(event => event.name === 'published').length !== 1) {
        result.refusal = 'no-committed-observation';
        return result;
      }
      const operationKey = JSON.stringify([conversationId, operationId, policy.revision]);
      if (acceptedOperations.has(operationKey)) {
        result.refusal = 'duplicate-operation';
        return result;
      }

      // Diagnostic for the explicit-public-field path. The fallback below exercises
      // the pinned presentation grammar, never a synthetic group-to-source map.
      const sourceFields = ['sourceMessageIds', 'eligibleSourceIds', 'sourceRanges'];
      const locations = [operation, operation.result, operation.result.snapshot, operation.result.snapshot.current];
      result.structuredSourceMembership = sourceFields.some(field =>
        locations.some(value => Array.isArray(value?.[field]))) ? 'field-present' : 'field-absent';
      const text = operation.result.snapshot.current?.observations;
      const groups = typeof text === 'string' ? [...text.matchAll(groupPattern)] : [];
      if (!groups.length) {
        result.refusal = 'no-recognized-range-markup';
        return result;
      }

      // One bounded product source page is sufficient for this tiny fixture. An
      // incomplete page or a longer range would need stronger membership evidence.
      const page = await call('app.memorySourcePage', () => ports.memorySourcePage(stores, owner, conversationId));
      assert.equal(page.authorityRevision, policy.revision);
      result.sourcePage = { nextCursor: page.nextCursor,
        rows: page.sources.map(({ id, role, at, excluded, conversationId: thread }) =>
          ({ id, role, at, excluded, conversationId: thread })) };
      const eligible = page.sources.filter(source => source.conversationId === conversationId && !source.excluded);
      const sourceIndex = new Map(eligible.map((source, index) => [source.id, { source, index }]));
      const pendingRanges = new Set();
      const pendingClaims = [];
      for (const [, groupId, first, last, body] of groups) {
        const range = { groupId, first, last };
        result.ranges.push(range);
        const rangeKey = JSON.stringify([conversationId, policy.revision, groupId, first, last]);
        if (acceptedRanges.has(rangeKey) || pendingRanges.has(rangeKey)) {
          range.disposition = 'previous-range';
          continue;
        }
        const start = sourceIndex.get(first), end = sourceIndex.get(last);
        if (!start || !end || page.nextCursor) {
          range.disposition = 'eligible-endpoints-unresolved';
          continue;
        }
        const singleton = first === last && start.source.role === 'user';
        const pair = end.index === start.index + 1 && start.source.role === 'user' &&
          end.source.role === 'assistant' && start.source.at < end.source.at;
        range.eligibleEndpointIds = singleton ? [start.source.id] : [start.source.id, end.source.id];
        if (!singleton && !pair) {
          range.disposition = 'exact-membership-unproven';
          continue;
        }
        range.disposition = singleton ? 'bounded-single-message-range' : 'bounded-two-message-range';
        pendingRanges.add(rangeKey);
        for (const line of body.split('\n')) {
          const quote = line.startsWith('- ') ? line.slice(2).trim() : '';
          if (!quote) continue;
          const offset = start.source.text.indexOf(quote);
          if (offset < 0 || start.source.text.indexOf(quote, offset + 1) >= 0) {
            result.unknown.push({ groupId, text: quote, reason: 'unique-user-span-unresolved' });
            continue;
          }
          pendingClaims.push({ groupId, sourceId: start.source.id, role: start.source.role,
            conversationId, authorityRevision: policy.revision, sourceText: start.source.text,
            span: { start: offset, end: offset + quote.length, text: quote } });
        }
      }
      const finalPolicy = await call('vict.authority', () => memory.service.authority(conversationId));
      if (ports.policyIdentity(finalPolicy) !== ports.policyIdentity(policy)) {
        result.refusal = 'authority-changed-during-read';
        return result;
      }
      for (const key of pendingRanges) acceptedRanges.add(key);
      acceptedOperations.add(operationKey);
      result.accepted = pendingClaims;
      return result;
    } finally {
      await memory?.hosted.close();
      result.metrics = { namedReads: reads.length, namedResultBytes: reads.reduce((sum, row) => sum + row.resultBytes, 0),
        postgresWire: meter.read(), elapsedMs: Number((performance.now() - begin).toFixed(3)) };
    }
  };
}
