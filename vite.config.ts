import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  // The indexed store stays external: at runtime it resolves its installed
  // @victframework/runtime siblings and reads its own provenance.json from
  // node_modules, and the deployment tracer must see it as a dependency.
  ssr: { noExternal: [/^@victframework\/(?!store-postgres)/] },
  optimizeDeps: { exclude: ['@victframework/ui-svelte', '@victframework/ui-ai-svelte'] }
});
