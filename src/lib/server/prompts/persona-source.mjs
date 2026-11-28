import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import selection from './persona-selection.json' with { type: 'json' };

export const selectedPersonaFiles = [...selection.movements, selection.editorialGuide].map(({ file }) => file);
const sha = /** @param {string | Buffer} bytes */ bytes => createHash('sha256').update(bytes).digest('hex');

/** Load the nine exact private source files. Editorial prefaces remain editable
 * through a separately reviewed selection revision.
 * @param {string} directory
 */
export function loadSelectedPersona(directory) {
  const contents = new Map();
  try {
    for (const source of [...selection.movements, selection.editorialGuide]) {
      const raw = readFileSync(join(directory, source.file));
      if (sha(raw) !== source.sha256) throw new Error('SELECTED_PERSONA_SOURCE_CHANGED');
      contents.set(source.file, raw);
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'SELECTED_PERSONA_SOURCE_CHANGED') throw error;
    throw new Error('SELECTED_PERSONA_UNAVAILABLE');
  }
  const text = selection.movements.map(({ file }) => {
    const raw = /** @type {Buffer} */ (contents.get(file)).toString('utf8');
    const lines = raw.split('\n');
    const delimiter = lines.findIndex(line => line.trim() === '---');
    return (delimiter === -1 ? raw : lines.slice(delimiter + 1).join('\n')).trim();
  }).join('\n\n');
  if (Buffer.byteLength(text) !== selection.assembly.bytes || sha(text) !== selection.assembly.sha256) {
    throw new Error('SELECTED_PERSONA_ASSEMBLY_CHANGED');
  }
  return { contents, text };
}

const cached = new Map();
/** @returns {string} */
export function selectedConversationIdentity() {
  const dir = resolve(process.env.QUELLIGHT_PERSONA_DIR || '.private/persona');
  const existing = cached.get(dir);
  if (existing) return existing;
  const selected = loadSelectedPersona(dir).text;
  cached.set(dir, selected);
  return selected;
}
