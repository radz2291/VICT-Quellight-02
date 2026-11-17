import { createHash, randomUUID } from 'node:crypto';
import { createRuntime } from '@victframework/runtime';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import { neutralJsonContract, type Contract } from '@victframework/sdk';
import { authorizedActor, ProductError, type Owner } from '../domain/queries.js';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type FencedClient = Parameters<Parameters<PostgresStoreSet['coordination']['withFence']>[1]>[0];
export interface MemoryMutationBinding<T> { id: string; capabilityId: string; permission: string; input: Contract<T> }

/** Explicit owner actions use declared VICT write authority and a durable command receipt. */
export async function executeMemoryMutation<T>(stores: PostgresStoreSet, owner: Owner,
  binding: MemoryMutationBinding<T>, input: unknown, commandKey: string,
  mutate: (client: FencedClient, value: T) => Promise<unknown>) {
  if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(commandKey)) throw new ProductError('ACTION_KEY_INVALID');
  const parsed = binding.input.parse(input);
  if (!parsed.ok) throw new ProductError('ACTION_INPUT_INVALID');
  const actor = await authorizedActor(stores, owner, 'app.data.write');
  const argumentDigest = digest({ actionId: binding.id, revision: '1', input: parsed.value });
  const scopeId = `quellight-memory-command:${digest([owner.actorId, commandKey])}`;
  let runId = scopeId;
  const claim = await stores.coordination.acquire({ scopeId, actorId: actor.actorId, ownerId: randomUUID(), leaseMs: 60_000 });
  if (claim.status !== 'acquired') throw new ProductError('ACTION_IN_PROGRESS', 409);
  try {
    const fenced = stores.forLease(claim.lease);
    const prior = await stores.coordination.getEffect(scopeId, actor.actorId, 'memory-mutation');
    if (prior && prior.argumentDigest !== argumentDigest) throw new ProductError('ACTION_CONFLICT', 409);
    let effectId = 'memory-mutation';
    let replay = false;
    if (prior) {
      const run = await fenced.execution.getRun(runId);
      if (run?.status === 'completed' && prior.status !== 'not-applied') {
        await stores.coordination.settleEffect(claim.lease, effectId, argumentDigest, 'applied');
        return { ok: true as const, value: run.output, replay: true };
      }
      const saved = await stores.coordination.withFence(claim.lease, client => client.query(
        'SELECT argument_digest,result FROM quellight_product_v1.command_receipts WHERE actor_id=$1 AND command_key=$2', [owner.actorId, commandKey]));
      if (saved.rows[0] && saved.rows[0].argument_digest !== argumentDigest) throw new ProductError('ACTION_CONFLICT', 409);
      replay = !!saved.rows[0];
      // The mutation and receipt commit together under this command's fence. The newly
      // acquired lease excludes an old host from committing later. Reconcile the effect
      // from that durable fact, while leaving the original execution record untouched.
      if (prior.status === 'uncertain') await stores.coordination.settleEffect(claim.lease, effectId, argumentDigest, replay ? 'applied' : 'not-applied');
      if (prior.status === 'applied' && !replay) throw new ProductError('ACTION_OUTCOME_UNCONFIRMED', 503);
      const occurrence = randomUUID();
      runId = `${scopeId}:${occurrence}`;
      effectId = `memory-recovery:${occurrence}`;
      // A saved receipt is returned by a NEW governed execution. We never invent a
      // completed original run after a host exit between its SQL commit and settlement.
    }
    let failure: ProductError | undefined;
    const runtime = createRuntime({ stores: fenced, ids: { runId: () => runId }, payloadRetention: 'full', authority: { grants: [binding.permission] } });
    runtime.registerCapability({ id: binding.capabilityId, revision: '1', effect: 'write', permissions: [binding.permission],
      input: binding.input, output: neutralJsonContract,
      invoke: async value => stores.coordination.withFence(claim.lease, async client => {
        try {
          const previous = await client.query('SELECT argument_digest,result FROM quellight_product_v1.command_receipts WHERE actor_id=$1 AND command_key=$2', [owner.actorId, commandKey]);
          if (previous.rows[0]) {
            if (previous.rows[0].argument_digest !== argumentDigest) throw new ProductError('ACTION_CONFLICT', 409);
            return previous.rows[0].result;
          }
          const result = JSON.parse(JSON.stringify(await mutate(client, value)));
          await client.query('INSERT INTO quellight_product_v1.command_receipts(actor_id,command_key,argument_digest,result) VALUES($1,$2,$3,$4::jsonb)',
            [owner.actorId, commandKey, argumentDigest, JSON.stringify(result)]);
          return result;
        } catch (error) { if (error instanceof ProductError) failure = error; throw error; }
      }),
    });
    const activation = await runtime.activate({ id: `quellight.${binding.id}`, entry: 'mutate', nodes: [{ id: 'mutate', capability: binding.capabilityId }], edges: [] });
    if (!activation.ok) throw new ProductError('ACTION_CONFIGURATION_INVALID', 503);
    const effect = await stores.coordination.beginEffect(claim.lease, effectId, argumentDigest);
    if (effect.status !== 'started') throw new ProductError('ACTION_OUTCOME_UNCONFIRMED', 409);
    await runtime.run(parsed.value, { mode: 'normal' });
    const run = await fenced.execution.getRun(runId);
    if (run?.status !== 'completed') {
      if (failure) {
        await stores.coordination.settleEffect(claim.lease, effectId, argumentDigest, 'not-applied');
        throw failure;
      }
      throw new ProductError('ACTION_OUTCOME_UNCONFIRMED', 503);
    }
    await stores.coordination.settleEffect(claim.lease, effectId, argumentDigest, 'applied');
    return { ok: true as const, value: run.output, replay };
  } finally { await stores.coordination.release(claim.lease); }
}
