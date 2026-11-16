import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';
import { openProductDatabase } from '../db/index.js';
import type { Owner } from '../domain/queries.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createRequestAuth(event: RequestEvent): SupabaseClient | undefined {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.QUELLIGHT_OWNER_SUBJECT || !env.QUELLIGHT_OWNER_EMAIL) return;
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: { path: '/', httpOnly: true, secure: event.url.protocol === 'https:', sameSite: 'lax' },
    cookies: {
      getAll: () => event.cookies.getAll(),
      setAll: cookies => cookies.forEach(({ name, value, options }) => {
        event.cookies.set(name, value, { ...options, path: '/', httpOnly: true,
          secure: event.url.protocol === 'https:', sameSite: 'lax' });
      })
    }
  });
}
export function allowedOwner(user: User): boolean {
  return uuid.test(env.QUELLIGHT_OWNER_SUBJECT ?? '') && user.id === env.QUELLIGHT_OWNER_SUBJECT &&
    user.email?.toLowerCase() === env.QUELLIGHT_OWNER_EMAIL?.toLowerCase() && Boolean(user.email_confirmed_at) && !user.is_anonymous;
}
export function requestAuth(event: RequestEvent) {
  if (!event.locals.supabase) throw error(503, 'Sign-in is being configured.');
  return event.locals.supabase;
}
export async function loadOwner(event: RequestEvent): Promise<Owner | null> {
  const supabase = event.locals.supabase;
  if (!supabase) return null;
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user || !allowedOwner(data.user)) return null;
  // The user endpoint verifies the token. Decode only to correlate its session
  // with the authoritative session record, which disappears on revocation.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  let claims: { sub?: string; session_id?: string };
  try { claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString('utf8')); }
  catch { return null; }
  if (claims.sub !== data.user.id || !uuid.test(claims.session_id ?? '')) return null;
  const stores = await openProductDatabase();
  try {
    const active = await stores.coordination.pool.query<{ active: boolean }>(
      'SELECT quellight_product_v1.owner_session_active($1::uuid,$2::uuid) AS active', [data.user.id, claims.session_id]);
    if (active.rows[0]?.active !== true) return null;
    return { id: data.user.id, actorId: data.user.id, email: data.user.email! };
  } finally { await stores.close(); }
}
export async function requireOwner(event: RequestEvent): Promise<Owner> {
  event.locals.ownerPromise ??= loadOwner(event);
  const owner = await event.locals.ownerPromise;
  if (!owner) throw error(401, 'Sign in to continue.');
  return owner;
}
export function requireSameOrigin(event: RequestEvent) {
  if (event.request.headers.get('origin') !== event.url.origin || event.request.headers.get('sec-fetch-site') === 'cross-site') {
    throw error(403, 'This request could not be verified.');
  }
}
export async function readObject(event: RequestEvent): Promise<Record<string, unknown>> {
  requireSameOrigin(event);
  if (!event.request.headers.get('content-type')?.startsWith('application/json')) throw error(415, 'Expected JSON.');
  const text = await event.request.text();
  if (text.length > 65536) throw error(413, 'The request is too large.');
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw error(400, 'Check the supplied values.'); }
}
