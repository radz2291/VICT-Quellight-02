import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSelectedPersona, selectedPersonaFiles } from '../src/lib/server/prompts/persona-source.mjs';

const [source] = process.argv.slice(2);
if (!source || process.argv.length !== 3) {
  console.error('Usage: node scripts/install-selected-persona.mjs ORIGINAL_PERSONA_DIRECTORY');
  process.exit(2);
}
const destination = resolve(fileURLToPath(new URL('../.private/persona', import.meta.url)));
const { contents } = loadSelectedPersona(resolve(source));
mkdirSync(destination, { recursive: true });
for (const file of selectedPersonaFiles) {
  const path = join(destination, file);
  const bytes = contents.get(file);
  if (!bytes) throw new Error('SELECTED_PERSONA_UNAVAILABLE');
  try {
    writeFileSync(path, bytes, { flag: 'wx' });
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST' || !bytes.equals(readFileSync(path))) {
      throw new Error('SELECTED_PERSONA_DESTINATION_CHANGED');
    }
  }
}
loadSelectedPersona(destination);
console.log('Verified the eight selected movements and the editorial guide.');
