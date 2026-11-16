import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { allowedOwner, readObject, requestAuth } from '$lib/server/auth/index.js';

export const POST: RequestHandler = async event => {
  const input = await readObject(event);
  const fail = () => json({ ok: false, code: 'SIGN_IN_FAILED', message: 'Check your email and password, then try again.' }, { status: 401 });
  if (Object.keys(input).some(key => !['email', 'password'].includes(key)) || typeof input.email !== 'string' ||
      input.email.toLowerCase().trim() !== env.QUELLIGHT_OWNER_EMAIL?.toLowerCase() || typeof input.password !== 'string' ||
      input.password.length === 0 || input.password.length > 4096) return fail();
  const client = requestAuth(event);
  const { data, error } = await client.auth.signInWithPassword({ email: input.email.trim(), password: input.password });
  if (error || !data.user || !allowedOwner(data.user)) {
    if (data.session) await client.auth.signOut({ scope: 'local' });
    return fail();
  }
  return json({ ok: true });
};
