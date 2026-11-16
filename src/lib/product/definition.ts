import { compileApplication } from '@victframework/application';
import type { ApplicationDefinitionV3 } from '@victframework/sdk';
import type { UiDocument, UiExpression, UiNode, UiLocalStateDecl, UiStyleDeclaration } from '@victframework/ui';
import { catalogDescriptors, catalogImplementations } from '@victframework/ui-svelte';
import { rheaNativePatterns } from '@victframework/ui-svelte/rhea';
import { aiAuthoringDescriptors, aiAuthoringImplementations } from '@victframework/ui-ai-svelte/authoring';
import { productActions, productResources, productContracts } from './domain-contracts';
import { interfaceActions, interfaceResources, interfaceContracts } from './action-definitions';

export const descriptors = [...catalogDescriptors, ...aiAuthoringDescriptors];
export const implementations = [...catalogImplementations, ...aiAuthoringImplementations];
const literal = (value: string | number | boolean): UiExpression => ({ type: 'literal', value });
const ref = (path: string): UiExpression => ({ type: 'ref', path });
const style = (property: string, value: string): UiStyleDeclaration => ({ property, value: { type: 'text', value } });
const state = (key: string, initial: string | boolean): UiLocalStateDecl => ({ key, type: typeof initial as 'string' | 'boolean', initial });

function element(id: string, tag: string, children: string[], classes: string[] = []): Extract<UiNode, {kind: 'element'}> {
  return { kind: 'element', id, tag, children, classes };
}
function text(id: string, value: string, expression = false): UiNode {
  return { kind: 'text', id, content: expression ? { type: 'expression', expression: ref(value) } : { type: 'literal', value } };
}
function button(id: string, label: string, actionId: string, input?: Record<string, UiExpression>, secondary = false): Extract<UiNode, {kind: 'component'}> {
  return {
    kind: 'component', id, definitionId: 'vict.catalog.button', revision: '1',
    props: { label: literal(label), disabled: ref('view.pending') },
    outputs: { press: { invokeAction: { actionId, ...(input ? { input } : {}) } } },
    localStyle: secondary ? [style('background', 'transparent'), style('color', 'var(--vict-color-textMuted)'), style('border-color', 'var(--vict-color-border)')] : []
  };
}
function conditional(id: string, when: string, children: string[]): UiNode {
  return { kind: 'conditional', id, branches: [{ when, children }] };
}
function appearance(id: string): UiNode {
  return { kind: 'component', id, definitionId: 'vict.catalog.switch', revision: '1',
    props: { label: literal('Dark appearance'), checked: ref('state.dark') },
    outputs: { checkedChange: { setState: { key: 'dark' } } } };
}

