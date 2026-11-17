import { compileApplication } from '@victframework/application';
import type { ApplicationDefinitionV3 } from '@victframework/sdk';
import type { UiDocument, UiExpression, UiNode, UiLocalStateDecl, UiStyleDeclaration } from '@victframework/ui';
import { catalogDescriptors, catalogImplementations } from '@victframework/ui-svelte';
import { rheaNativePatterns } from '@victframework/ui-svelte/rhea';
import { aiAuthoringDescriptors, aiAuthoringImplementations } from '@victframework/ui-ai-svelte/authoring';
import { patternAuthoringDescriptors, patternAuthoringImplementations } from '@victframework/ui-patterns-svelte/authoring';
import { mediaAuthoringDescriptors, mediaAuthoringImplementations } from '@victframework/ui-media-svelte/authoring';
import { productActions, productResources, productContracts } from './domain-contracts';
import { interfaceActions, interfaceResources, interfaceContracts } from './action-definitions';
import { memoryNodes, memoryLocalState, memoryConditions, memoryViewFields, memoryInitialView } from './memory-ui';
import { memorySettingsActions, memorySettingsContracts, memorySettingsResource, memoryCareActions, memoryCareContracts, memoryCareResource } from './memory-contracts';

export const descriptors = [...catalogDescriptors, ...aiAuthoringDescriptors, ...patternAuthoringDescriptors, ...mediaAuthoringDescriptors];
export const implementations = [...catalogImplementations, ...aiAuthoringImplementations, ...patternAuthoringImplementations, ...mediaAuthoringImplementations];
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
function settingsSwitch(id: string, label: string, key: string): UiNode {
  return { kind: 'component', id, definitionId: 'vict.catalog.switch', revision: '1',
    props: { label: literal(label), checked: ref(`state.${key}`) },
    outputs: { checkedChange: { setState: { key } } } };
}
function icon(id: string, name: string): UiNode {
  return { kind: 'component', id, definitionId: 'vict.media.icon', revision: '1',
    props: { pack: literal('lucide'), name: literal(name), revision: literal('1.27.0'), size: literal(18), strokeWidth: literal(1.65), decorative: literal(true) } };
}
const quietControl = [style('background', 'transparent'), style('color', 'var(--vict-color-textMuted)'), style('border-color', 'transparent'), style('box-shadow', 'none')];
const iconControl = [...quietControl, style('padding', '0'), style('width', '44px'), style('height', '44px'), style('border-radius', '8px')];
const composerAction = [style('width', '40px'), style('height', '40px'), style('min-width', '40px'), style('min-height', '40px'), style('padding', '6px'), style('background-clip', 'content-box')];
const drawerParts = {
  trigger: { localStyle: iconControl },
  panel: { localStyle: [style('background', 'var(--vict-color-surface)'), style('color', 'var(--vict-color-text)'), style('border-radius', '0')] },
  header: { localStyle: [style('padding', '8px 12px 8px 20px'), style('min-height', '56px')] },
  body: { localStyle: [style('padding', '24px 20px')] },
  footer: { localStyle: [style('padding', '12px 20px')] }
};
const signOutVector = JSON.stringify({
  schema: 'vict.vector@1', viewBox: '0 0 24 24',
  nodes: [{ tag: 'path', attributes: {
    d: 'M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M9 12h11m-4-4 4 4-4 4',
    fill: 'none', stroke: 'currentColor', 'stroke-width': 1.65, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  } }]
});

