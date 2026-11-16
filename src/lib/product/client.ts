export interface Room {
  id: string; name: string; purpose: string; archivedAt: string | null;
  revision: number; createdAt: string; updatedAt: string;
}
export interface Conversation {
  id: string; roomId: string; threadId: string; title: string;
  archivedAt: string | null; revision: number; createdAt: string; updatedAt: string;
}
export interface Message { id: string; role: 'user' | 'assistant'; text: string; createdAt: string }
export interface Turn { id: string; status: string; streamId?: string; errorCode?: string; projectionSettled?: boolean }
export interface Bootstrap { user: { id: string; email: string }; rooms: Room[]; conversations: Conversation[] }
export interface Detail { conversation: Conversation; messages: Message[]; activeTurn: Turn | null; lastTurn?: Turn | null }
export interface Observation { events: { sequence: number; kind: string; delta?: string }[]; nextCursor: number; turn: Turn }
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
export function clearActorStorage(actorId: string) {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(`quellight:${actorId}:`)) localStorage.removeItem(key);
  } catch { /* Logout must remain available without storage. */ }
}
export function delayObservation(signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const stop = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, 1200);
    signal.addEventListener('abort', stop, { once: true });
  });
}
