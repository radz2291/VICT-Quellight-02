import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const endpoint = 'https://api.z.ai/api/coding/paas/v4';
const profile = 'zai-coding-plan/glm-5.3-flash';
const sha = text => createHash('sha256').update(text).digest('hex');
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const textOf = content => typeof content === 'string' ? content :
  Array.isArray(content) ? content.flatMap(part => part.type === 'text' && typeof part.text === 'string' ? [part.text] : []).join('\n') : '';
const roles = (prompt, role) => prompt.filter(item => item.role === role).map(item => textOf(item.content));
function synthesisInput(prompt) {
  for (const content of roles(prompt, 'user')) {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.sources) && Array.isArray(parsed.prior)) return parsed;
    } catch { /* Non-learning prompts follow the normal role protocol. */ }
  }
}
function fixtureAnswer(options) {
  const prompt = options.prompt;
  const synthesis = synthesisInput(prompt);
  if (synthesis) {
    const result = new Map();
    for (const { id, text } of synthesis.sources) {
      for (const [dimension, label] of [['understanding', 'Room evidence'], ['intent', 'Current aim'], ['attunement', 'Working agreement']]) {
        const line = text.split('\n').find(value => value.startsWith(label + ': '));
        const quote = line?.slice(label.length + 2).trim();
        if (quote) result.set(dimension, { dimension, sourceId: id, quote, text: quote, certainty: /might|undecided|possible|uncertain/i.test(quote) ? 'tentative' : 'stated' });
      }
    }
    return JSON.stringify([...result.values()]);
  }
  const input = roles(prompt, 'user').at(-1) ?? '';
  if (input.includes('## New Message History to Observe')) {
    return '<observations>\n- The room owner supplied current working context in this conversation.\n</observations>';
  }
  const authored = roles(prompt, 'system')[0] ?? '';
  if (/please.*update|what.*approval|who.*approv|decision roles/i.test(input) && !input.includes('Room evidence:')) {
    return /I give final approval|you.{0,25}final approval|owner.{0,25}final approval/i.test(authored)
      ? 'You give final approval. Mira checks wording only. Keep the draft serial Cedar-47 and leave vendor attendance undecided.'
      : 'I cannot infer who approves from this message. What approval roles apply?';
  }
  if (/solo review|stand in for/i.test(input)) {
    return 'Paste one timestamp and say what you noticed first. Then show the collaborator’s note. I’ll compare it with your observation, name one uncertainty, and suggest one check you can undo. You decide the edit.';
  }
  return 'I’ve understood this update. Let’s use the next reply to act on the agreed working context.';
}
const roleOf = options => synthesisInput(options.prompt) ? 'room-learning' :
  roles(options.prompt, 'user').some(text => text.includes('## New Message History to Observe')) ? 'native-observe' :
  roles(options.prompt, 'system').some(text => /Reflector/i.test(text) && text.includes('observations')) ? 'native-reflect' : 'conversation';
