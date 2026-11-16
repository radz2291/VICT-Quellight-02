import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requestAuth, requireSameOrigin } from '$lib/server/auth/index.js';

export const POST: RequestHandler = async event => {
  requireSameOrigin(event);
  const { error } = await requestAuth(event).auth.signOut({ scope: 'local' });
  if (error) return json({ ok: false, code: 'SIGN_OUT_FAILED', message: 'Sign-out could not finish. Please try again.' }, { status: 503 });
  return json({ ok: true });
};
