import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { allowedOwner, readObject, requestAuth } from '$lib/server/auth/index.js';

export const POST: RequestHandler = async event => {
  const input = await readObject(event);
  const fail = () => json({ ok: false, code: 'SETUP_FAILED', message: 'The setup link could not be used. Check your password or request a fresh link.' }, { status: 400 });
  if (Object.keys(input).some(key => !['tokenHash', 'password', 'type'].includes(key)) ||
      typeof input.tokenHash !== 'string' || !/^[a-zA-Z0-9_-]{20,256}$/.test(input.tokenHash) ||
      !['invite', 'recovery'].includes(String(input.type)) || typeof input.password !== 'string' || input.password.length > 4096) return fail();
  const client = requestAuth(event);
  const { data, error: verificationError } = await client.auth.verifyOtp({ token_hash: input.tokenHash, type: input.type as 'invite' | 'recovery' });
  if (verificationError || !data.user || !allowedOwner(data.user)) {
    if (data.session) await client.auth.signOut({ scope: 'local' });
    return fail();
  }
  const { error: passwordError } = await client.auth.updateUser({ password: input.password });
  if (passwordError) {
    await client.auth.signOut({ scope: 'local' });
    return fail();
  }
  return json({ ok: true });
};
