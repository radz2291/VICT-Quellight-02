import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { markerText } from './workload.mjs';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const jsonBytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');

function messageText(message) {
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content.map(part => typeof part?.text === 'string' ? part.text : JSON.stringify(part)).join('\n');
  }
  return JSON.stringify(message.content ?? null);
}

/** Call at the deterministic model boundary with the received options.prompt. */
export function summarizePrompt(prompt, { markers = markerText, includeMessages = false } = {}) {
  assert.ok(Array.isArray(prompt));
  const roomBlocks = [];
  const occurrences = Object.fromEntries(Object.entries(markers).map(([key, marker]) => {
    assert.equal(typeof marker, 'string');
    assert.ok(marker.length > 0);
    return [key, []];
  }));
  const messages = prompt.map((message, index) => {
    assert.equal(typeof message.role, 'string');
    const encoded = JSON.stringify(message);
    const text = messageText(message);
    for (const match of text.matchAll(/<approved-room-state revision="([^"]+)">[\s\S]+?<\/approved-room-state>/g)) {
      roomBlocks.push({ revision: match[1], index, role: message.role, byteOffsetInContent: Buffer.byteLength(text.slice(0, match.index), 'utf8'),
        bytes: Buffer.byteLength(match[0], 'utf8'), sha256: sha256(match[0]) });
    }
    for (const [key, marker] of Object.entries(markers)) {
      for (let offset = text.indexOf(marker); offset !== -1; offset = text.indexOf(marker, offset + marker.length)) {
        occurrences[key].push({ index, role: message.role, byteOffsetInContent: Buffer.byteLength(text.slice(0, offset), 'utf8') });
      }
    }
    return { role: message.role, sha256: sha256(encoded), bytes: Buffer.byteLength(encoded, 'utf8') };
  });
  const encodedPrompt = JSON.stringify(prompt);
  return { bytes: Buffer.byteLength(encodedPrompt, 'utf8'), sha256: sha256(encodedPrompt), messages, markers: occurrences,
    roomBlocks, roomBlockBytes: roomBlocks.reduce((sum, block) => sum + block.bytes, 0),
    ...(includeMessages ? { syntheticMessages: JSON.parse(encodedPrompt) } : {}) };
}

export function sharedPrefix(left, right) {
  let leadingMessages = 0;
  let leadingMessageBytes = 0;
  while (leadingMessages < Math.min(left.messages.length, right.messages.length)) {
    const first = left.messages[leadingMessages], second = right.messages[leadingMessages];
    if (first.sha256 !== second.sha256 || first.role !== second.role || first.bytes !== second.bytes) break;
    leadingMessageBytes += first.bytes;
    leadingMessages++;
  }
  let exactJsonPrefixBytes = null;
  if (left.syntheticMessages && right.syntheticMessages) {
    const first = Buffer.from(JSON.stringify(left.syntheticMessages), 'utf8');
    const second = Buffer.from(JSON.stringify(right.syntheticMessages), 'utf8');
    exactJsonPrefixBytes = 0;
    while (exactJsonPrefixBytes < Math.min(first.length, second.length) && first[exactJsonPrefixBytes] === second[exactJsonPrefixBytes]) {
      exactJsonPrefixBytes++;
    }
  }
  return { leadingMessages, leadingMessageBytes, exactJsonPrefixBytes };
}