function settingsDisclosure(id: string, stateKey: string): Record<string, UiNode> {
  return {
    [id]: { kind: 'component', id, definitionId: 'vict.catalog.collapsible', revision: '1',
      classes: ['ql-settings-disclosure'], props: { label: literal('Settings'), open: ref(`state.${stateKey}`) },
      outputs: { openChange: { setState: { key: stateKey } } },
      slots: { trigger: { name: 'trigger', children: [`${id}-icon`, `${id}-label`, `${id}-chevron`] },
        content: { name: 'content', children: [`${id}-body`] } },
      partStyles: {
        trigger: { localStyle: [...quietControl, style('min-height', '36px'), style('padding', '4px 10px'), style('font-size', '13px')] },
        content: { localStyle: [style('padding', '2px 10px 8px')] }
      } },
    [`${id}-icon`]: icon(`${id}-icon`, 'settings'),
    [`${id}-label`]: text(`${id}-label`, 'Settings'),
    [`${id}-chevron`]: element(`${id}-chevron`, 'span', [`${id}-chevron-icon`], ['ql-settings-chevron']),
    [`${id}-chevron-icon`]: icon(`${id}-chevron-icon`, 'chevron-down'),
    [`${id}-body`]: element(`${id}-body`, 'div', [`${id}-appearance`, `${id}-archived`, `${id}-memory`, `${id}-signout`], ['ql-settings']),
    [`${id}-memory`]: { ...button(`${id}-memory`, 'Memory defaults', 'ui.memory.defaults', undefined, true), localStyle: [...quietControl, style('padding', '4px 0'), style('min-height', '34px'), style('font-size', '13px')] },
    [`${id}-appearance`]: settingsSwitch(`${id}-appearance`, 'Dark appearance', 'dark'),
    [`${id}-archived`]: settingsSwitch(`${id}-archived`, 'Archived rooms', 'showArchived'),
    [`${id}-signout`]: { kind: 'component', id: `${id}-signout`, definitionId: 'vict.pattern.action-button', revision: '1',
      props: { label: literal('Sign out'), disabled: ref('view.pending') },
      outputs: { activate: { invokeAction: { actionId: 'auth.sign-out' } } },
      slots: { icon: { name: 'icon', children: [`${id}-signout-icon`] } },
      localStyle: [...quietControl, style('padding', '4px 0'), style('min-height', '34px'), style('font-weight', '400')] },
    [`${id}-signout-icon`]: { kind: 'component', id: `${id}-signout-icon`, definitionId: 'vict.media.icon', revision: '1',
      props: { data: literal(signOutVector), size: literal(18), decorative: literal(true) } }
  };
}

