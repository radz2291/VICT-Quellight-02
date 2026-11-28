import assert from 'node:assert/strict';
import { credential, endpoint, routerId, watchModel, withWireCapture } from '../q4-012/provider.mjs';
import { sha } from '../q4-011/voices.mjs';

export { credential, routerId };
export const textOf = content => typeof content === 'string' ? content :
  content.filter(part => part.type === 'text').map(part => part.text).join('');

// The inherited guard fixes the route and model. This wrapper witnesses the exact
// outgoing body and retains assistant text only. No headers or reasoning are captured.
export async function captureLive(capture, callback, verify) {
  const realFetch = globalThis.fetch;
  const witness = async (input, init) => {
    const body = typeof init?.body === 'string' ? init.body : await input.clone().text();
    const payload = JSON.parse(body);
    assert.ok(!Object.keys(payload).some(key => /api.?key|authorization/i.test(key)));
    capture.requests.push({ payload, bytes: Buffer.byteLength(body), sha256: sha(body) });
    verify?.(capture, capture.requests.length - 1);
    return realFetch(input, init);
  };
  globalThis.fetch = witness;
  try { return await withWireCapture(capture.wire, 'live', callback); }
  finally { globalThis.fetch = realFetch; }
}

export function liveModel(ModelRouterLanguageModel, apiKey, profile, capture) {
  assert.equal(profile.routerModel, routerId);
  assert.equal(profile.id, 'quellight.glm-flash');
  assert.equal(profile.revision, '1');
  const model = watchModel(new ModelRouterLanguageModel({ id: profile.routerModel, url: endpoint, apiKey }), capture);
  return {
    ...model,
    async doGenerate(options) {
      const value = await model.doGenerate(options);
      capture.steps.at(-1).text = textOf(value.content);
      return value;
    },
    async doStream(options) {
      const value = await model.doStream(options);
      const step = capture.steps.at(-1);
      step.text = '';
      return { ...value, stream: value.stream.pipeThrough(new TransformStream({
        transform(part, controller) {
          if (part.type === 'text-delta') step.text += part.delta;
          controller.enqueue(part);
        },
      })) };
    },
  };
}

export function scriptedModel(text, capture) {
  return {
    specificationVersion: 'v2', provider: 'q4-013-fixture', modelId: routerId, supportedUrls: {},
    async doGenerate(options) {
      const { abortSignal, ...safe } = options;
      capture?.steps.push({ method: 'doGenerate', options: JSON.parse(JSON.stringify(safe)), text });
      return { content: [{ type: 'text', text }], finishReason: 'stop', warnings: [],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
    },
    async doStream(options) {
      const { abortSignal, ...safe } = options;
      capture?.steps.push({ method: 'doStream', options: JSON.parse(JSON.stringify(safe)), text });
      return { stream: new ReadableStream({ start(controller) {
        for (const event of [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'fixture' },
          { type: 'text-delta', id: 'fixture', delta: text }, { type: 'text-end', id: 'fixture' },
          { type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }])
          controller.enqueue(event);
        controller.close();
      } }) };
    },
  };
}

export const newCapture = () => ({ steps: [], wire: [], requests: [], reads: [], bindings: [], profiles: [] });
