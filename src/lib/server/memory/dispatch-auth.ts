import { createHash, timingSafeEqual } from 'node:crypto';

const fingerprint = (value: string) => createHash('sha256').update(value).digest();
/** Machine wakeups carry no actor, prompt, job or destination chosen by the caller. */
export async function authorizeMemoryWake(request: Request, secret: string | undefined): Promise<boolean> {
  if (!secret || secret.length < 32 || request.method !== 'POST' || request.headers.has('origin')) return false;
  const supplied = request.headers.get('authorization');
  if (!supplied?.startsWith('Bearer ') || !timingSafeEqual(fingerprint(supplied.slice(7)), fingerprint(secret))) return false;
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return false;
  const reader = request.body?.getReader();
  if (!reader) return false;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return body === '{}';
      if (body.length + value.length > 2) { await reader.cancel(); return false; }
      body += new TextDecoder().decode(value);
    }
  } finally { reader.releaseLock(); }
}
