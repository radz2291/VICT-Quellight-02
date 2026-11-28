import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testRoomComposition, readEvent } from '../q4-009/overlay.mjs';

export { readEvent };
export const bindingEvent = Symbol.for('quellight.q4-011.execution-binding');
const port = 'virtual:q4-011-voice';

function editOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'Unexpected pinned app seam');
  return source.replace(before, () => after);
}

function auditionOverlay(current, selected) {
  const edits = new Set();
  return {
    name: 'q4-011-fixture-voice-and-witness',
    enforce: 'pre',
    resolveId(id) { if (id === port) return '\0' + port; },
    load(id) {
      if (id !== '\0' + port) return;
      return 'const control=' + JSON.stringify(current) + ';\nconst voice=' + JSON.stringify(selected) + ';\n'
        + 'export function auditionVoice(role) {\n'
        + '  if (role.selection.mode !== "catalog" || !role.text.startsWith(control+"\\n")) throw new Error("Q4_011_VOICE_SEAM");\n'
        + '  return voice + role.text.slice(control.length);\n}';
    },
    transform(source, id) {
      const path = id.replaceAll('\\', '/');
      if (selected !== current && path.endsWith('/src/lib/server/conversation/activation.ts')) {
        const before = 'conversationInstructions: managed.effective.prompts.roles.conversation.text!,';
        const after = 'conversationInstructions: auditionVoice(managed.effective.prompts.roles.conversation),';
        edits.add('voice');
        return { code: "import { auditionVoice } from '" + port + "';\n" + editOnce(source, before, after), map: null };
      }
      if (path.endsWith('/src/lib/server/conversation/service.ts')) {
        const before = 'const grants = [QUELLIGHT_MEMORY_RECALL_PERMISSION, ...desk.permissions];';
        const witness = 'globalThis[Symbol.for("quellight.q4-011.execution-binding")]?.({ '
          + 'grants, capabilities: capabilities.map(c => ({ id:c.id, revision:c.revision, effect:c.effect, permissions:c.permissions })), '
          + 'quietWriteApprovals:desk.quietWriteApprovals, modelProfile:activation.profile.profile.modelProfile, '
          + 'generation:activation.profile.profile.generation, turnPolicy:activation.profile.profile.turnPolicy, '
          + 'memoryPolicy:activation.memoryPolicy.artifact.config });';
        edits.add('witness');
        return { code: editOnce(source, before, before + '\n      ' + witness), map: null };
      }
    },
    applied: () => [...edits].sort(),
  };
}

export async function openRuntime(app, privateDir, condition, current, selected) {
  const requireApp = createRequire(join(app, 'package.json'));
  const { createServer } = await import(pathToFileURL(requireApp.resolve('vite')).href);
  const room = testRoomComposition();
  const audition = auditionOverlay(current, selected);
  const vite = await createServer({ root: app, configFile: false, logLevel: 'error',
    cacheDir: join(privateDir, 'vite', condition), plugins: [room, audition],
    server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  return { load: name => vite.ssrLoadModule('/src/lib/server/' + name + '.ts'),
    edits: () => ({ room: room.applied(), audition: audition.applied() }), close: () => vite.close() };
}