function deterministic() {
  return {
    specificationVersion: 'v2', provider: 'q4-014-fixture', modelId: 'q4-014-fixture', supportedUrls: {},
    async doGenerate(options) {
      return { content: [{ type: 'text', text: fixtureAnswer(options) }], warnings: [], finishReason: 'stop',
        usage: { inputTokens: 12, outputTokens: 20, totalTokens: 32 } };
    },
    async doStream(options) {
      return { stream: new ReadableStream({ start(controller) {
        for (const part of [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'fixture' },
          { type: 'text-delta', id: 'fixture', delta: fixtureAnswer(options) }, { type: 'text-end', id: 'fixture' },
          { type: 'finish', finishReason: 'stop', usage: { inputTokens: 12, outputTokens: 20, totalTokens: 32 } }]) {
          controller.enqueue(part);
        }
        controller.close();
      } }) };
    },
  };
}
export function readProviderKey(text) {
  const source = text.replace(/^\uFEFF/, '').trim();
  const key = /^(?:export +)?ZHIPU_API_KEY\s*=/.test(source) ? parseEnv(source).ZHIPU_API_KEY : source;
  assert.ok(typeof key === 'string' && /^[^\s=]+$/.test(key), 'Invalid authorized Z.AI key input');
  return key;
}
export function installFixtureModel({ live, trace }) {
  const append = entry => appendFileSync(trace, JSON.stringify(entry) + '\n', { mode: 0o600 });
  const state = { holdSynthesis: false, waiters: new Set(), nextCapture: 0 };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return previousFetch(input, init);
    assert.ok(live && url.href === endpoint + '/chat/completions', 'Unexpected external fetch on the isolated fixture');
    const message = typeof init?.body === 'string' ? init.body : await input.clone().text();
    const payload = JSON.parse(message);
    assert.equal(payload.model, 'glm-5.3-flash');
    const wire = ++state.nextCapture;
    append({ kind: 'wire-input', wire, bytes: Buffer.byteLength(message), sha256: sha(message), payload });
    const response = await previousFetch(input, { ...init, redirect: 'error' });
    append({ kind: 'wire-status', wire, status: response.status });
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) return response;
    const decoder = new TextDecoder();
    let pending = '';
    const note = line => {
      if (!line.startsWith('data:')) return;
      try {
        const usage = JSON.parse(line.slice(5).trim()).usage;
        if (!usage) return;
        const fields = ['prompt_tokens','completion_tokens','total_tokens','prompt_tokens_details','completion_tokens_details'];
        append({ kind: 'wire-usage', wire, usage: Object.fromEntries(fields.filter(field => usage[field] !== undefined)
          .map(field => [field, usage[field]])) });
      } catch { /* Ignore the stream sentinel. */ }
    };
    const body = response.body.pipeThrough(new TransformStream({
      transform(part, controller) {
        pending += decoder.decode(part, { stream: true });
        const lines = pending.split('\n'); pending = lines.pop();
        for (const line of lines) note(line);
        controller.enqueue(part);
      },
      flush() { note(pending + decoder.decode()); },
    }));
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
  const symbol = Symbol.for('quellight.q4-014.fixture-model');
  globalThis[symbol] = (options, Upstream) => {
    assert.equal(options.id, profile);
    assert.equal(options.url, endpoint);
    const model = live ? new Upstream(options) : deterministic();
    const run = async (method, request) => {
      const { abortSignal, ...inputs } = request;
      const id = ++state.nextCapture;
      const role = roleOf(inputs);
      const allowed = inputs.headers ?? {};
      assert.ok(!Object.keys(allowed).some(key => /authorization|api-key/i.test(key)));
      append({ kind: 'sdk-input', id, role, method, promptBytes: bytes(inputs.prompt), sha256: sha(JSON.stringify(inputs)), inputs });
      if (role === 'room-learning' && state.holdSynthesis) {
        await new Promise((resolve, reject) => {
          const release = () => { state.waiters.delete(release); abortSignal?.removeEventListener('abort', cancel); resolve(); };
          const cancel = () => { state.waiters.delete(release); reject(abortSignal.reason); };
          if (abortSignal?.aborted) return cancel();
          state.waiters.add(release);
          abortSignal?.addEventListener('abort', cancel, { once: true });
        });
      }
      const result = await model[method](request);
      if (!result.stream) {
        append({ kind: 'sdk-output', id, text: textOf(result.content), usage: result.usage });
        return result;
      }
      let publicText = '';
      const stream = result.stream.pipeThrough(new TransformStream({
        transform(part, controller) {
          if (part.type === 'text-delta') publicText += part.delta;
          if (part.type === 'finish') append({ kind: 'sdk-output', id, text: publicText, usage: part.usage });
          controller.enqueue(part);
        },
      }));
      return { ...result, stream };
    };
    return {
      specificationVersion: model.specificationVersion, provider: model.provider, modelId: model.modelId,
      supportedUrls: model.supportedUrls, doGenerate: request => run('doGenerate', request), doStream: request => run('doStream', request),
    };
  };
  return {
    hold() { state.holdSynthesis = true; },
    release() { state.holdSynthesis = false; for (const resume of [...state.waiters]) resume(); },
    status: () => ({ held: state.waiters.size }),
    close() { this.release(); delete globalThis[symbol]; globalThis.fetch = previousFetch; },
  };
}
