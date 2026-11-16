import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

let server;
let product;
before(async () => {
  server = await createServer({
    configFile: false, logLevel: 'error',
    plugins: [svelte({ configFile: false, compilerOptions: { dev: false } })],
    server: { middlewareMode: true }, appType: 'custom',
    ssr: { noExternal: [/^@victframework\//] },
    optimizeDeps: { noDiscovery: true }
  });
  product = await server.ssrLoadModule('/src/lib/product/definition.ts');
});
after(async () => { await server?.close(); });

test('canonical application has a diagnostic-free installed render plan', () => {
  const plan = product.requireRenderPlan();
  assert.equal(plan.documentId, 'quellight.conversation');
  assert.equal(product.application.schema, 'vict.application@3');
});

test('conversation declares real operations without inventing transcript content', () => {
  assert.deepEqual(JSON.parse(product.view.transcript), { version: 1, messages: [] });
  const composer = product.document.nodes.composer;
  assert.equal(composer.revision, '3');
  assert.equal(composer.props.sendEnabled.path, 'view.canSend');
  assert.equal(composer.outputs.send.invokeAction.actionId, 'conversation.send');
  assert.equal(composer.outputs.stop.invokeAction.actionId, 'conversation.cancel');
  assert.ok(product.application.actions.some(action => action.id === 'room.create' && action.kind === 'mutation'));
});

test('unknown component revisions cannot pass the product readiness gate', () => {
  const candidate = structuredClone(product.document);
  candidate.nodes.composer.revision = 'missing';
  assert.throws(() => product.requireRenderPlan(candidate), /UI is not ready|compilation failed/);
});

test('an undeclared send action cannot be silently introduced', () => {
  const candidate = structuredClone(product.document);
  candidate.nodes.composer.outputs.send = { invokeAction: { actionId: 'invented.send', input: { text: { type: 'ref', path: '$output' } } } };
  assert.throws(() => product.requireRenderPlan(candidate), /UI is not ready|compilation failed/);
});

test('appearance remains presentation state and cannot enable memory or execution', () => {
  assert.equal(product.document.localState.dark.type, 'boolean');
  assert.equal(product.document.nodes['desktopSettings-appearance'].definitionId, 'vict.catalog.switch');
  assert.equal(product.document.localState.draft.type, 'string');
  assert.equal(product.document.localState.memory, undefined);
  assert.equal(product.document.localState.permissions, undefined);
});

test('sign-in and setup use compiled public VICT field recipes with password semantics', () => {
  for (const source of [product.signInDocument, product.setupDocument]) {
    assert.equal(product.requireRenderPlan(source).documentId, source.id);
    const password = source.nodes['passwordField-control'];
    assert.equal(password.tag, 'input');
    assert.equal(password.attributes.type, 'password');
    assert.ok(password.classes.includes('vict-rhea-input'));
    assert.equal(source.nodes.authSubmit.definitionId, 'vict.catalog.button');
  }
  assert.equal(product.signInDocument.nodes['emailField-control'].attributes.autocomplete, 'username');
  assert.equal(product.setupDocument.nodes['passwordField-control'].attributes.autocomplete, 'new-password');
});