function menuItem(id: string, label: string, actionId: string): UiNode {
  return { kind: 'component', id, definitionId: 'vict.catalog.dropdown-menu.item', revision: '1',
    props: { label: literal(label), disabled: ref('view.pending') },
    outputs: { itemActivate: { invokeAction: { actionId } } } };
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
    style('border-color', 'transparent'), style('white-space', 'nowrap'), style('overflow', 'hidden'), style('text-overflow', 'ellipsis'),
    style('font-size', '13px'), style('font-weight', '400'), style('padding', '6px 10px'), style('min-height', 'var(--ql-nav-height)'), style('border-radius', '7px'), style('color', 'var(--vict-color-text)'),
    { property: 'background', value: { type: 'binding', expression: { type: 'conditionalValue',
      when: ref(`repeat.${item}.selected`), then: literal('var(--ql-selected)'), otherwise: literal('transparent') } } }
  ];
  return {
    [prefix]: element(prefix, 'div', [`${prefix}-heading`, `${prefix}-rooms`, `${prefix}-empty`, `${prefix}-new`, `${prefix}-conversation-heading`, `${prefix}-conversations`], ['ql-navigation']),
    [`${prefix}-heading`]: element(`${prefix}-heading`, 'h2', [`${prefix}-heading-text`], ['ql-section-label']),
    [`${prefix}-heading-text`]: text(`${prefix}-heading-text`, 'Your rooms'),
    [`${prefix}-rooms`]: { kind: 'repeat', id: `${prefix}-rooms`, collection: ref('view.rooms'), key: ref('repeat.room.id'), itemName: 'room', templateRoot: `${prefix}-room` },
    [`${prefix}-room`]: { ...button(`${prefix}-room`, '', 'ui.room.select', { id: ref('repeat.room.id') }), props: { label: ref('repeat.room.name') }, localStyle: selectionStyle('room') },
    [`${prefix}-empty`]: conditional(`${prefix}-empty`, 'emptyRooms', [`${prefix}-empty-label`]),
    [`${prefix}-empty-label`]: element(`${prefix}-empty-label`, 'p', [`${prefix}-empty-text`], ['ql-muted']),
    [`${prefix}-empty-text`]: text(`${prefix}-empty-text`, 'view.roomsEmptyText', true),
    [`${prefix}-new`]: { ...button(`${prefix}-new`, 'New room', 'ui.room.new', undefined, true), localStyle: [...quietControl, style('font-size', '12px'), style('padding', '6px 10px'), style('min-height', 'var(--ql-nav-height)'), style('justify-content', 'flex-start'), style('width', '100%')] },
    [`${prefix}-conversation-heading`]: element(`${prefix}-conversation-heading`, 'div', [`${prefix}-recent-heading`, `${prefix}-newConversationContainer`], ['ql-conversation-heading']),
    [`${prefix}-recent-heading`]: element(`${prefix}-recent-heading`, 'h2', [`${prefix}-recent-text`], ['ql-section-label', 'ql-recent-label']),
    [`${prefix}-recent-text`]: text(`${prefix}-recent-text`, 'Conversations'),
    [`${prefix}-newConversationContainer`]: conditional(`${prefix}-newConversationContainer`, 'activeRoom', [`${prefix}-newConversation`]),
    [`${prefix}-newConversation`]: { kind: 'component', id: `${prefix}-newConversation`, definitionId: 'vict.pattern.action-button', revision: '1',
      props: { label: literal('New conversation'), value: literal('new-conversation'), iconOnly: literal(true), disabled: ref('view.pending') },
      outputs: { activate: { invokeAction: { actionId: 'conversation.create', input: { roomId: ref('view.roomId') } } } },
      slots: { icon: { name: 'icon', children: [`${prefix}-newConversationIcon`] } },
      localStyle: [...iconControl, style('width', '36px'), style('height', '36px'), style('min-width', '36px'), style('min-height', '36px')] },
    [`${prefix}-newConversationIcon`]: icon(`${prefix}-newConversationIcon`, 'plus'),
    [`${prefix}-conversations`]: { kind: 'repeat', id: `${prefix}-conversations`, collection: ref('view.conversations'), key: ref('repeat.conversation.id'), itemName: 'conversation', templateRoot: `${prefix}-conversation` },
    [`${prefix}-conversation`]: { ...button(`${prefix}-conversation`, '', 'ui.conversation.select', { id: ref('repeat.conversation.id') }), props: { label: ref('repeat.conversation.title') }, localStyle: selectionStyle('conversation') }
  };
}

