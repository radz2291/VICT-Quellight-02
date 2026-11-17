import { randomUUID } from 'node:crypto';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import { ProductError } from '../domain/queries.js';
import type { FencedMemorySettingsClient } from './settings.js';

/** All app-owned source-authority changes and derived product writes share this gate. */
export const memoryCareScope = (actorId: string) => `quellight-memory-care:${actorId}`;

/**
 * Read native authority before opening the product transaction (the hosted pool has
 * one connection). Memory care uses this same lease, and withFence locks/validates
 * that lease through the product commit. No provider call belongs in work.
 */
export async function withMemoryAuthorityFence<T>(stores: PostgresStoreSet, actorId: string,
  expectedRevision: string, readAuthority: () => Promise<{ revision: string }>,
  work: (client: FencedMemorySettingsClient) => Promise<T>,
  validateBeforeTransaction?: () => Promise<void>): Promise<T> {
  const claim = await stores.coordination.acquire({ scopeId: memoryCareScope(actorId), actorId,
    ownerId: randomUUID(), leaseMs: 60_000 });
  if (claim.status !== 'acquired') throw new ProductError('MEMORY_CARE_IN_PROGRESS', 409);
  try {
    if ((await readAuthority()).revision !== expectedRevision) throw new ProductError('DESK_AUTHORITY_CHANGED', 409);
    await validateBeforeTransaction?.();
    let known: ProductError | undefined;
    try {
      return await stores.coordination.withFence(claim.lease, async client => {
        try { return await work(client); }
        catch (error) { if (error instanceof ProductError) known = error; throw error; }
      });
    } catch (error) { throw known ?? error; }
  } finally { await stores.coordination.release(claim.lease); }
}
