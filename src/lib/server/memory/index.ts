import { env } from '$env/dynamic/private';
import { ModelRouterLanguageModel } from '@mastra/core/llm';
import { protectCredentialPort, requireCredential } from '@victframework/runtime';
import { openProductDatabase } from '../db/index.js';
import { conversations } from '../conversation/index.js';
import { MODEL, CREDENTIAL, PROVIDER_URL } from '../conversation/activation.js';
import { createMemoryDispatcher } from './dispatcher.js';
import { createMemoryJobProcessor } from './worker.js';
import { processPendingMemoryCare } from './care-actions.js';
import { createMethodJobProcessor } from '../desk/method-worker.js';
import { createDeskMethodExecutor } from '../desk-method-execution.js';
import { createDeskMemoryContext } from '../desk-memory-context.js';

const credentials = protectCredentialPort({ async get(name) { return name === CREDENTIAL ? env[CREDENTIAL] : undefined; } });
async function modelFactory() {
  const key = requireCredential(await credentials.get(CREDENTIAL), CREDENTIAL);
  if (!key || /\s/.test(key)) throw new Error('PROVIDER_CREDENTIAL_MISSING');
  return () => new ModelRouterLanguageModel({ id: MODEL, url: PROVIDER_URL, apiKey: key });
}
const methodExecutor = createDeskMethodExecutor({ modelFactory });
export const dispatchMemory = createMemoryDispatcher({
  // Required at dispatch, before opening stores/provider; never at build/module import.
  resolveActorId: () => env.QUELLIGHT_OWNER_SUBJECT,
  openDatabase: openProductDatabase,
  reconcileConversations: conversations.reconcilePending,
  reconcileCare: (stores, deadline, owner) => processPendingMemoryCare(stores, deadline.getTime(), {}, owner),
  process: createMemoryJobProcessor({ modelFactory }),
  processMethod: createMethodJobProcessor({ generate: methodExecutor,
    openContext: (stores, job) => createDeskMemoryContext(stores,
      { id: job.actor_id, actorId: job.actor_id, email: '' }, job.conversation_id),
  }),
});
