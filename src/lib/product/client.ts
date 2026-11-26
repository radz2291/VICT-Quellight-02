export interface Room {
  id: string; name: string; purpose: string; archivedAt: string | null;
  revision: number; createdAt: string; updatedAt: string;
}
export interface Conversation {
  id: string; roomId: string; threadId: string; title: string;
  archivedAt: string | null; revision: number; createdAt: string; updatedAt: string;
}
export interface Message { id: string; role: 'user' | 'assistant'; text: string; createdAt: string; requestKey?: string }
export interface Turn { id: string; status: string; streamId?: string; errorCode?: string; projectionSettled?: boolean }
export interface Bootstrap { user: { id: string; email: string }; rooms: Room[]; conversations: Pick<Conversation, 'id' | 'roomId' | 'title'>[] }
export interface Detail {
  conversation: Conversation;
  messages: Message[];
  activeTurn: Turn | null;
  activeUserMessage?: Message;
  lastTurn?: Turn | null;
  olderCursor?: string | null;
}
export interface AcceptedTurn { turnId: string; conversationId: string; status: string; userMessage: Message }
export interface PendingSend { key: string; text: string; createdAt: string }
export interface Observation {
  events: { sequence: number; kind: string; delta?: string }[];
  nextCursor: number;
  turn: Turn;
  assistantMessage?: Message | null;
  nextActiveTurn?: Turn | null;
  nextUserMessage?: Message | null;
}
export const terminal = (status: string) => ['completed', 'failed', 'cancelled', 'blocked'].includes(status);

export class RequestError extends Error {
  constructor(message: string, readonly code: string, readonly uncertain = false, readonly status = 0) { super(message); }
}

export async function request<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin', signal, cache: 'no-store',
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RequestError('The connection was interrupted. Your draft is kept here. Reconnect to check the latest state.', 'CONNECTION_INTERRUPTED', true);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok === false) {
    throw new RequestError(result?.message || (response.status === 401 ? 'Please sign in again.' : 'This request could not be completed. Please try again.'),
      result?.code || `HTTP_${response.status}`, response.status >= 500, response.status);
  }
  return result as T;
}

// Device-local drafts contain only what the owner typed. They are scoped to
// the signed-in actor and conversation, never to a public shared browser key.
export function storageRead(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function storageWrite(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* In-memory editing still works when storage is unavailable. */ }
}
export const draftKey = (actorId: string, conversationId: string) => `quellight:${actorId}:draft:${conversationId}`;
export const pendingKey = (actorId: string, conversationId: string) => `quellight:${actorId}:pending:${conversationId}`;
export function readPendingSend(actorId: string, conversationId: string): PendingSend | null {
  try {
    const value = JSON.parse(storageRead(pendingKey(actorId, conversationId)) ?? 'null');
    if (!value || typeof value.text !== 'string' || typeof value.key !== 'string') return null;
    return { key: value.key, text: value.text, createdAt: value.createdAt ?? new Date().toISOString() };
  } catch { return null; }
}
export function clearActorStorage(actorId: string) {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(`quellight:${actorId}:`)) localStorage.removeItem(key);
  } catch { /* Logout must remain available without storage. */ }
}
export function delayObservation(signal: AbortSignal, milliseconds = 1200) {
  return new Promise<void>(resolve => {
    if (signal.aborted) { resolve(); return; }
    const stop = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); resolve(); };
    const timer = setTimeout(stop, milliseconds);
    signal.addEventListener('abort', stop, { once: true });
  });
}

// Use the applied ledger cursor on reconnect. An SSE frame can be lost after
// the server writes it, so only consuming a frame can move this cursor.
export async function followTurn(turnId: string, after: number, signal: AbortSignal, apply: (observation: Observation) => boolean) {
  const response = await fetch(`/api/turns/${turnId}/stream?after=${after}`, {
    signal, credentials: 'same-origin', cache: 'no-store', headers: { accept: 'text/event-stream' }
  });
  if (!response.ok) throw new RequestError('The response stream is unavailable.', `HTTP_${response.status}`, false, response.status);
  if (!response.body || !response.headers.get('content-type')?.startsWith('text/event-stream')) {
    await response.body?.cancel();
    throw new RequestError('The response stream is unavailable.', 'STREAM_UNAVAILABLE');
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) return false;
      buffer += value;
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index).split(/\r?\n/);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const type = frame.find(line => line.startsWith('event:'))?.slice(6).trim() ?? 'message';
        if (type === 'access-revoked') throw new RequestError('Please sign in again.', 'SESSION_REVOKED', false, 401);
        const payload = frame.filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
        if (payload && ['message', 'observation'].includes(type) && apply(JSON.parse(payload) as Observation)) return true;
      }
    }
    return false;
  } finally { await reader.cancel().catch(() => {}); }
}
