import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  ssr: { noExternal: [/^@victframework\//] },
  optimizeDeps: { exclude: ['@victframework/ui-svelte', '@victframework/ui-ai-svelte'] }
});
