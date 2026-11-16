/** @param {Record<string, string | undefined>} env */
export function readBuildTarget(env) {
  const target = env.QUELLIGHT_BUILD_TARGET ?? (env.VERCEL === '1' ? 'vercel' : 'node');
  if (target !== 'node' && target !== 'vercel') throw new Error('QUELLIGHT_BUILD_TARGET must be node or vercel.');
  if (env.VERCEL === '1' && target !== 'vercel') throw new Error('Vercel requires the vercel build target.');
  return target;
}
