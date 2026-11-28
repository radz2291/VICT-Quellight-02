import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [baseline, candidate, originalTrace] = process.argv.slice(2);
assert.ok(baseline && candidate && originalTrace, 'Pass the old and candidate app roots and the Q4-001 model-bound trace.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const appSha = '14b6ccaf6f409eac3e041dc3d9abd0bb9f875344';
const adapterSha = 'ac42868333aacdf53a6587a75ed121560589b43bbd092dc4a6fb821756844ac7';

async function installed(directory, mastraArchive) {
  const root = resolve(directory);
  assert.equal(execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), appSha);
  const pin = JSON.parse(readFileSync(join(root, 'baseline.json'), 'utf8')).artifacts.find(entry => entry.name === '@victframework/mastra');
  assert.equal(pin.sha256, mastraArchive);
  assert.equal(hash(readFileSync(join(root, pin.file))), mastraArchive);
  const parent = pathToFileURL(join(root, 'package.json')).href;
  const adapterEntry = import.meta.resolve('@victframework/mastra', parent);
  const rawAgentEntry = import.meta.resolve('@mastra/core/agent', adapterEntry);
  const { MastraProductAgent, MastraMemoryService } = await import(adapterEntry);
  const { Agent } = await import(rawAgentEntry);
  const bytes = readFileSync(new URL('./adapter.js', adapterEntry));
  const native = readFileSync(new URL('./native-memory.js', adapterEntry), 'utf8');
  const configStart = native.indexOf('function captureConfig(');
  const configEnd = native.indexOf('function safeModelFailure(');
  assert.ok(configStart >= 0 && configEnd > configStart);
  assert.equal(hash(bytes), adapterSha);
  assert.equal(typeof Agent.prototype.sendStateSignal, 'function');
  assert.equal(typeof MastraProductAgent.prototype.sendStateSignal, 'undefined');
  assert.equal(typeof MastraMemoryService.prototype.sendStateSignal, 'undefined');
  assert.equal(typeof MastraMemoryService.prototype.bindContext, 'function');
  assert.equal((native.match(/useStateSignals: false,/g) ?? []).length, 2);
  return { mastraArchive, adapterSha256: hash(bytes), nativeConfigValidationSha256: hash(native.slice(configStart, configEnd)),
    rawAgentSendStateSignal: true, victSendStateSignal: false, victWorkingMemoryStateSignals: false, victManagedContext: true };
}
const old = await installed(baseline, '90b2de7c6515785e23b4e6370c92be019959ffca430a7980f6752d5d104c9b2c');
const current = await installed(candidate, '9f75998297af4755bfa1abe567f198c7b0731dd304fca1c6c06163f480e03184');
assert.equal(old.nativeConfigValidationSha256, current.nativeConfigValidationSha256);

const traceBytes = readFileSync(originalTrace);
const trace = JSON.parse(traceBytes);
assert.equal(trace.app, appSha);
assert.equal(trace.passed, true);
const longCalls = trace.calls.filter(call => call.role === 'foreground' && /^continuous-\d+$/.test(call.turn));
const firstInstructions = new Set(longCalls.map(call => call.messageDigests[0]));
assert.equal(firstInstructions.size, 1, 'All repeated baseline long SDK calls reused first-message bytes.');
const examples = ['cold', 'warm-correction', 'idle-desk-revision', 'personal-correction', 'continuous-001', 'continuous-050', 'continuous-100']
  .map(turn => {
    const call = trace.calls.find(entry => entry.role === 'foreground' && entry.turn === turn && entry.syntheticPrompt);
    assert.ok(call, turn);
    const { syntheticPrompt } = call;
    const contents = message => typeof message.content === 'string' ? message.content : message.content.map(part => part.text ?? '').join('\n');
    assert.equal(syntheticPrompt[0].role, 'system');
    assert.equal(syntheticPrompt[1].role, 'system');
    assert.equal(syntheticPrompt.at(-1).role, 'user');
    assert.ok(contents(syntheticPrompt[0]).startsWith('You are Quellight'));
    assert.match(contents(syntheticPrompt[1]), /WORKING_MEMORY_SYSTEM_INSTRUCTION|The following observations block/);
    return { turn, roles: call.roles, promptJsonBytes: call.promptJsonBytes,
      activationInstructionsJsonBytes: Buffer.byteLength(JSON.stringify(syntheticPrompt[0])),
      nativeSystemJsonBytes: Buffer.byteLength(JSON.stringify(syntheticPrompt[1])), selectedObservation: call.markers.selectedObservation };
  });
console.log(JSON.stringify({ schema: 'quellight.q4-009.context-source-witness@1', appSha,
  scope: 'installed API introspection and prior Q4-001 synthetic SDK captures, no database or provider invocation',
  old, current, q4_001TraceSha256: hash(traceBytes), baselineLongForegroundSdkCalls: longCalls.length,
  baselineDistinctFirstInstructions: firstInstructions.size, examples }, null, 2));
