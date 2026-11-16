import { isIP } from 'node:net';
/** @typedef {Record<string, string | undefined>} Environment */

/** Validates deployment intent without claiming unavailable runtime capabilities.
 * @param {Environment} env
 */
export function readRuntimeConfig(env) {
  const mode = env.QUELLIGHT_MODE ?? 'foundation';
  if (!['foundation', 'personal'].includes(mode)) throw new Error('QUELLIGHT_MODE must be foundation or personal.');
  const deployment = env.QUELLIGHT_DEPLOYMENT ?? (env.VERCEL === '1' ? 'hosted' : 'local');
  if (deployment !== 'local' && deployment !== 'hosted') throw new Error('QUELLIGHT_DEPLOYMENT must be local or hosted.');
  if (env.VERCEL === '1' && deployment !== 'hosted') throw new Error('Vercel requires hosted deployment configuration.');
  const portText = env.PORT ?? '4317';
  if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const vercelOrigin = env.VERCEL === '1' && env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined;
  const originText = env.ORIGIN ?? (deployment === 'hosted' ? vercelOrigin ?? env.RENDER_EXTERNAL_URL : undefined);
  let origin;
  if (originText) {
    let url;
    try { url = new URL(originText); } catch { throw new Error('ORIGIN must be a valid absolute origin.'); }
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('ORIGIN must contain only scheme and host.');
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const ipLiteral = isIP(hostname.replace(/^\[|\]$/g, '')) !== 0;
    const localName = /(^|\.)(localhost|local|localdomain|internal|lan|home)$/.test(hostname);
    if (deployment === 'hosted' && (url.protocol !== 'https:' || !hostname.includes('.') || ipLiteral || localName)) throw new Error('Hosted ORIGIN must use an HTTPS hostname without IP literals or local names.');
    if (deployment === 'local' && !['http:', 'https:'].includes(url.protocol)) throw new Error('Local ORIGIN must use HTTP or HTTPS.');
    origin = url.origin;
  }
  if (deployment === 'hosted' && !origin) throw new Error('Hosted deployment requires ORIGIN or a trusted host origin (VERCEL_URL / RENDER_EXTERNAL_URL).');
  const personal = mode === 'personal';
  if (personal) {
    for (const key of ['QUELLIGHT_DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY',
      'QUELLIGHT_OWNER_SUBJECT', 'QUELLIGHT_OWNER_EMAIL', 'ZHIPU_API_KEY']) {
      if (!env[key]?.trim()) throw new Error(`Personal mode requires ${key}.`);
    }
    if (deployment === 'hosted' && !env.QUELLIGHT_DATABASE_CA?.trim()) throw new Error('Personal hosted mode requires QUELLIGHT_DATABASE_CA.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.QUELLIGHT_OWNER_SUBJECT ?? '')) {
      throw new Error('QUELLIGHT_OWNER_SUBJECT must be a verified account UUID.');
    }
  }
  return Object.freeze({ mode, deployment, origin, host: env.HOST ?? (deployment === 'hosted' ? '0.0.0.0' : '127.0.0.1'), port: Number(portText), persistentStorage: personal, agentExecution: personal, ownerAuthentication: personal });
}

export function readiness() {
  return { status: 'unavailable', mode: 'foundation', reason: 'FOUNDATION_ONLY', capabilities: { hostedStorage: false, agentExecution: false, ownerAuthentication: false } };
}
