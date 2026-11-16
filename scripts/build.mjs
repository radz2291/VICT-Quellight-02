import { spawnSync } from 'node:child_process';
import { readBuildTarget } from '../config/build.mjs';

if (process.argv.length > 3) throw new Error('Usage: node scripts/build.mjs [node|vercel]');
const env = { ...process.env };
if (process.argv[2] !== undefined) env.QUELLIGHT_BUILD_TARGET = process.argv[2];
const target = readBuildTarget(env);
env.QUELLIGHT_BUILD_TARGET = target;
console.log(`Building Quellight for ${target}.`);
for (const args of [['scripts/verify-baseline.mjs'], ['node_modules/vite/bin/vite.js', 'build']]) {
  const result = spawnSync(process.execPath, args, { cwd: new URL('../', import.meta.url), env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
