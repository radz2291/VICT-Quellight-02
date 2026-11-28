import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';

export const fixtureOwner = 'c1000000-0000-4000-8000-000000000014';
export const fixtureSession = 'c1000000-0000-4000-8000-000000000015';
export const fixtureEmail = 'room-review@quellight.invalid';
export const fixturePassword = 'local-room-review';
const key = 'local-review-signature-only';

export async function startFixtureAuth(origin) {
  const address = new URL(origin);
  const now = new Date();
  const at = Math.floor(now.getTime() / 1000);
  const user = { id: fixtureOwner, email: fixtureEmail, aud: 'authenticated', role: 'authenticated',
    email_confirmed_at: now.toISOString(), confirmed_at: now.toISOString(), phone: '', created_at: now.toISOString(),
    updated_at: now.toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, is_anonymous: false };
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = [b64({ alg: 'HS256', typ: 'JWT' }), b64({ iss: origin + '/auth/v1', sub: fixtureOwner,
    aud: 'authenticated', role: 'authenticated', email: fixtureEmail, session_id: fixtureSession, iat: at, exp: at + 86_400 })].join('.');
  const token = payload + '.' + createHmac('sha256', key).update(payload).digest('base64url');
  const session = { access_token: token, refresh_token: 'local-q4-014-refresh', token_type: 'bearer',
    expires_in: 86_400, expires_at: at + 86_400, user };
  const server = createServer(async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    try {
      const path = new URL(req.url, origin);
      if (req.headers.host !== address.host) return send(403, { code: 'local_fixture_only' });
      if (req.method === 'POST' && path.pathname === '/auth/v1/token') {
        let body = '';
        for await (const part of req) { body += part; if (body.length > 4096) return send(413, { code: 'fixture_body_limit' }); }
        const input = JSON.parse(body);
        if (path.searchParams.get('grant_type') === 'password' && input.email === fixtureEmail && input.password === fixturePassword) {
          return send(200, session);
        }
        if (path.searchParams.get('grant_type') === 'refresh_token' && input.refresh_token === session.refresh_token) return send(200, session);
        return send(401, { code: 'invalid_credentials', message: 'Synthetic credentials did not match.' });
      }
      if (req.method === 'GET' && path.pathname === '/auth/v1/user' && req.headers.authorization === 'Bearer ' + token) return send(200, user);
      if (req.method === 'POST' && path.pathname === '/auth/v1/logout' && req.headers.authorization === 'Bearer ' + token) return send(200, {});
      return send(401, { code: 'invalid_session', message: 'Synthetic session did not match.' });
    } catch { return send(400, { code: 'fixture_bad_request' }); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(address.port), '127.0.0.1', resolve);
  });
  return { close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
