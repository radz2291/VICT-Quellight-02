import { createHash, randomUUID } from 'node:crypto';
import { createRuntime } from '@victframework/runtime';
import type { HostedLease } from '@victframework/runtime';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import { productActionBindings, type ProductActionId, type ProductInput } from '../../product/domain-contracts.js';
import { authorizedActor, ProductError, type Owner } from './queries.js';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const publicRoom = `id, name, purpose, archived_at AS "archivedAt", revision, created_at AS "createdAt", updated_at AS "updatedAt"`;
const publicConversation = `id, actor_id AS "actorId", room_id AS "roomId", thread_id AS "threadId", title, archived_at AS "archivedAt", revision, created_at AS "createdAt", updated_at AS "updatedAt"`;
const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value));

async function mutate(stores: PostgresStoreSet, lease: HostedLease, owner: Owner, actionId: ProductActionId,
  input: ProductInput, commandKey: string, argumentDigest: string, refuse: (error: ProductError) => void) {
  return stores.coordination.withFence(lease, async client => {
    try {
      const prior = await client.query('SELECT argument_digest,result FROM quellight_product_v1.command_receipts WHERE actor_id=$1 AND command_key=$2', [owner.actorId, commandKey]);
      if (prior.rows[0]) {
        if (prior.rows[0].argument_digest !== argumentDigest) throw new ProductError('ACTION_CONFLICT', 409);
        return prior.rows[0].result;
      }
      let value;
      if (actionId === 'room.create') {
        value = (await client.query(`INSERT INTO quellight_product_v1.rooms(id,actor_id,name,purpose) VALUES($1,$2,$3,$4) RETURNING ${publicRoom}`,
          [randomUUID(), owner.actorId, input.name, input.purpose ?? ''])).rows[0];
      } else if (actionId === 'conversation.create') {
        // Lock the room so an archive and a new conversation have one order.
        const room = await client.query('SELECT id FROM quellight_product_v1.rooms WHERE id=$1 AND actor_id=$2 AND archived_at IS NULL FOR UPDATE', [input.roomId, owner.actorId]);
        if (!room.rows[0]) throw new ProductError('ROOM_UNAVAILABLE', 409);
        const id = randomUUID();
        value = (await client.query(`INSERT INTO quellight_product_v1.conversations(id,actor_id,room_id,thread_id,title) VALUES($1,$2,$3,$4,$5) RETURNING ${publicConversation}`,
          [id, owner.actorId, input.roomId, `quellight-conversation-${id}`, input.title ?? 'New conversation'])).rows[0];
      } else {
        const room = await client.query('SELECT revision,archived_at FROM quellight_product_v1.rooms WHERE id=$1 AND actor_id=$2 FOR UPDATE', [input.id, owner.actorId]);
        if (!room.rows[0]) throw new ProductError('ROOM_NOT_FOUND', 404);
        if (room.rows[0].revision !== input.revision) throw new ProductError('REVISION_CONFLICT', 409);
        if (room.rows[0].archived_at) throw new ProductError('ROOM_ARCHIVED', 409);
        const statement = actionId === 'room.rename'
          ? `UPDATE quellight_product_v1.rooms SET name=$3,revision=revision+1,updated_at=now() WHERE id=$1 AND actor_id=$2 RETURNING ${publicRoom}`
          : `UPDATE quellight_product_v1.rooms SET archived_at=now(),revision=revision+1,updated_at=now() WHERE id=$1 AND actor_id=$2 RETURNING ${publicRoom}`;
        const args = actionId === 'room.rename' ? [input.id, owner.actorId, input.name] : [input.id, owner.actorId];
        value = (await client.query(statement, args)).rows[0];
      }
      const output = jsonValue(value);
      await client.query('INSERT INTO quellight_product_v1.command_receipts(actor_id,command_key,argument_digest,result) VALUES($1,$2,$3,$4::jsonb)',
        [owner.actorId, commandKey, argumentDigest, JSON.stringify(output)]);
      return output;
    } catch (error) {
      // Capture known pre-write domain refusals before the driver sanitizes errors.
      if (error instanceof ProductError) refuse(error);
      throw error;
    }
  });
}

