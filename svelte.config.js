import nodeAdapter from '@sveltejs/adapter-node';
import vercelAdapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { readBuildTarget } from './config/build.mjs';

const target = readBuildTarget(process.env);

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: target === 'vercel'
      ? vercelAdapter({ runtime: 'nodejs22.x', regions: ['sin1'], maxDuration: 30 })
      : nodeAdapter({ out: 'build' }),
    csrf: { trustedOrigins: [] }
  }
};
