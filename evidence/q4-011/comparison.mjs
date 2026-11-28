import assert from 'node:assert/strict';
import { digest } from './voices.mjs';

export const normalizations = [
  'content parts only: numeric providerOptions.mastra.createdAt',
  'model options: x-thread-id exactly equals the installed thread binding',
  'recall tool description: exact admitted conversation-specific revision',
];

export function matchingModelInput(native, modelOptions, thread, recallRevision) {
  const messages = structuredClone(native);
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const mastra = part.providerOptions?.mastra;
      if (mastra && Object.hasOwn(mastra, 'createdAt')) {
        assert.ok(Number.isSafeInteger(mastra.createdAt) && mastra.createdAt > 0, 'Unexpected Mastra epoch metadata');
        mastra.createdAt = 'capture-time';
      }
    }
  }
  const options = structuredClone(modelOptions);
  assert.equal(options.headers?.['x-thread-id'], 'vict-conv-' + thread);
  options.headers['x-thread-id'] = 'admitted-thread';
  assert.match(recallRevision, /^[a-f0-9]{64}$/);
  const recall = options.tools.filter(tool => tool.name === 'recall');
  assert.equal(recall.length, 1);
  assert.equal(recall[0].description.split(recallRevision).length, 2);
  recall[0].description = recall[0].description.replace(recallRevision, 'admitted-recall-revision');
  return { ordinaryMessages: digest(messages), toolSchemasAndOptions: digest(options) };
}
