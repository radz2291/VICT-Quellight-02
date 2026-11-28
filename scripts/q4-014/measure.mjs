import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const [candidateFile, controlFile, output, candidateTrace, controlTrace] = process.argv.slice(2);
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function wire(path) {
  const rows = (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const provider = rows.filter(row => row.kind === 'wire-input');
  const byRole = {};
  const paidUsage = {};
  for (const call of rows.filter(row => row.kind === 'sdk-input')) {
    byRole[call.role] = (byRole[call.role] ?? 0) + 1;
  }
  const usage = new Map();
  for (const row of rows.filter(row => row.kind === 'wire-usage')) usage.set(row.wire,row.usage);
  for (const counts of usage.values()) for (const key of ['prompt_tokens','completion_tokens','total_tokens']) {
    if (typeof counts[key] === 'number') paidUsage[key] = (paidUsage[key] ?? 0) + counts[key];
  }
  return { sdkRequestsByRole:byRole, wireRequests:provider.length, wireWithUsage:usage.size,
    statuses: rows.filter(row=>row.kind==='wire-status').map(row=>row.status), usage:paidUsage };
}

const candidate = await json(candidateFile);
const control = await json(controlFile);
assert.equal(candidate.guidance,'on');
assert.equal(control.guidance,'off');
assert.equal(candidate.mode,control.mode);
assert.ok(candidate.checks?.passed && control.checks?.passed);
const cases = {};
for (const name of ['mira','solo']) {
  const c = candidate.results[name], b = control.results[name];
  assert.ok(c.block && !b.block && c.roomRevision && b.roomRevision===null);
  const sdkEqual = c.nonRoomSdkInputSha256 === b.nonRoomSdkInputSha256;
  const wireEqual = !!c.wire && !!b.wire && c.wire.nonRoomInputSha256 === b.wire.nonRoomInputSha256;
  const delta = c.promptBytes - b.promptBytes;
  assert.ok(c.lookupRowBytes <= 512 && b.lookupRowBytes === 2);
  cases[name] = { equivalentNonRoomSdk: sdkEqual, equivalentNonRoomWire: wireEqual,
    candidateRoomRevision: c.roomRevision, candidateBlockBytes:Buffer.byteLength(c.block), candidateLookupRowBytes:c.lookupRowBytes,
    absentLookupRowBytes:b.lookupRowBytes, draftLookupCeiling:512, historicalLookupBytes:544,
    sdkPromptBytes:{ candidate:c.promptBytes, control:b.promptBytes, delta },
    firstWireBytes:c.wire && b.wire ? {candidate:c.wire.bytes,control:b.wire.bytes,delta:c.wire.bytes-b.wire.bytes}:null,
    firstWireUsage:{candidate:c.wire?.usage??null,control:b.wire?.usage??null},
    replies:{candidate:c.reply,control:b.reply} };
}
const result = { mode:candidate.mode, cases, candidateProcess:candidateTrace?await wire(candidateTrace):null,
  controlProcess:controlTrace?await wire(controlTrace):null };
await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({ cases:Object.fromEntries(Object.entries(cases).map(([k,v])=>[k,{sdk:v.equivalentNonRoomSdk,wire:v.equivalentNonRoomWire,
  lookup:v.candidateLookupRowBytes,delta:v.sdkPromptBytes.delta}])) }));