const nodes: Record<string, UiNode> = {
  shell: element('shell', 'div', ['sidebar', 'workspace', 'memoryDrawer'], ['ql-shell']),
  ...memoryNodes,
  sidebar: element('sidebar', 'aside', ['brand', 'navigation', 'sidebarFooter'], ['ql-sidebar']),
  brand: element('brand', 'div', ['brandName'], ['ql-brand']),
  brandName: element('brandName', 'h1', ['brandText']),
  brandText: text('brandText', 'Quellight'),
  ...navigation('navigation'),
  ...navigation('mobileNavigation'),
  sidebarFooter: element('sidebarFooter', 'div', ['desktopSettings'], ['ql-sidebar-footer']),
  ...settingsDisclosure('desktopSettings', 'settingsOpen'),
  ...settingsDisclosure('mobileSettings', 'mobileSettingsOpen'),
  workspace: element('workspace', 'main', ['toolbar', 'error', 'loading', 'roomEditor', 'mainContent'], ['ql-workspace']),
  mobileNav: element('mobileNav', 'div', ['mobileMenu'], ['ql-mobile-nav']),
  mobileMenu: { kind: 'component', id: 'mobileMenu', definitionId: 'vict.pattern.drawer', revision: '1',
    props: { title: literal('Quellight'), triggerLabel: literal('Open rooms'), open: ref('state.navigationOpen'), side: literal('left'), size: literal(252) },
    outputs: { openChange: { setState: { key: 'navigationOpen' } } },
    slots: { trigger: { name: 'trigger', children: ['mobileMenuIcon'] }, body: { name: 'body', children: ['mobileNavigation'] }, footer: { name: 'footer', children: ['mobileSettings'] } },
    partStyles: { ...drawerParts,
      panel: { localStyle: [style('background', 'var(--ql-sidebar)'), style('color', 'var(--vict-color-text)'), style('border-radius', '0'), style('border-width', '0 1px 0 0')] },
      header: { localStyle: [style('padding', '6px 6px 6px 22px'), style('min-height', '56px'), style('border', '0')] },
      body: { localStyle: [style('padding', '6px 12px 8px')] },
      footer: { localStyle: [style('padding', '4px 12px 8px')] }
    } },
  mobileMenuIcon: icon('mobileMenuIcon', 'menu'),
  toolbar: element('toolbar', 'header', ['mobileNav', 'roomIdentity', 'moreControls'], ['ql-toolbar']),
  roomIdentity: element('roomIdentity', 'div', ['headerTitle'], ['ql-room-identity']),
  headerTitle: element('headerTitle', 'h2', ['headerTitleText']),
  headerTitleText: text('headerTitleText', 'view.headerTitle', true),
  moreControls: conditional('moreControls', 'hasMoreActions', ['moreMenu']),
  moreMenu: { kind: 'component', id: 'moreMenu', definitionId: 'vict.catalog.dropdown-menu', revision: '1',
    props: { label: literal('More'), open: ref('state.moreOpen'), disabled: ref('view.pending') },
    outputs: { openChange: { setState: { key: 'moreOpen' } } },
    slots: { trigger: { name: 'trigger', children: ['moreIcon', 'moreAccessibleLabel'] }, items: { name: 'items', children: ['moreRoomActions', 'moreConversationActions'] } },
    partStyles: {
      root: { localStyle: iconControl },
      content: { localStyle: [style('padding', '4px'), style('font-size', '13px'), style('min-width', '168px'), style('border-radius', '10px')] }
    } },
  moreIcon: element('moreIcon', 'span', ['moreGlyph'], ['ql-vertical-dots']),
  moreGlyph: icon('moreGlyph', 'more-horizontal'),
  moreAccessibleLabel: element('moreAccessibleLabel', 'span', ['moreLabelText'], ['ql-visually-hidden']),
  moreLabelText: text('moreLabelText', 'More'),
  moreRoomActions: conditional('moreRoomActions', 'activeRoom', ['rename']),
  rename: menuItem('rename', 'Room details', 'ui.room.edit'),
  moreConversationActions: conditional('moreConversationActions', 'hasConversation', ['openMemory', 'export']),
  openMemory: menuItem('openMemory', 'Memory', 'ui.memory.open'),
  error: conditional('error', 'hasError', ['errorBox']),
  errorBox: { ...element('errorBox', 'div', ['errorText', 'reload'], ['ql-error']), attributes: { role: 'alert' } },
  errorText: text('errorText', 'view.error', true),
  reload: button('reload', 'Reconnect', 'ui.reload', undefined, true),
  loading: conditional('loading', 'loading', ['loadingText']),
  loadingText: { ...element('loadingText', 'p', ['loadingCopy'], ['ql-loading']), attributes: { role: 'status' } },
  loadingCopy: text('loadingCopy', 'Opening your space…'),
  mainContent: { kind: 'conditional', id: 'mainContent', branches: [
    { when: 'memoryDefaults', children: ['memoryDefaultsPage'] },
    { when: 'roomDetails', children: ['roomDetailsPage'] }, { when: 'hasConversation', children: ['conversation'] }, { when: 'ready', children: ['welcome'] }
  ] },
  welcome: element('welcome', 'section', ['welcomeTitle', 'welcomeCopy'], ['ql-welcome']),
  welcomeTitle: element('welcomeTitle', 'h2', ['welcomeTitleText']),
  welcomeTitleText: text('welcomeTitleText', 'What’s on your mind?'),
  welcomeCopy: element('welcomeCopy', 'p', ['welcomeCopyText']),
  welcomeCopyText: text('welcomeCopyText', 'Bring a question, an idea, or something you’d like to work through.'),
  conversation: { kind: 'component', id: 'conversation', definitionId: 'vict.ai.transcript', revision: '1',
    classes: ['ql-transcript'],
    props: { data: ref('view.transcript'), title: literal(''), description: literal(''), busy: ref('view.busy'), emptyMessage: literal('Take your time. What would you like to explore?'), inputLabel: literal('Message') },
    slots: { composer: { name: 'composer', children: ['composer'] }, footer: { name: 'footer', children: ['conversationFooter'] } },
    partStyles: {
      surface: { localStyle: [style('background', 'transparent'), style('border', '0'), style('box-shadow', 'none'), style('border-radius', '0')] },
      messages: { localStyle: [style('padding', '18px 8px 10px'), style('gap', '16px')] },
      'message-content': { localStyle: [style('max-width', '100%')] },
      'message-text': { localStyle: [style('font-size', '14px'), style('line-height', '1.6')] },
      composer: { localStyle: [style('padding', '0')] }
    } },
  composer: { kind: 'component', id: 'composer', definitionId: 'vict.ai.prompt-input', revision: '3',
    props: { value: ref('state.draft'), label: literal('Message'), placeholder: literal('Write a message…'), busy: ref('view.busy'), sendEnabled: ref('view.canSend'), stopEnabled: ref('view.canStop'), attachEnabled: literal(false) },
    outputs: { valueChange: { setState: { key: 'draft' } },
      send: { invokeAction: { actionId: 'conversation.send', input: { conversationId: ref('view.conversationId'), text: ref('$output') } } },
      stop: { invokeAction: { actionId: 'conversation.cancel', input: { turnId: ref('view.turnId') } } } },
    partStyles: {
      surface: { localStyle: [style('display', 'grid'), style('grid-template-columns', 'minmax(0, 1fr) auto'), style('align-items', 'end'), style('gap', '4px'), style('padding', '3px'), style('border-radius', '13px'), style('box-shadow', 'none')] },
      field: { localStyle: [style('min-height', '40px'), style('height', 'auto'), style('max-height', '160px'), style('padding', '9px 11px'), style('line-height', '22px'), style('font-size', '14px'), style('resize', 'none'), style('field-sizing', 'content')] },
      actions: { localStyle: [style('padding', '0'), style('width', '40px'), style('min-height', '40px'), style('align-self', 'end'), style('justify-content', 'center')] },
      send: { localStyle: composerAction },
      stop: { localStyle: composerAction }
    } },
  conversationFooter: element('conversationFooter', 'div', ['status'], ['ql-conversation-footer']),
  status: { ...element('status', 'span', ['statusText']), attributes: { role: 'status', 'aria-live': 'polite' } },
  statusText: text('statusText', 'view.statusText', true),
  export: menuItem('export', 'Export conversation', 'ui.export'),
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
  roomDetailsPage: element('roomDetailsPage', 'section', ['roomDetailsBack', 'roomDetailsContent'], ['ql-room-page']),
  roomDetailsBack: { kind: 'component', id: 'roomDetailsBack', definitionId: 'vict.pattern.action-button', revision: '1',
    props: { label: ref('view.roomDetailsBackLabel'), disabled: ref('view.pending') },
    outputs: { activate: { invokeAction: { actionId: 'ui.room.dismiss' } } },
    slots: { icon: { name: 'icon', children: ['roomDetailsBackIcon'] } },
    localStyle: [...quietControl, style('padding', '0 4px'), style('min-height', '36px'), style('font-weight', '400')] },
  roomDetailsBackIcon: icon('roomDetailsBackIcon', 'arrow-left'),
  roomDetailsContent: { kind: 'conditional', id: 'roomDetailsContent', branches: [
    { when: 'archiveOpen', children: ['archivePanel'] }, { when: 'roomDetails', children: ['renameForm'] }
  ] },
  renameForm: element('renameForm', 'section', ['editTitle', 'editPurpose', 'editName', 'renameButtons', 'roomMemorySettings'], ['ql-form']),
  editTitle: { ...element('editTitle', 'h1', ['editTitleText']), attributes: { tabindex: '-1' } },
  editTitleText: text('editTitleText', 'Room details'),
  editPurpose: element('editPurpose', 'p', ['editPurposeText'], ['ql-muted', 'ql-room-purpose']),
  editPurposeText: text('editPurposeText', 'view.roomPurpose', true),
  ...field('editName', 'editedName', 'Room name'),
  renameButtons: element('renameButtons', 'div', ['renameSave', 'archiveOpen'], ['ql-button-row']),
  renameSave: button('renameSave', 'Save name', 'room.rename', { id: ref('view.roomId'), name: ref('state.editedName'), revision: ref('view.roomRevision') }),
  archiveOpen: button('archiveOpen', 'Archive room', 'ui.archive.open', undefined, true),
  archivePanel: element('archivePanel', 'section', ['archiveTitle', 'archiveHelp', 'archiveButtons'], ['ql-form']),
  archiveTitle: element('archiveTitle', 'h1', ['archiveTitleText']),
  archiveTitleText: text('archiveTitleText', 'Archive room?'),
  archiveHelp: element('archiveHelp', 'p', ['archiveHelpText']),
  archiveHelpText: text('archiveHelpText', 'This room moves into Archived rooms. You can return there to read its conversations.'),
  archiveButtons: element('archiveButtons', 'div', ['archiveConfirm', 'archiveCancel'], ['ql-button-row']),
  archiveConfirm: button('archiveConfirm', 'Archive room', 'room.archive', { id: ref('view.roomId'), revision: ref('view.roomRevision') }),
  archiveCancel: button('archiveCancel', 'Keep room', 'ui.archive.dismiss', undefined, true)
};