// Public VICT field recipe, with its authored attributes and typed state binding.
function field(id: string, key: string, label: string, type = 'text', autocomplete = 'off') {
  const source = rheaNativePatterns.find(pattern => pattern.id === 'field')!.create(id);
  const nodes = Object.fromEntries(source.nodes.map(node => [node.id, node])) as Record<string, UiNode>;
  nodes[`${id}-label-text`] = text(`${id}-label-text`, label);
  const control = nodes[`${id}-control`] as Extract<UiNode, { kind: 'element' }>;
  nodes[`${id}-control`] = { ...control,
    attributes: { id: `${id}-control`, type, name: key, autocomplete, value: ref(`state.${key}`), disabled: ref('view.pending') },
    interactions: [{ on: 'change', action: 'setState', key, value: ref(`state.${key}`) }]
  };
  nodes[id] = element(id, 'div', [`${id}-label`, `${id}-control`], ['vict-rhea', 'vict-rhea-field']);
  delete nodes[`${id}-help`];
  delete nodes[`${id}-help-text`];
  return nodes;
}
function navigation(prefix: string): Record<string, UiNode> {
  const selectionStyle = (item: string): UiStyleDeclaration[] => [
    style('width', '100%'), style('justify-content', 'flex-start'), style('text-align', 'left'),
    style('border-color', 'transparent'), style('white-space', 'normal'), style('color', 'var(--vict-color-text)'),
    { property: 'background', value: { type: 'binding', expression: { type: 'conditionalValue',
      when: ref(`repeat.${item}.selected`), then: literal('var(--ql-selected)'), otherwise: literal('transparent') } } }
  ];
  return {
    [prefix]: element(prefix, 'div', [`${prefix}-heading`, `${prefix}-rooms`, `${prefix}-empty`, `${prefix}-new`, `${prefix}-recent-heading`, `${prefix}-conversations`, `${prefix}-archived`], ['ql-navigation']),
    [`${prefix}-heading`]: element(`${prefix}-heading`, 'h2', [`${prefix}-heading-text`], ['ql-section-label']),
    [`${prefix}-heading-text`]: text(`${prefix}-heading-text`, 'Your rooms'),
    [`${prefix}-rooms`]: { kind: 'repeat', id: `${prefix}-rooms`, collection: ref('view.rooms'), key: ref('repeat.room.id'), itemName: 'room', templateRoot: `${prefix}-room` },
    [`${prefix}-room`]: { ...button(`${prefix}-room`, '', 'ui.room.select', { id: ref('repeat.room.id') }), props: { label: ref('repeat.room.name') }, localStyle: selectionStyle('room') },
    [`${prefix}-empty`]: conditional(`${prefix}-empty`, 'emptyRooms', [`${prefix}-empty-label`]),
    [`${prefix}-empty-label`]: element(`${prefix}-empty-label`, 'p', [`${prefix}-empty-text`], ['ql-muted']),
    [`${prefix}-empty-text`]: text(`${prefix}-empty-text`, 'view.roomsEmptyText', true),
    [`${prefix}-new`]: button(`${prefix}-new`, 'New room', 'ui.room.new', undefined, true),
    [`${prefix}-recent-heading`]: element(`${prefix}-recent-heading`, 'h2', [`${prefix}-recent-text`], ['ql-section-label', 'ql-recent-label']),
    [`${prefix}-recent-text`]: text(`${prefix}-recent-text`, 'Conversations'),
    [`${prefix}-conversations`]: { kind: 'repeat', id: `${prefix}-conversations`, collection: ref('view.conversations'), key: ref('repeat.conversation.id'), itemName: 'conversation', templateRoot: `${prefix}-conversation` },
    [`${prefix}-conversation`]: { ...button(`${prefix}-conversation`, '', 'ui.conversation.select', { id: ref('repeat.conversation.id') }), props: { label: ref('repeat.conversation.title') }, localStyle: selectionStyle('conversation') },
    [`${prefix}-archived`]: { kind: 'component', id: `${prefix}-archived`, definitionId: 'vict.catalog.switch', revision: '1',
      props: { label: literal('Archived rooms'), checked: ref('state.showArchived') }, outputs: { checkedChange: { setState: { key: 'showArchived' } } } }
  };
}

