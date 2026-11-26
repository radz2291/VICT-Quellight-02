import { createHash } from 'node:crypto';
import {
  createPostgresMastraStore, MastraMemoryService,
  MASTRA_RECOVERABLE_MEMORY_ADAPTER_COMPATIBILITY,
  type MastraNativeMemoryConfig, type MastraProductAgentConfig, type MemoryWriteRequest,
} from '@victframework/mastra';
import type { PostgresStoreSet } from '@victframework/store-postgres';
import baseline from '../../../../baseline.json' with { type: 'json' };
import policyData from './native-policy.json' with { type: 'json' };
import { MODEL, CREDENTIAL } from '../conversation/activation.js';
import { automaticMemoryWriter } from './automatic-authority.js';
import { allowsMemorySource } from './recall-policy.js';
import type { EffectiveMemorySettings } from './settings.js';

export const QUELLIGHT_NATIVE_MEMORY_SCHEMA = 'quellight_memory_v2';
export const QUELLIGHT_MEMORY_RECALL_PERMISSION = 'quellight.memory.recall';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid = (): never => { throw new Error('MEMORY_NATIVE_CONFIGURATION_INVALID'); };
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function artifactDigest(name: string): string {
  const artifact = baseline.artifacts.find(candidate => candidate.name === name);
  if (!artifact || !/^[0-9a-f]{64}$/.test(artifact.sha256)) return invalid();
  return artifact.sha256;
}

/** Product tuning is data. This threshold triggers extraction, never limits generation. */
export const quellightNativeMemoryPolicy = freeze(structuredClone(policyData));
export const quellightNativeMemoryIdentity = freeze({
  schema: 'quellight.native-memory-binding@1',
  policy: quellightNativeMemoryPolicy,
  adapter: MASTRA_RECOVERABLE_MEMORY_ADAPTER_COMPATIBILITY,
  mastraArchiveSha256: artifactDigest('@victframework/mastra'),
  runtimeArchiveSha256: artifactDigest('@victframework/runtime'),
});

/** Produces no text and never contacts a provider. Mutation roles require an explicit model factory. */
const readOnlyModel = Object.freeze({
  specificationVersion: 'v2' as const,
  provider: 'quellight-read-only',
  modelId: 'unavailable',
  supportedUrls: {},
  async doGenerate(): Promise<never> { throw new Error('MEMORY_MODEL_NOT_CONFIGURED'); },
  async doStream(): Promise<never> { throw new Error('MEMORY_MODEL_NOT_CONFIGURED'); },
});

export function quellightNativeMemoryConfiguration(effective: EffectiveMemorySettings): MastraNativeMemoryConfig {
  const policy = quellightNativeMemoryPolicy;
  if (policy.generationPolicy !== 'provider-defaults' || !Number.isInteger(policy.lastMessages) ||
    policy.lastMessages < 1 || !Number.isInteger(policy.observation.messageTokens) ||
    policy.observation.messageTokens < 1 || !effective.revision) return invalid();
  const roles = effective.prompts.roles;
  return freeze({
    id: policy.id,
    revision: digest({ identity: quellightNativeMemoryIdentity, settingsRevision: effective.revision }),
    modelProfile: { ...policy.modelProfile, routerModel: MODEL, providerCredentialVar: CREDENTIAL },
    generationPolicy: policy.generationPolicy,
    lastMessages: policy.lastMessages,
    observation: { messageTokens: policy.observation.messageTokens,
      ...(roles.observer.text === undefined ? {} : { instruction: roles.observer.text }) },
    ...(roles.reflector.text === undefined ? {} : { reflection: { instruction: roles.reflector.text } }),
    workingMemory: { enabled: effective.configuration.values.personalPreferences,
      ...(roles.workingMemory.text === undefined ? {} : { template: roles.workingMemory.text }) },
    retrieval: { scope: 'resource',
      ...(roles.recall.text === undefined ? {} : { instructions: roles.recall.text }) },
  });
}

export interface OpenQuellightMemoryOptions {
  stores: PostgresStoreSet;
  coordination?: PostgresStoreSet['coordination'];
  ownerActorId: string;
  conversationId: string;
  effective: EffectiveMemorySettings;
  modelFactory?: MastraProductAgentConfig['modelFactory'];
  /** Durable coordination renewal interval, independent of provider completion. */
  leaseMs?: number;
}

/** Open existing native storage only. Authentication, source import and job admission belong to callers. */
export async function openQuellightMemory(options: OpenQuellightMemoryOptions) {
  const { stores, ownerActorId, conversationId, effective } = options;
  const config = quellightNativeMemoryConfiguration(effective);
  const hosted = await createPostgresMastraStore({
    coordination: options.coordination ?? stores.coordination,
    schemaName: QUELLIGHT_NATIVE_MEMORY_SCHEMA,
    migration: 'verify',
    memoryProfile: 'native-thread-recoverable',
    ...(options.leaseMs === undefined ? {} : { leaseMs: options.leaseMs }),
  });
  try {
    // Reads must not save activations or create write receipts.
    let writer: ReturnType<typeof automaticMemoryWriter> | undefined;
    const service = new MastraMemoryService({
      store: hosted.store, actorId: ownerActorId, config,
      modelFactory: options.modelFactory ?? (() => readOnlyModel),
      governedWrite: async <T>(request: MemoryWriteRequest, effect: () => Promise<T>): Promise<T> => {
        writer ??= automaticMemoryWriter(stores, ownerActorId);
        return (await writer)(request, effect);
      },
    });
    const scope = effective.configuration.values.recallScope;
    const accessRevision = digest({ schema: 'quellight.memory-source-policy@1',
      ownerActorId, conversationId, scope, effectiveRevision: effective.revision });
    const recallCapability = service.createSourceRecallCapability({
      revision: digest({ configurationRevision: service.configurationRevision, accessRevision }),
      permissions: [QUELLIGHT_MEMORY_RECALL_PERMISSION],
      access: { id: 'quellight.memory.source-policy', revision: accessRevision,
        allows: request => allowsMemorySource(stores.coordination.pool, ownerActorId, conversationId, scope, request) },
    });
    return Object.freeze({ hosted, service, config, modelProfile: config.modelProfile, recallCapability });
  } catch (error) {
    await hosted.close();
    throw error;
  }
}