export const document: UiDocument = {
  schema: 'vict.ui-document@1', id: 'quellight.conversation', revision: '6', root: 'shell',
  nodes, componentDefinitions: {}, styleSources: {}, tokens: {}, assets: {},
  conditions: {
    ...memoryConditions,
    ...Object.fromEntries(['hasError', 'loading', 'ready', 'hasConversation', 'hasMoreActions', 'activeRoom', 'emptyRooms', 'roomDetails'].map(id => [id, { id, kind: 'localState' as const, when: ref(`view.${id}`) }])),
    ...Object.fromEntries(['newRoomOpen', 'archiveOpen'].map(id => [id, { id, kind: 'localState' as const, when: ref(`state.${id}`) }]))
  },
  localState: { ...memoryLocalState, ...Object.fromEntries([
    state('draft', ''), state('dark', false), state('showArchived', false), state('navigationOpen', false), state('moreOpen', false), state('settingsOpen', false), state('mobileSettingsOpen', false),
    state('newRoomOpen', false), state('roomName', ''), state('roomPurpose', ''),
    state('editedName', ''), state('archiveOpen', false)
  ].map(declaration => [declaration.key, declaration])) }
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
const resources = [...productResources, ...interfaceResources, memorySettingsResource, memoryCareResource];
export const application: ApplicationDefinitionV3 = {
  schema: 'vict.application@3', id: 'quellight', revision: '3', name: 'Quellight',
  compatibility: { applicationSchema: 'vict.application@3' },
  composition: { navigation: 'none', responsive: { navigationAt: 'small' } },
  routes: [{ id: 'conversation', path: '/', screenId: 'conversation' }, { id: 'sign-in', path: '/auth/sign-in', screenId: 'sign-in' }, { id: 'setup', path: '/auth/setup', screenId: 'setup' }],
  screens: documents.map((source, index) => ({ id: ['conversation', 'sign-in', 'setup'][index], title: 'Quellight', uiDocument: { documentId: source.id, revision: source.revision } })),
  actions: [...productActions, ...interfaceActions, ...memorySettingsActions, ...memoryCareActions], resources: resources.map(resource => ({ resourceId: resource.id, revision: resource.revision })), views: [], forms: [], components: []
};
export const viewFields = {
  ...memoryViewFields,
  rooms: 'array', 'rooms.id': 'string', 'rooms.name': 'string', 'rooms.selected': 'boolean',
  conversations: 'array', 'conversations.id': 'string', 'conversations.title': 'string', 'conversations.selected': 'boolean',
  transcript: 'string', roomId: 'string', roomName: 'string', roomPurpose: 'string', roomRevision: 'number',
  conversationId: 'string', conversationTitle: 'string', turnId: 'string', busy: 'boolean', canSend: 'boolean', canStop: 'boolean',
  pending: 'boolean', error: 'string', statusText: 'string', roomsEmptyText: 'string',
  headerTitle: 'string', roomDetails: 'boolean', roomDetailsBackLabel: 'string',
  hasError: 'boolean', loading: 'boolean', ready: 'boolean', hasConversation: 'boolean', hasMoreActions: 'boolean', activeRoom: 'boolean', emptyRooms: 'boolean'
} as const;
export const view = {
  ...memoryInitialView,
  rooms: [], conversations: [], transcript: JSON.stringify({ version: 1, messages: [] }),
  roomId: '', roomName: 'Your space', roomPurpose: '', roomRevision: 1,
  conversationId: '', conversationTitle: '', turnId: '', busy: false, canSend: false, canStop: false,
  pending: false, error: '', statusText: '', roomsEmptyText: 'Create a room to begin.',
  headerTitle: 'Your space', roomDetails: false, roomDetailsBackLabel: 'Back to room',
  hasError: false, loading: true, ready: false, hasConversation: false, hasMoreActions: false, activeRoom: false, emptyRooms: true
};
export function compile(candidate: UiDocument = document) {
  return compileApplication({ application, resources,
    contracts: [...[...productContracts, ...memorySettingsContracts, ...memoryCareContracts].map(({ id, revision, presentationFields }) => ({ id, revision, presentationFields })), ...interfaceContracts],
    uiDocuments: documents.map(source => ({ document: source.id === candidate.id ? candidate : source })),
    uiExtensions: descriptors, uiViewFields: viewFields });
}
export function requireRenderPlan(candidate: UiDocument = document) {
  const compiled = compile(candidate);
  if (!compiled.ok) throw new Error(`Quellight application compilation failed: ${compiled.issues.map(issue => `${issue.code} ${issue.path}`).join(', ')} ${'uiIssues' in compiled ? JSON.stringify(compiled.uiIssues) : ''}`);
  if (compiled.plan.uiDiagnostics?.length) throw new Error(`Quellight UI is not ready: ${compiled.plan.uiDiagnostics.map(issue => `${issue.code} ${issue.message}`).join(', ')}`);
  const plan = compiled.plan.documentPlans?.[`${candidate.id}@${candidate.revision}`];
  if (!plan) throw new Error('Quellight render plan is missing.');
  return plan;
}