export async function executeProductAction(stores: PostgresStoreSet, owner: Owner, actionId: string, input: unknown, commandKey: string) {
  const binding = productActionBindings[actionId as ProductActionId];
  if (!Object.prototype.hasOwnProperty.call(productActionBindings, actionId) || !binding) throw new ProductError('ACTION_UNDECLARED', 400);
  if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(commandKey)) throw new ProductError('ACTION_KEY_INVALID', 400);
  const parsed = binding.input.parse(input);
  if (!parsed.ok) throw new ProductError('ACTION_INPUT_INVALID', 400);
  const actor = await authorizedActor(stores, owner, 'app.data.write');
  const argumentDigest = digest({ actionId, revision: '1', input: parsed.value });
  const scopeId = `quellight-command:${digest([owner.actorId, commandKey])}`;
  const runId = `quellight-command:${digest([owner.actorId, commandKey])}`;
  const claim = await stores.coordination.acquire({ scopeId, actorId: actor.actorId, ownerId: randomUUID(), leaseMs: 60_000 });
  if (claim.status !== 'acquired') throw new ProductError('ACTION_IN_PROGRESS', 409);
  const lease = claim.lease;
  try {
    const prior = await stores.coordination.getEffect(scopeId, actor.actorId, 'product-mutation');
    if (prior && prior.argumentDigest !== argumentDigest) throw new ProductError('ACTION_CONFLICT', 409);
    const fenced = stores.forLease(lease);
    const existing = await fenced.execution.getRun(runId);
    if (prior) {
      if (prior.status === 'applied' && existing?.status === 'completed') {
        return { ok: true as const, value: existing.output, replay: true };
      }
      throw new ProductError('ACTION_OUTCOME_UNCONFIRMED', 409);
    }
    const runtime = createRuntime({ stores: fenced, ids: { runId: () => runId }, payloadRetention: 'full', authority: { grants: [binding.permission] } });
    let failure: ProductError | undefined;
    runtime.registerCapability({ id: binding.capabilityId, revision: '1', effect: 'write', permissions: [binding.permission],
      input: binding.input, output: binding.output,
      invoke: async value => {
        return mutate(stores, lease, owner, binding.id, value, commandKey, argumentDigest, error => { failure = error; });
      } });
    const graph = { id: `quellight.${actionId}`, entry: 'mutate', nodes: [{ id: 'mutate', capability: binding.capabilityId }], edges: [] };
    const activation = await runtime.activate(graph);
    if (!activation.ok) throw new ProductError('ACTION_CONFIGURATION_INVALID', 503);
    const begun = await stores.coordination.beginEffect(lease, 'product-mutation', argumentDigest);
    if (begun.status !== 'started') throw new ProductError('ACTION_OUTCOME_UNCONFIRMED', 409);
    await runtime.run(parsed.value, { mode: 'normal' });
    const result = await fenced.execution.getRun(runId);
    if (result?.status !== 'completed') {
      if (failure) {
        // Product validation threw inside the transaction, which rolled back.
        await stores.coordination.settleEffect(lease, 'product-mutation', argumentDigest, 'not-applied');
        throw failure;
      }
      throw new ProductError('ACTION_OUTCOME_UNCONFIRMED', 503);
    }
    await stores.coordination.settleEffect(lease, 'product-mutation', argumentDigest, 'applied');
    return { ok: true as const, value: result.output, replay: false };
  } finally { await stores.coordination.release(lease); }
}

/** Explicit operator bootstrap after the Supabase owner account is provisioned. */
export async function provisionOwner(stores: PostgresStoreSet, owner: Owner) {
  const prior = await stores.actors.get(owner.actorId);
  if (!prior) await stores.actors.upsert({ actorId: owner.actorId, status: 'active', roles: [], createdAt: Date.now(),
    scopes: ['app.data.read', 'app.data.write', 'agent.turn.start', 'agent.turn.cancel', 'agent.stream.read', 'run.read', 'run.cancel', 'conversation.read', 'conversation.delete'] });
  return executeProductAction(stores, owner, 'room.create', { name: 'Home', purpose: '' }, 'bootstrap-default-room');
}
