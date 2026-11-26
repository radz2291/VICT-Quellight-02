import type { UiNode, UiExpression, UiLocalStateDecl, UiStyleDeclaration } from '@victframework/ui';
import { rheaNativePatterns } from '@victframework/ui-svelte/rhea';
import { memoryRoles } from './memory-client';

const l = (value: string | number | boolean): UiExpression => ({ type: 'literal', value });
const r = (path: string): UiExpression => ({ type: 'ref', path });
const st = (property: string, value: string): UiStyleDeclaration => ({ property, value: { type: 'text', value } });
const el = (id: string, tag: string, children: string[], classes: string[] = []): UiNode => ({ kind: 'element', id, tag, children, classes });
const txt = (id: string, text: string, ref = false): UiNode => ({ kind: 'text', id, content: ref ? { type: 'expression', expression: r(text) } : { type: 'literal', value: text } });
const cond = (id: string, when: string, children: string[]): UiNode => ({ kind: 'conditional', id, branches: [{ when, children }] });
const quiet = [st('background', 'transparent'), st('color', 'var(--vict-color-textMuted)'), st('border-color', 'transparent'), st('min-height', '34px'), st('font-size', '13px'), st('font-weight', '400')];
function action(id: string, label: string, actionId: string, input?: Record<string, UiExpression>, disabled = 'pending'): UiNode {
  return { kind: 'component', id, definitionId: 'vict.catalog.button', revision: '1', props: { label: l(label), disabled: r(`view.${disabled}`) },
    outputs: { press: { invokeAction: { actionId, ...(input ? { input } : {}) } } }, localStyle: quiet };
}
function copy(id: string, content: string, ref = false, classes: string[] = ['ql-muted']): Record<string, UiNode> {
  return { [id]: el(id, 'p', [`${id}-text`], classes), [`${id}-text`]: txt(`${id}-text`, content, ref) };
}
function disclosure(id: string, label: string, children: string[]): UiNode {
  return { kind: 'component', id, definitionId: 'vict.catalog.collapsible', revision: '1', classes: ['ql-memory-disclosure'],
    props: { label: l(label), open: r(`state.${id}Open`) }, outputs: { openChange: { setState: { key: `${id}Open` } } },
    slots: { trigger: { name: 'trigger', children: [`${id}-label`, `${id}-chevron`] }, content: { name: 'content', children } },
    partStyles: { trigger: { localStyle: [...quiet, st('padding', '8px 0'), st('width', '100%'), st('justify-content', 'space-between')] }, content: { localStyle: [st('padding', '4px 0 14px')] } } };
}
function field(id: string, key: string, label: string, options?: string): Record<string, UiNode> {
  const fragment = rheaNativePatterns.find(pattern => pattern.id === (options ? 'native-select' : 'textarea'))!.create(id);
  const nodes = Object.fromEntries(fragment.nodes.map(node => [node.id, node])) as Record<string, UiNode>;
  const control = nodes[`${id}-control`] as Extract<UiNode, { kind: 'element' }>;
  nodes[id] = el(id, 'div', [`${id}-label`, `${id}-control`], ['vict-rhea', 'vict-rhea-field', 'ql-memory-field']);
  nodes[`${id}-label-text`] = txt(`${id}-label-text`, label);
  nodes[`${id}-control`] = { ...control, children: options ? [`${id}-options`] : [],
    attributes: { id: `${id}-control`, name: key, value: r(`state.${key}`), disabled: r('view.pending'), ...(options ? {} : { rows: '4' }) },
    interactions: [{ on: 'change', action: 'setState', key, value: r(`state.${key}`) }] };
  for (const suffix of ['help', 'help-text', 'option-first', 'option-second', 'first-text', 'second-text']) delete nodes[`${id}-${suffix}`];
  if (options) {
    nodes[`${id}-options`] = { kind: 'repeat', id: `${id}-options`, collection: r(`view.${options}`), key: r('repeat.option.value'), itemName: 'option', templateRoot: `${id}-option` };
    nodes[`${id}-option`] = { kind: 'element', id: `${id}-option`, tag: 'option', children: [`${id}-option-label`], attributes: { value: r('repeat.option.value') } };
    nodes[`${id}-option-label`] = txt(`${id}-option-label`, 'repeat.option.label', true);
  }
  return nodes;
}
const settingsInput = { target: r('view.memoryTarget'), roomId: r('view.memorySettingsRoomId'), expectedRevision: r('view.memorySettingsRevision'), content: r('view.memoryDraftJson') };
const careInput = { conversationId: r('view.conversationId'), expectedAuthorityRevision: r('view.memoryAuthorityRevision'), sourceMessageIds: r('view.memorySelectedSources') };