const nodes: Record<string, UiNode> = {
  shell: element('shell', 'div', ['sidebar', 'workspace'], ['ql-shell']),
  sidebar: element('sidebar', 'aside', ['brand', 'navigation', 'sidebarFooter'], ['ql-sidebar']),
  brand: element('brand', 'div', ['brandName', 'brandNote'], ['ql-brand']),
  brandName: element('brandName', 'h1', ['brandText']),
  brandText: text('brandText', 'Quellight'),
  brandNote: element('brandNote', 'p', ['brandNoteText']),
  brandNoteText: text('brandNoteText', 'A little space for clarity.'),
  ...navigation('navigation'),
  ...navigation('mobileNavigation'),
  sidebarFooter: element('sidebarFooter', 'div', ['appearance', 'signout'], ['ql-sidebar-footer']),
  appearance: appearance('appearance'),
  signout: button('signout', 'Sign out', 'auth.sign-out', undefined, true),
  workspace: element('workspace', 'main', ['mobileBar', 'toolbar', 'error', 'loading', 'roomEditor', 'renameEditor', 'archiveEditor', 'mainContent'], ['ql-workspace']),
  mobileBar: element('mobileBar', 'div', ['mobileName', 'mobileMenu'], ['ql-mobile-bar']),
  mobileName: element('mobileName', 'strong', ['mobileNameText']),
  mobileNameText: text('mobileNameText', 'Quellight'),
  mobileMenu: { kind: 'component', id: 'mobileMenu', definitionId: 'vict.catalog.dialog', revision: '1',
    props: { title: literal('rooms'), open: ref('state.navigationOpen') }, outputs: { openChange: { setState: { key: 'navigationOpen' } } },
    slots: { body: { name: 'body', children: ['mobileNavigation', 'mobileAppearance', 'mobileSignout'] } } },
  mobileAppearance: appearance('mobileAppearance'),
  mobileSignout: button('mobileSignout', 'Sign out', 'auth.sign-out', undefined, true),
  toolbar: element('toolbar', 'header', ['roomIdentity', 'roomActions'], ['ql-toolbar']),
  roomIdentity: element('roomIdentity', 'div', ['roomName', 'roomPurpose'], ['ql-room-identity']),
  roomName: element('roomName', 'h2', ['roomNameText']),
  roomNameText: text('roomNameText', 'view.roomName', true),
  roomPurpose: element('roomPurpose', 'p', ['roomPurposeText']),
  roomPurposeText: text('roomPurposeText', 'view.roomPurpose', true),
  roomActions: conditional('roomActions', 'activeRoom', ['roomActionRow']),
  roomActionRow: element('roomActionRow', 'div', ['rename', 'newConversation'], ['ql-toolbar-actions']),
  rename: button('rename', 'Room details', 'ui.room.edit', undefined, true),
  newConversation: button('newConversation', 'New conversation', 'conversation.create', { roomId: ref('view.roomId') }),
  error: conditional('error', 'hasError', ['errorBox']),
  errorBox: { ...element('errorBox', 'div', ['errorText', 'reload'], ['ql-error']), attributes: { role: 'alert' } },
  errorText: text('errorText', 'view.error', true),
  reload: button('reload', 'Reconnect', 'ui.reload', undefined, true),
  loading: conditional('loading', 'loading', ['loadingText']),
  loadingText: { ...element('loadingText', 'p', ['loadingCopy'], ['ql-loading']), attributes: { role: 'status' } },
  loadingCopy: text('loadingCopy', 'Opening your space…'),
  mainContent: { kind: 'conditional', id: 'mainContent', branches: [{ when: 'hasConversation', children: ['conversation'] }, { when: 'ready', children: ['welcome'] }] },
  welcome: element('welcome', 'section', ['welcomeTitle', 'welcomeCopy', 'welcomeAction'], ['ql-welcome']),
  welcomeTitle: element('welcomeTitle', 'h2', ['welcomeTitleText']),
  welcomeTitleText: text('welcomeTitleText', 'What’s on your mind?'),
  welcomeCopy: element('welcomeCopy', 'p', ['welcomeCopyText']),
  welcomeCopyText: text('welcomeCopyText', 'Bring a question, an idea, or something you’d like to work through.'),
  welcomeAction: conditional('welcomeAction', 'activeRoom', ['welcomeNew']),
  welcomeNew: button('welcomeNew', 'Start a conversation', 'conversation.create', { roomId: ref('view.roomId') }),
  conversation: { kind: 'component', id: 'conversation', definitionId: 'vict.ai.transcript', revision: '1',
    classes: ['ql-transcript'],
    props: { data: ref('view.transcript'), title: ref('view.conversationTitle'), description: literal(''), busy: ref('view.busy'), emptyMessage: literal('Take your time. What would you like to explore?'), inputLabel: literal('Message') },
    slots: { composer: { name: 'composer', children: ['composer'] }, footer: { name: 'footer', children: ['conversationFooter'] } },
    partStyles: { surface: { localStyle: [style('background', 'transparent'), style('border', '0'), style('box-shadow', 'none'), style('border-radius', '0')] } } },
  composer: { kind: 'component', id: 'composer', definitionId: 'vict.ai.prompt-input', revision: '3',
    props: { value: ref('state.draft'), label: literal('Message'), placeholder: literal('Write a message…'), busy: ref('view.busy'), sendEnabled: ref('view.canSend'), stopEnabled: ref('view.canStop'), attachEnabled: literal(false) },
    outputs: { valueChange: { setState: { key: 'draft' } },
      send: { invokeAction: { actionId: 'conversation.send', input: { conversationId: ref('view.conversationId'), text: ref('$output') } } },
      stop: { invokeAction: { actionId: 'conversation.cancel', input: { turnId: ref('view.turnId') } } } } },
  conversationFooter: element('conversationFooter', 'div', ['status', 'export'], ['ql-conversation-footer']),
  status: { ...element('status', 'span', ['statusText']), attributes: { role: 'status', 'aria-live': 'polite' } },
  statusText: text('statusText', 'view.statusText', true),
  export: button('export', 'Export conversation', 'ui.export', undefined, true),
  roomEditor: conditional('roomEditor', 'newRoomOpen', ['newRoomForm']),
  newRoomForm: { ...element('newRoomForm', 'form', ['newRoomTitle', 'newRoomName', 'newRoomPurpose', 'newRoomHelp', 'roomButtons'], ['ql-editor', 'ql-form']),
    interactions: [{ on: 'submit', action: 'invokeAction', actionId: 'room.create', input: { name: ref('state.roomName'), purpose: ref('state.roomPurpose') } }] },
  newRoomTitle: element('newRoomTitle', 'h2', ['newRoomTitleText']),
  newRoomTitleText: text('newRoomTitleText', 'A room for what matters.'),
  ...field('newRoomName', 'roomName', 'Room name'),
  ...field('newRoomPurpose', 'roomPurpose', 'What is this room for?'),
  newRoomHelp: element('newRoomHelp', 'p', ['newRoomHelpText'], ['ql-muted']),
  newRoomHelpText: text('newRoomHelpText', 'A room keeps related conversations together. Its purpose is optional.'),
  roomButtons: element('roomButtons', 'div', ['createRoom', 'roomCancel'], ['ql-button-row']),
  createRoom: button('createRoom', 'Create room', 'room.create', { name: ref('state.roomName'), purpose: ref('state.roomPurpose') }),
  roomCancel: button('roomCancel', 'Cancel', 'ui.room.dismiss', undefined, true),
  renameEditor: conditional('renameEditor', 'renameOpen', ['renameForm']),
  renameForm: element('renameForm', 'section', ['editTitle', 'editName', 'renameButtons'], ['ql-editor', 'ql-form']),
  editTitle: element('editTitle', 'h2', ['editTitleText']),
  editTitleText: text('editTitleText', 'Room details'),
  ...field('editName', 'editedName', 'Room name'),
  renameButtons: element('renameButtons', 'div', ['renameSave', 'renameCancel', 'archiveOpen'], ['ql-button-row']),
  renameSave: button('renameSave', 'Save name', 'room.rename', { id: ref('view.roomId'), name: ref('state.editedName'), revision: ref('view.roomRevision') }),
  renameCancel: button('renameCancel', 'Cancel', 'ui.room.dismiss', undefined, true),
  archiveOpen: button('archiveOpen', 'Archive room', 'ui.archive.open', undefined, true),
  archiveEditor: conditional('archiveEditor', 'archiveOpen', ['archivePanel']),
  archivePanel: element('archivePanel', 'section', ['archiveHelp', 'archiveButtons'], ['ql-editor', 'ql-form']),
  archiveHelp: element('archiveHelp', 'p', ['archiveHelpText']),
  archiveHelpText: text('archiveHelpText', 'This room moves into Archived rooms. You can return there to read its conversations.'),
  archiveButtons: element('archiveButtons', 'div', ['archiveConfirm', 'archiveCancel'], ['ql-button-row']),
  archiveConfirm: button('archiveConfirm', 'Archive room', 'room.archive', { id: ref('view.roomId'), revision: ref('view.roomRevision') }),
  archiveCancel: button('archiveCancel', 'Keep room', 'ui.room.dismiss', undefined, true)
};

