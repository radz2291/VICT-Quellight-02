import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// The bundled indexed store reads its own provenance.json beside the SSR chunk
// that inlines it (readFile(new URL('./provenance.json', import.meta.url))).
// Emit the installed package's provenance beside the chunks so the built
// server bundle can perform that self-verification.
const storeProvenance = () => ({
  name: 'quellight-store-provenance',
  apply: 'build' as const,
  generateBundle(_options: unknown, bundle: Record<string, { isEntry?: boolean; type?: string }>) {
    const serverEntry = Object.values(bundle).find(c => c.type !== 'asset' && (c as { isEntry?: boolean }).isEntry);
    if (!serverEntry) return;
    const require = createRequire(import.meta.url);
    const provenance = readFileSync(
      new URL('./provenance.json', pathToFileURL(require.resolve('@victframework/store-postgres'))),
      'utf8',
    );
    this.emitFile({ type: 'asset', fileName: 'chunks/provenance.json', source: provenance });
  },
});

export default defineConfig({
  plugins: [sveltekit(), storeProvenance()],
  ssr: { noExternal: [/^@victframework\//] },
  optimizeDeps: { exclude: ['@victframework/ui-svelte', '@victframework/ui-ai-svelte'] }
});
