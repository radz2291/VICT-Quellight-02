import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { digest } from '../q4-011/voices.mjs';

export const routerId = 'zai-coding-plan/glm-5.3-flash';
export const wireModel = 'glm-5.3-flash';
export const endpoint = 'https://api.z.ai/api/coding/paas/v4';
const completion = endpoint + '/chat/completions';

export async function credential(path) {
  const text = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '').trim();
  const apiKey = /^(?:export +)?ZHIPU_API_KEY\s*=/.test(text) ? parseEnv(text).ZHIPU_API_KEY : text;
  assert.ok(typeof apiKey === 'string' && /^[^\s=]+$/.test(apiKey), 'Provide a raw key line or ZHIPU_API_KEY assignment');
  return apiKey;
}

const integer = value => {
  if (typeof value === 'string' && /^\d{1,9}$/.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};

function usageFields(usage) {
  const fields = ['inputTokens', 'outputTokens', 'totalTokens', 'reasoningTokens', 'cachedInputTokens'];
  return Object.fromEntries(fields.flatMap(field => integer(usage?.[field]) === undefined ? [] : [[field, integer(usage[field])]]));
}

export function watchModel(model, capture) {
  const observe = async (method, options) => {
    const { abortSignal, ...safe } = options;
    const snapshot = JSON.parse(JSON.stringify(safe));
    assert.ok(!Object.keys(snapshot.headers ?? {}).some(key => /authorization|api-key/i.test(key)), 'Credential header at SDK boundary');
    capture.steps.push({ method, options: snapshot, usage: null });
    const item = capture.steps.at(-1);
    const result = await model[method](options);
    if (result.stream) {
      const stream = result.stream.pipeThrough(new TransformStream({
        transform(part, controller) {
          if (part.type === 'finish') item.usage = usageFields(part.usage);
          controller.enqueue(part);
        },
      }));
      return { ...result, stream };
    }
    item.usage = usageFields(result.usage);
    return result;
  };
  return {
    specificationVersion: model.specificationVersion, provider: model.provider, modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    doGenerate: options => observe('doGenerate', options), doStream: options => observe('doStream', options),
  };
}

/** Observe only the authorized wire protocol. The SDK receives the original response. */
export async function withWireCapture(wire, mode, callback, beforeSend) {
  const fetch = globalThis.fetch;
  let refusal;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    assert.equal(url, completion, 'Unexpected model endpoint');
    if (refusal) return new Response(refusal.body, { status: refusal.status, headers: refusal.headers });
    const text = typeof init?.body === 'string' ? init.body :
      input instanceof Request ? await input.clone().text() : '';
    const payload = JSON.parse(text);
    const { model, messages, tools, ...options } = payload;
    assert.equal(model, wireModel);
    assert.ok(Array.isArray(messages));
    const record = { model, stream: options.stream === true, settingsDigest: digest(options),
      generationOverrides: Object.keys(options).filter(key => ['temperature', 'top_p', 'top_k', 'max_tokens',
        'max_completion_tokens', 'frequency_penalty', 'presence_penalty', 'seed', 'stop', 'reasoning_effort', 'thinking'].includes(key)),
      status: null, code: null };
    beforeSend?.();
    wire.push(record);
    const response = mode === 'mock' ? mockCompletion() :
      await fetch(input, { ...init, redirect: 'error' });
    record.status = response.status;
    if (response.status >= 400) {
      const body = await response.clone().text();
      let code;
      try { code = integer(JSON.parse(body).error?.code); } catch { /* Text responses have no business code. */ }
      record.code = code ?? null;
      record.retryAfterSeconds = integer(response.headers.get('retry-after')) ?? null;
      if ([401, 402, 403, 429].includes(response.status) || code === 1113) {
        refusal = { body, status: response.status, headers: response.headers };
      }
    }
    return observeEventStream(response, record);
  };
  try { return await callback(); }
  finally { globalThis.fetch = fetch; }
}

function observeEventStream(response, record) {
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) return response;
  const decoder = new TextDecoder();
  let pending = '';
  const fields = ['prompt_tokens', 'completion_tokens', 'total_tokens', 'prompt_cache_hit_tokens', 'prompt_cache_miss_tokens'];
  const readLine = line => {
    if (!line.startsWith('data:')) return;
    try {
      const { usage } = JSON.parse(line.slice(5).trim());
      if (!usage) return;
      const counts = Object.fromEntries(fields.flatMap(field => integer(usage[field]) === undefined ? [] : [[field, integer(usage[field])]]));
      const cached = integer(usage.prompt_tokens_details?.cached_tokens);
      const reasoning = integer(usage.completion_tokens_details?.reasoning_tokens);
      if (cached !== undefined) counts.cached_tokens = cached;
      if (reasoning !== undefined) counts.reasoning_tokens = reasoning;
      if (Object.keys(counts).length) record.usage = counts;
    } catch { /* The final SSE sentinel and incomplete lines carry no usage. */ }
  };
  const stream = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) readLine(line);
      controller.enqueue(chunk);
    },
    flush() { readLine(pending + decoder.decode()); },
  }));
  return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
}
function mockCompletion() {
  const make = (delta, finish_reason = null, usage) => ({ id: 'q4-012-mock', object: 'chat.completion.chunk',
    created: 1, model: wireModel, choices: [{ index: 0, delta, finish_reason }], ...(usage ? { usage } : {}) });
  return new Response([
    make({ role: 'assistant', content: 'Synthetic provider transport verification.' }),
    make({}, 'stop', { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 }),
  ].map(value => 'data: ' + JSON.stringify(value) + '\n\n').join('') + 'data: [DONE]\n\n',
  { headers: { 'content-type': 'text/event-stream' } });
}