export const document: UiDocument = {
  schema: 'vict.ui-document@1', id: 'quellight.conversation', revision: '2', root: 'shell',
  nodes, componentDefinitions: {}, styleSources: {}, tokens: {}, assets: {},
  conditions: {
    ...Object.fromEntries(['hasError', 'loading', 'ready', 'hasConversation', 'activeRoom', 'emptyRooms'].map(id => [id, { id, kind: 'localState' as const, when: ref(`view.${id}`) }])),
    ...Object.fromEntries(['newRoomOpen', 'renameOpen', 'archiveOpen'].map(id => [id, { id, kind: 'localState' as const, when: ref(`state.${id}`) }]))
  },
  localState: Object.fromEntries([
    state('draft', ''), state('dark', false), state('showArchived', false), state('navigationOpen', false),
    state('newRoomOpen', false), state('roomName', ''), state('roomPurpose', ''),
    state('renameOpen', false), state('editedName', ''), state('archiveOpen', false)
  ].map(declaration => [declaration.key, declaration]))
};

export function authDocument(setup: boolean): UiDocument {
  const actionId = setup ? 'auth.setup' : 'auth.sign-in';
  const inputs: Record<string, UiExpression> = setup
    ? { password: ref('state.password'), confirmation: ref('state.confirmation') }
    : { email: ref('state.email'), password: ref('state.password') };
  return {
    schema: 'vict.ui-document@1', id: setup ? 'quellight.setup' : 'quellight.sign-in', revision: '1', root: 'authRoot',
    componentDefinitions: {}, styleSources: {}, tokens: {}, assets: {},
    localState: { email: state('email', ''), password: state('password', ''), confirmation: state('confirmation', '') },
    conditions: { hasError: { id: 'hasError', kind: 'localState', when: ref('view.hasError') } },
    nodes: {
      authRoot: element('authRoot', 'main', ['authBrand', 'authCard', 'authFoot'], ['ql-auth']),
      authBrand: element('authBrand', 'div', ['authBrandText'], ['ql-auth-brand']),
      authBrandText: text('authBrandText', 'Quellight'),
      authCard: element('authCard', 'section', ['authTitle', 'authDescription', 'authError', 'authForm'], ['ql-auth-card']),
      authTitle: element('authTitle', 'h1', ['authTitleText']),
      authTitleText: text('authTitleText', setup ? 'Make yourself at home.' : 'Welcome back.'),
      authDescription: element('authDescription', 'p', ['authDescriptionText'], ['ql-muted']),
      authDescriptionText: text('authDescriptionText', setup ? 'Set your password to open your private space.' : 'Sign in to pick up where you left off.'),
      authError: conditional('authError', 'hasError', ['authErrorBox']),
      authErrorBox: { ...element('authErrorBox', 'p', ['authErrorText'], ['ql-error']), attributes: { role: 'alert' } },
      authErrorText: text('authErrorText', 'view.error', true),
      authForm: { ...element('authForm', 'form', [...(setup ? [] : ['emailField']), 'passwordField', ...(setup ? ['confirmationField'] : []), 'authSubmit'], ['ql-form']),
        interactions: [{ on: 'submit', action: 'invokeAction', actionId, input: inputs }] },
      ...(setup ? {} : field('emailField', 'email', 'Email', 'email', 'username')),
      ...field('passwordField', 'password', setup ? 'Create a password' : 'Password', 'password', setup ? 'new-password' : 'current-password'),
      ...(setup ? field('confirmationField', 'confirmation', 'Repeat your password', 'password', 'new-password') : {}),
      authSubmit: button('authSubmit', setup ? 'Open Quellight' : 'Sign in', actionId, inputs),
      authFoot: element('authFoot', 'p', ['authFootText'], ['ql-auth-foot']),
      authFootText: text('authFootText', 'A quiet place to think, remember, and work together.')
    }
  };
}
export const signInDocument = authDocument(false);
export const setupDocument = authDocument(true);
const documents = [document, signInDocument, setupDocument];
const resources = [...productResources, ...interfaceResources];
export const application: ApplicationDefinitionV3 = {
  schema: 'vict.application@3', id: 'quellight', revision: '2', name: 'Quellight',
  compatibility: { applicationSchema: 'vict.application@3' },
  composition: { navigation: 'none', responsive: { navigationAt: 'small' } },
  routes: [{ id: 'conversation', path: '/', screenId: 'conversation' }, { id: 'sign-in', path: '/auth/sign-in', screenId: 'sign-in' }, { id: 'setup', path: '/auth/setup', screenId: 'setup' }],
  screens: documents.map((source, index) => ({ id: ['conversation', 'sign-in', 'setup'][index], title: 'Quellight', uiDocument: { documentId: source.id, revision: source.revision } })),
  actions: [...productActions, ...interfaceActions], resources: resources.map(resource => ({ resourceId: resource.id, revision: resource.revision })), views: [], forms: [], components: []
};
export const viewFields = {
  rooms: 'array', 'rooms.id': 'string', 'rooms.name': 'string', 'rooms.selected': 'boolean',
  conversations: 'array', 'conversations.id': 'string', 'conversations.title': 'string', 'conversations.selected': 'boolean',
  transcript: 'string', roomId: 'string', roomName: 'string', roomPurpose: 'string', roomRevision: 'number',
  conversationId: 'string', conversationTitle: 'string', turnId: 'string', busy: 'boolean', canSend: 'boolean', canStop: 'boolean',
  pending: 'boolean', error: 'string', statusText: 'string', roomsEmptyText: 'string',
  hasError: 'boolean', loading: 'boolean', ready: 'boolean', hasConversation: 'boolean', activeRoom: 'boolean', emptyRooms: 'boolean'
} as const;
export const view = {
  rooms: [], conversations: [], transcript: JSON.stringify({ version: 1, messages: [] }),
  roomId: '', roomName: 'Your space', roomPurpose: '', roomRevision: 1,
  conversationId: '', conversationTitle: '', turnId: '', busy: false, canSend: false, canStop: false,
  pending: false, error: '', statusText: '', roomsEmptyText: 'Create a room to begin.',
  hasError: false, loading: true, ready: false, hasConversation: false, activeRoom: false, emptyRooms: true
};
export function compile(candidate: UiDocument = document) {
  return compileApplication({ application, resources,
    contracts: [...productContracts.map(({ id, revision, presentationFields }) => ({ id, revision, presentationFields })), ...interfaceContracts],
    uiDocuments: documents.map(source => ({ document: source.id === candidate.id ? candidate : source })),
    uiExtensions: descriptors, uiViewFields: viewFields });
}
export function requireRenderPlan(candidate: UiDocument = document) {
  const compiled = compile(candidate);
  if (!compiled.ok) throw new Error(`Quellight application compilation failed: ${compiled.issues.map(issue => `${issue.code} ${issue.path}`).join(', ')}`);
  if (compiled.plan.uiDiagnostics?.length) throw new Error(`Quellight UI is not ready: ${compiled.plan.uiDiagnostics.map(issue => `${issue.code} ${issue.message}`).join(', ')}`);
  const plan = compiled.plan.documentPlans?.[`${candidate.id}@${candidate.revision}`];
  if (!plan) throw new Error('Quellight render plan is missing.');
  return plan;
}
