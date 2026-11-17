import { env } from '$env/dynamic/private';
import { ModelRouterLanguageModel } from '@mastra/core/llm';
import { protectCredentialPort, requireCredential } from '@victframework/runtime';
import { openProductDatabase } from '../db/index.js';
import { MODEL, CREDENTIAL, PROVIDER_URL } from '../conversation/activation.js';
import { createMemoryDispatcher } from './dispatcher.js';
import { createMemoryJobProcessor } from './worker.js';
import { processPendingMemoryCare } from './care-actions.js';

const credentials = protectCredentialPort({ async get(name) { return name === CREDENTIAL ? env[CREDENTIAL] : undefined; } });
export const dispatchMemory = createMemoryDispatcher({
  openDatabase: openProductDatabase,
  reconcileCare: (stores, deadline) => processPendingMemoryCare(stores, deadline.getTime()),
  process: createMemoryJobProcessor({ async modelFactory() {
    const key = requireCredential(await credentials.get(CREDENTIAL), CREDENTIAL);
    if (!key || /\s/.test(key)) throw new Error('PROVIDER_CREDENTIAL_MISSING');
    return () => new ModelRouterLanguageModel({ id: MODEL, url: PROVIDER_URL, apiKey: key });
  } }),
});
