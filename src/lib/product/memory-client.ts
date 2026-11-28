/** JSON-safe presentation contracts. No native memory SDK objects reach the browser. */
export interface MemoryInspection {
  conversationId: string;
  statusLabel: string;
  observations: { id: string | null; text: string; updatedAt: string | null; emptyText: string;
    history: { id: string; text: string; updatedAt: string | null }[];
    prepared: { id: string; text: string; updatedAt: string | null }[] };
  personal: { text: string; updatedAt: string | null; enabled: boolean; ownerManaged: boolean };
  activity: { id: string; label: string; status: string; at: string | null }[];
  sources: { id: string; conversationId: string; label: string; text: string; role: string; at: string | null; excluded: boolean }[];
  replies: { turnId: string; label: string }[];
  context: null | { turnId: string; scope: string; stage: string; text: string; omissions: string[]; revisionLabel: string };
  authority: { revision: string; excludedMessageIds: string[] };
  controls: { canCorrect: boolean; canForget: boolean; canRetry: boolean };
}
export interface MemorySummary extends MemoryInspection { version: string; repliesCursor: string | null; moreObservations: boolean }
export interface MemoryVersion { version: string }
export interface MemorySourcesPage { sources: MemoryInspection['sources']; nextCursor: string | null; authorityRevision: string }
export interface MemoryReplyPage { replies: MemoryInspection['replies']; nextCursor: string | null }
export interface MemoryContextResult { context: MemoryInspection['context']; authorityRevision: string; roomGuidanceRevision?: number | null }
export interface MemoryObservationHistory { history: MemoryInspection['observations']['history']; authorityRevision: string }
export const memoryRoles = ['conversation', 'observer', 'reflector', 'recall', 'workingMemory'] as const;
export type MemoryRole = typeof memoryRoles[number];
export interface PromptChoice { mode: string; text?: string; id?: string }
export interface MemorySettingsContent {
  configuration: Record<string, unknown>;
  prompts: Record<string, PromptChoice | { mode: 'inherit' | 'override'; value?: PromptChoice }>;
}
export interface MemorySettingsSnapshot {
  revision: number; contentRevision: string; content: MemorySettingsContent;
  operation: string; restoredFromRevision: number | null; createdAt: string | null;
}
export interface MemorySettingsPayload {
  app: MemorySettingsSnapshot; room: MemorySettingsSnapshot | null;
  effective: { configuration: { purpose: string; values: Record<string, unknown> }; prompts: { roles: Record<string, { text?: string; selection: PromptChoice; source: string }> }; versions?: { roomRecordRevision: number } };
  appHistory: MemorySettingsSnapshot[]; roomHistory: MemorySettingsSnapshot[];
  catalog: unknown;
}
export function memoryDraft(snapshot: MemorySettingsSnapshot, room: boolean, currentPurpose = ''): Record<string, string> {
  const values = room ? snapshot.content.configuration.overrides as Record<string, { mode: string; value?: unknown }> : snapshot.content.configuration;
  const result: Record<string, string> = { mPurpose: currentPurpose };
  for (const [field, key] of [['responseGuidance', 'mGuidance'], ['automaticLearning', 'mAutomatic'], ['personalPreferences', 'mPersonal'], ['recallScope', 'mRecall']]) {
    const selected = values[field] as any;
    const value = room ? selected.value : selected;
    result[key] = room && selected.mode === 'inherit' ? (key === 'mGuidance' ? '' : 'inherit') : String(value ?? '');
    if (key === 'mGuidance') result.mGuidanceMode = room ? selected.mode : 'override';
  }
  for (const role of memoryRoles) {
    const selected = snapshot.content.prompts[role] as any;
    const choice = room ? selected.value : selected;
    result[`m_${role}_mode`] = room && selected.mode === 'inherit' ? 'inherit' : choice.mode;
    result[`m_${role}_text`] = choice?.text ?? '';
  }
  return result;
}
export function memoryDraftContent(local: Record<string, unknown>, room: boolean): MemorySettingsContent {
  const value = (key: string) => String(local[key] ?? '');
  const configuration: Record<string, unknown> = {};
  for (const [field, key] of [['responseGuidance', 'mGuidance'], ['automaticLearning', 'mAutomatic'], ['personalPreferences', 'mPersonal'], ['recallScope', 'mRecall']]) {
    const text = value(key);
    const inherited = key === 'mGuidance' ? value('mGuidanceMode') === 'inherit' : text === 'inherit';
    const typed = ['mAutomatic', 'mPersonal'].includes(key) ? text === 'true' : text;
    configuration[field] = room ? inherited ? { mode: 'inherit' } : { mode: 'override', value: typed } : typed;
  }
  const prompts = Object.fromEntries(memoryRoles.map(role => {
    const mode = value(`m_${role}_mode`);
    const choice = ['replace', 'append', 'template'].includes(mode) ? { mode, text: value(`m_${role}_text`) }
      : mode === 'preset' ? { mode, id: 'personal-preferences' } : { mode };
    return [role, room ? mode === 'inherit' ? { mode: 'inherit' } : { mode: 'override', value: choice } : choice];
  }));
  return { configuration: room ? { purpose: value('mPurpose'), overrides: configuration } : configuration, prompts };
}
export function describeMemoryPreview(effective: MemorySettingsPayload['effective']): string {
  const values = effective.configuration.values;
  return [
    `Automatic learning: ${values.automaticLearning ? 'On' : 'Off'}`,
    `Personal preferences: ${values.personalPreferences ? 'On' : 'Off'}`,
    `Source recall: ${values.recallScope === 'same-owner' ? 'Across your rooms' : 'This room only'}`,
    `Response guidance: ${values.responseGuidance || '(empty)'}`,
    ...memoryRoles.map(role => {
      const selected = effective.prompts.roles[role];
      return `\n${role === 'workingMemory' ? 'Personal memory template' : role[0].toUpperCase() + role.slice(1)} · ${selected.source === 'room' ? 'Room override' : 'App default'}\n${selected.text === undefined ? 'Mastra native default' : selected.text || '(intentionally empty)'}`;
    })
  ].join('\n');
}