function settingsForm(prefix: string): Record<string, UiNode> {
  const nodes: Record<string, UiNode> = {
    [prefix]: el(prefix, 'section', [`${prefix}-title`, `${prefix}-intro`, `${prefix}-loading`, `${prefix}-content`], ['ql-memory-settings']),
    [`${prefix}-title`]: el(`${prefix}-title`, 'h2', [`${prefix}-title-text`]),
    [`${prefix}-title-text`]: txt(`${prefix}-title-text`, 'view.memorySettingsTitle', true),
    ...copy(`${prefix}-intro`, 'view.memorySettingsIntro', true),
    [`${prefix}-loading`]: cond(`${prefix}-loading`, 'memorySettingsLoading', [`${prefix}-loading-copy`]),
    ...copy(`${prefix}-loading-copy`, 'Opening memory settings…'),
    [`${prefix}-content`]: cond(`${prefix}-content`, 'hasMemorySettings', [`${prefix}-form`]),
    [`${prefix}-form`]: el(`${prefix}-form`, 'div', [`${prefix}-purpose-wrap`, `${prefix}-automatic`, `${prefix}-personal`, `${prefix}-recall-scope`, `${prefix}-guidance-mode-wrap`, `${prefix}-guidance-wrap`, `${prefix}-prompts`, `${prefix}-buttons`, `${prefix}-status`, `${prefix}-preview-wrap`, `${prefix}-history`], ['ql-form']),
    [`${prefix}-purpose-wrap`]: cond(`${prefix}-purpose-wrap`, 'memoryIsRoom', [`${prefix}-purpose`]),
    ...field(`${prefix}-purpose`, 'mPurpose', 'Room purpose'),
    ...field(`${prefix}-automatic`, 'mAutomatic', 'Automatic learning', 'memoryBooleanOptions'),
    ...field(`${prefix}-personal`, 'mPersonal', 'Personal preferences across rooms', 'memoryBooleanOptions'),
    ...field(`${prefix}-recall-scope`, 'mRecall', 'Recall original sources', 'memoryRecallOptions'),
    [`${prefix}-guidance-mode-wrap`]: cond(`${prefix}-guidance-mode-wrap`, 'memoryIsRoom', [`${prefix}-guidance-mode`]),
    ...field(`${prefix}-guidance-mode`, 'mGuidanceMode', 'Response guidance', 'memoryOverrideOptions'),
    [`${prefix}-guidance-wrap`]: cond(`${prefix}-guidance-wrap`, 'memoryGuidanceCustom', [`${prefix}-guidance`]),
    ...field(`${prefix}-guidance`, 'mGuidance', 'Additional response guidance'),
    [`${prefix}-prompts`]: disclosure(`${prefix}-prompts`, 'Prompts and templates', [`${prefix}-prompt-help`, ...memoryRoles.map(role => `${prefix}-${role}`)]),
    ...copy(`${prefix}-prompt-help`, 'Native memory prompts stay in place. Custom additions extend Observer, Reflector and recall. Conversation text and the personal memory template can be replaced.'),
    [`${prefix}-buttons`]: el(`${prefix}-buttons`, 'div', [`${prefix}-preview`, `${prefix}-save`], ['ql-button-row']),
    [`${prefix}-preview`]: action(`${prefix}-preview`, 'Preview changes', 'ui.memory.settings.preview'),
    [`${prefix}-save`]: action(`${prefix}-save`, 'Save settings', 'memory.settings.save', settingsInput),
    ...copy(`${prefix}-status`, 'view.memorySettingsStatus', true),
    [`${prefix}-preview-wrap`]: cond(`${prefix}-preview-wrap`, 'hasMemoryPreview', [`${prefix}-preview-text`]),
    ...copy(`${prefix}-preview-text`, 'view.memoryPreviewText', true, ['ql-memory-copy', 'ql-memory-preview']),
    [`${prefix}-history`]: disclosure(`${prefix}-history`, 'Saved versions', [`${prefix}-revision-label`, `${prefix}-restore-select`, `${prefix}-restore`]),
    ...copy(`${prefix}-revision-label`, 'view.memoryRevisionLabel', true),
    ...field(`${prefix}-restore-select`, 'mRestore', 'Version to restore', 'memoryHistoryOptions'),
    [`${prefix}-restore`]: action(`${prefix}-restore`, 'Restore this version', 'memory.settings.restore', {
      target: r('view.memoryTarget'), roomId: r('view.memorySettingsRoomId'), expectedRevision: r('view.memorySettingsRevision'), restoreRevision: r('view.memoryRestoreRevision') }, 'memoryCannotRestore')
  };
  const labels = { conversation: 'Conversation', observer: 'Observer', reflector: 'Reflector', recall: 'Source recall', workingMemory: 'Personal memory template' };
  for (const role of memoryRoles) Object.assign(nodes, {
    [`${prefix}-${role}`]: el(`${prefix}-${role}`, 'div', [`${prefix}-${role}-mode`, `${prefix}-${role}-custom`], ['ql-memory-prompt']),
    ...field(`${prefix}-${role}-mode`, `m_${role}_mode`, labels[role], `memory_${role}_options`),
    [`${prefix}-${role}-custom`]: cond(`${prefix}-${role}-custom`, `memory_${role}_custom`, [`${prefix}-${role}-text`]),
    ...field(`${prefix}-${role}-text`, `m_${role}_text`, role === 'conversation' ? 'Conversation instructions' : role === 'workingMemory' ? 'Template text' : `${labels[role]} additions`)
  });
  return nodes;
}
export const memoryNodes: Record<string, UiNode> = {
  memoryDefaultsPage: el('memoryDefaultsPage', 'section', ['memoryDefaultsBack', 'appMemorySettings'], ['ql-room-page']),
  memoryDefaultsBack: action('memoryDefaultsBack', 'Back to conversation', 'ui.memory.defaults.close'),
  ...settingsForm('appMemorySettings'), ...settingsForm('roomMemorySettings'),
  memoryDrawer: { kind: 'component', id: 'memoryDrawer', definitionId: 'vict.pattern.drawer', revision: '1',
    props: { title: l('Memory'), triggerLabel: l('Open memory'), open: r('state.memoryOpen'), side: l('right'), size: l(440) },
    outputs: { openChange: { setState: { key: 'memoryOpen' } } },
    slots: { body: { name: 'body', children: ['memoryStatus', 'memoryChangedNotice', 'memoryObservationsTitle', 'memoryObservations', 'memoryHistory', 'memoryPrepared', 'memoryPersonal', 'memoryActivity', 'memorySources', 'memoryContext', 'memoryCare'] } },
    partStyles: { trigger: { localStyle: [st('display', 'none')] }, panel: { localStyle: [st('background', 'var(--vict-color-bg)'), st('color', 'var(--vict-color-text)')] }, header: { localStyle: [st('padding', '8px 14px 8px 20px'), st('min-height', '56px')] }, body: { localStyle: [st('padding', '18px 20px 32px')] } } },
  ...copy('memoryStatus', 'view.memoryStatusLabel', true),
  memoryChangedNotice: cond('memoryChangedNotice', 'memoryChanged', ['memoryChangedCopy', 'memoryReload']),
  ...copy('memoryChangedCopy', 'Memory changed elsewhere. Your draft is kept. Reload saved memory to replace this draft before making a change.'),
  memoryReload: action('memoryReload', 'Reload saved memory', 'ui.memory.reload'),
  memoryObservationsTitle: el('memoryObservationsTitle', 'h2', ['memoryObservationsTitleText'], ['ql-memory-heading']),
  memoryObservationsTitleText: txt('memoryObservationsTitleText', 'Observations in this conversation'),
  ...copy('memoryObservations', 'view.memoryObservationText', true, ['ql-memory-copy']),
  memoryHistory: disclosure('memoryHistory', 'Earlier observations', ['memoryHistoryText']),
  ...copy('memoryHistoryText', 'view.memoryObservationHistory', true, ['ql-memory-copy']),
  memoryPrepared: disclosure('memoryPrepared', 'Prepared observations', ['memoryPreparedText']),
  ...copy('memoryPreparedText', 'view.memoryPreparedText', true, ['ql-memory-copy']),
  memoryPersonal: disclosure('memoryPersonal', 'Personal memory', ['memoryPersonalHelp', 'memoryPersonalText', 'memoryResumeWrap']),
  ...copy('memoryPersonalHelp', 'view.memoryPersonalHelp', true),
  ...copy('memoryPersonalText', 'view.memoryPersonalText', true, ['ql-memory-copy']),
  memoryResumeWrap: cond('memoryResumeWrap', 'memoryOwnerManaged', ['memoryResume']),
  memoryResume: action('memoryResume', 'Resume automatic updates', 'memory.resume', { ...careInput, sourceMessageIds: l('[]') }, 'memoryCannotCorrect'),
  memoryActivity: disclosure('memoryActivity', 'Memory activity', ['memoryActivityText', 'memoryRetryWrap']),
  ...copy('memoryActivityText', 'view.memoryActivityText', true, ['ql-memory-copy']),
  memoryRetryWrap: cond('memoryRetryWrap', 'memoryCanRetry', ['memoryRetry']),
  memoryRetry: action('memoryRetry', 'Retry pending memory', 'memory.retry', { ...careInput, sourceMessageIds: l('[]') }, 'memoryCannotRetry'),
  memorySources: disclosure('memorySources', 'Original sources', ['memorySourcesHelp', 'memorySourcesList', 'memorySourceStatus', 'memoryMoreSourcesWrap']),
  ...copy('memorySourcesHelp', 'Select original messages below when correcting or forgetting. The conversation itself stays intact.'),
  memorySourcesList: { kind: 'repeat', id: 'memorySourcesList', collection: r('view.memorySources'), key: r('repeat.source.id'), itemName: 'source', templateRoot: 'memorySource' },
  memorySource: el('memorySource', 'article', ['memorySourceSelect', 'memorySourceCopy'], ['ql-memory-source']),
  memorySourceSelect: { kind: 'component', id: 'memorySourceSelect', definitionId: 'vict.catalog.checkbox', revision: '1', props: { label: r('repeat.source.label'), checked: r('repeat.source.selected'), disabled: r('repeat.source.excluded') }, outputs: { checkedChange: { invokeAction: { actionId: 'ui.memory.source.toggle', input: { id: r('repeat.source.id') } } } } },
  ...copy('memorySourceCopy', 'repeat.source.text', true, ['ql-memory-copy']),
  ...copy('memorySourceStatus', 'view.memorySourceStatus', true),
  memoryMoreSourcesWrap: cond('memoryMoreSourcesWrap', 'memoryMoreSources', ['memoryMoreSourcesButton']),
  memoryMoreSourcesButton: action('memoryMoreSourcesButton', 'Load older sources', 'ui.memory.more-sources'),
  memoryContext: disclosure('memoryContext', 'Memory used for a reply', ['memoryReplySelect', 'memoryMoreRepliesWrap', 'memoryContextLoad', 'memoryContextHelp', 'memoryContextText', 'deskContextLoad', 'deskContextCopy']),
  memoryMoreRepliesWrap: cond('memoryMoreRepliesWrap', 'memoryMoreReplies', ['memoryMoreRepliesButton']),
  memoryMoreRepliesButton: action('memoryMoreRepliesButton', 'Load older replies', 'ui.memory.more-replies'),
  ...field('memoryReplySelect', 'memoryReply', 'Reply', 'memoryReplyOptions'),
  memoryContextLoad: action('memoryContextLoad', 'Show selected reply', 'ui.memory.context'),
  ...copy('memoryContextHelp', 'Memory selected before that reply, rather than its complete prompt or private reasoning.'),
  ...copy('memoryContextText', 'view.memoryContextText', true, ['ql-memory-copy']),
  memoryCare: disclosure('memoryCare', 'Correct or forget', ['memoryCareHelp', 'memoryProfileEdit', 'memoryCareButtons', 'memoryForgetConfirm', 'memoryCareStatus']),
  ...copy('memoryCareHelp', 'Correct personal preferences here. Selected original sources are excluded from future memory and recall; derived observations are rebuilt. Later assistant text that may repeat selected sources is also excluded from memory. Your conversation stays intact.'),
  ...field('memoryProfileEdit', 'memoryProfileText', 'Corrected personal memory'),
  memoryCareButtons: el('memoryCareButtons', 'div', ['memoryCorrect', 'memoryForgetOpen'], ['ql-button-row']),
  memoryCorrect: action('memoryCorrect', 'Save correction', 'memory.correct', { ...careInput, workingMemory: r('state.memoryProfileText') }, 'memoryCannotCorrect'),
  memoryForgetOpen: action('memoryForgetOpen', 'Forget selected sources', 'ui.memory.forget.open', undefined, 'memoryCannotForget'),
  memoryForgetConfirm: cond('memoryForgetConfirm', 'memoryForgetOpen', ['memoryForgetQuestion', 'memoryForgetActions']),
  ...copy('memoryForgetQuestion', 'Forget these selected sources? They will no longer be used for memory or source recall. Original messages stay in the conversation. Manually edited personal memory is kept; you can edit it separately here.'),
  memoryForgetActions: el('memoryForgetActions', 'div', ['memoryForget', 'memoryForgetCancel'], ['ql-button-row']),
  memoryForget: action('memoryForget', 'Confirm forget', 'memory.forget', careInput, 'memoryCannotForget'),
  memoryForgetCancel: action('memoryForgetCancel', 'Keep sources', 'ui.memory.forget.close'),
  ...copy('memoryCareStatus', 'view.memoryCareStatus', true)
};
for (const node of Object.values(memoryNodes)) if (node.kind === 'component' && node.definitionId === 'vict.catalog.collapsible') {
  memoryNodes[`${node.id}-label`] = txt(`${node.id}-label`, (node.props!.label as { type: 'literal'; value: string }).value);
  memoryNodes[`${node.id}-chevron`] = { kind: 'component', id: `${node.id}-chevron`, definitionId: 'vict.media.icon', revision: '1', classes: ['ql-memory-chevron'],
    props: { pack: l('lucide'), name: l('chevron-down'), revision: l('1.27.0'), size: l(14), strokeWidth: l(1.65), decorative: l(true) } };
}
const stringStates = ['mPurpose', 'mGuidance', 'mGuidanceMode', 'mAutomatic', 'mPersonal', 'mRecall', 'mRestore', 'memoryReply', 'memoryProfileText', ...memoryRoles.flatMap(role => [`m_${role}_mode`, `m_${role}_text`])];
const booleanStates = ['memoryOpen', 'memoryForgetOpen', ...Object.values(memoryNodes).filter(node => node.kind === 'component' && node.definitionId === 'vict.catalog.collapsible').map(node => `${node.id}Open`)];
export const memoryLocalState: Record<string, UiLocalStateDecl> = Object.fromEntries([...stringStates.map(key => [key, { key, type: 'string', initial: '' }]), ...booleanStates.map(key => [key, { key, type: 'boolean', initial: false }])]) as Record<string, UiLocalStateDecl>;
const boolViews = ['memoryDefaults', 'memorySettingsLoading', 'hasMemorySettings', 'memoryIsRoom', 'memoryGuidanceCustom', 'hasMemoryPreview', 'memoryCannotCorrect', 'memoryCannotForget', 'memoryCannotRestore', 'memoryOwnerManaged', 'memoryChanged', 'memoryCanRetry', 'memoryCannotRetry', 'memoryMoreSources', 'memoryMoreReplies', ...memoryRoles.map(role => `memory_${role}_custom`)];
const stringViews = ['memoryTarget', 'memorySettingsRoomId', 'memoryDraftJson', 'memorySettingsTitle', 'memorySettingsIntro', 'memorySettingsStatus', 'memoryPreviewText', 'memoryRevisionLabel', 'memoryStatusLabel', 'memoryObservationText', 'memoryObservationHistory', 'memoryPreparedText', 'memoryPersonalText', 'memoryPersonalHelp', 'memoryActivityText', 'memorySourceStatus', 'memoryContextText', 'memoryAuthorityRevision', 'memorySelectedSources', 'memoryCareStatus'];
const optionViews = ['memoryBooleanOptions', 'memoryRecallOptions', 'memoryOverrideOptions', 'memoryHistoryOptions', 'memoryReplyOptions', ...memoryRoles.map(role => `memory_${role}_options`)];
export const memoryViewFields = { ...Object.fromEntries(boolViews.map(key => [key, 'boolean'])), ...Object.fromEntries(stringViews.map(key => [key, 'string'])),
  memorySettingsRevision: 'number', memoryRestoreRevision: 'number', memorySources: 'array', 'memorySources.id': 'string', 'memorySources.label': 'string', 'memorySources.text': 'string', 'memorySources.selected': 'boolean', 'memorySources.excluded': 'boolean',
  ...Object.fromEntries(optionViews.flatMap(key => [[key, 'array'], [`${key}.value`, 'string'], [`${key}.label`, 'string']])) } as Record<string, 'string' | 'number' | 'boolean' | 'array'>;
export const memoryInitialView = { ...Object.fromEntries(boolViews.map(key => [key, false])), ...Object.fromEntries(stringViews.map(key => [key, ''])),
  memorySettingsRevision: 0, memoryRestoreRevision: 0, memorySources: [], ...Object.fromEntries(optionViews.map(key => [key, []])) };
export const memoryConditions = { ...Object.fromEntries(boolViews.map(id => [id, { id, kind: 'localState' as const, when: r(`view.${id}`) }])),
  memoryForgetOpen: { id: 'memoryForgetOpen', kind: 'localState' as const, when: r('state.memoryForgetOpen') } };
