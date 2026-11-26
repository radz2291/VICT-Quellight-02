import type { DeskItem, DeskHistoryEntry, DeskAttention, DeskActionInput, DeskActionId, DeskMethodSettingsSnapshot, AppDeskMethodSettings, RoomDeskMethodSettings } from './desk-contracts';
import { storageRead, storageWrite } from './client';

export interface DeskList { items: DeskItem[]; nextCursor: string | null }
export interface DeskDetail { item: DeskItem; history: DeskHistoryEntry[] }
export type DeskSummary = Omit<DeskItem, 'body'> & { preview: string };
export function deskCardPreview(body: string) {
  const withoutHeadings = body.replace(/^#{1,6}[ \t]+[^\n]+$/gm, '').trim();
  const preview = withoutHeadings || body.trim().replace(/^#{1,6}[ \t]+/, '');
  return preview.split(/\n\s*\n/, 1)[0].slice(0, 200);
}
export type DeskRevisionSummary = Pick<DeskHistoryEntry, 'revision' | 'authorKind' | 'operation' | 'createdAt'>;
export interface DeskSummaryList { items: DeskSummary[]; nextCursor: string | null }
export interface DeskCurrent { item: DeskItem }
export interface DeskRevisionPage { history: DeskRevisionSummary[]; nextRevision: number | null }
export interface DeskRevisionDetail { revision: DeskHistoryEntry }
export interface DeskMethodSettings { snapshot: DeskMethodSettingsSnapshot; history: DeskMethodSettingsSnapshot[]; effective?: {enabled:boolean;prompt:string;revision:string;appRevision:number;roomRevision:number} }
export interface DeskMethodView { item:DeskItem|null; latestJob:{id:string;state:string;stage:string;code:string|null;createdAt:string;updatedAt:string}|null; activity:{id:string;jobId:string;stage:string;code:string|null;at:string}[] }
export function deskMethodDraft(snapshot: DeskMethodSettingsSnapshot) {
  if(snapshot.target==='room'){const content=snapshot.content as RoomDeskMethodSettings;return {dMethodEnabled:content.enabled,dMethodPromptMode:content.prompt.mode,dMethodPrompt:content.prompt.text,dMethodVersion:String(snapshot.revision)};}
  const content=snapshot.content as AppDeskMethodSettings;return {dMethodEnabled:content.enabled?'enabled':'disabled',dMethodPromptMode:'custom',dMethodPrompt:content.prompt,dMethodVersion:String(snapshot.revision)};
}
export function deskMethodContent(local:Record<string,unknown>,room:boolean):AppDeskMethodSettings|RoomDeskMethodSettings {
  return room?{enabled:local.dMethodEnabled as RoomDeskMethodSettings['enabled'],prompt:{mode:local.dMethodPromptMode as 'inherit'|'custom',text:String(local.dMethodPrompt)}}:{enabled:local.dMethodEnabled==='enabled',prompt:String(local.dMethodPrompt)};
}
export function describeMethodSettings(snapshot:DeskMethodSettingsSnapshot) {
  if(snapshot.target==='app'){const c=snapshot.content as AppDeskMethodSettings;return `Version ${snapshot.revision}\nLearning ${c.enabled?'on':'off'}\n\n${c.prompt}`;}
  const c=snapshot.content as RoomDeskMethodSettings;
  return `Version ${snapshot.revision}\nLearning: ${c.enabled==='inherit'?'Use app default':c.enabled==='enabled'?'On':'Off'}\nInstructions: ${c.prompt.mode==='inherit'?'Use app default':'Custom for this room'}${c.prompt.mode==='custom'?`\n\n${c.prompt.text}`:''}`;
}
export type DeskContext = { status: 'unavailable' } | { status: 'invalidated' } | { status: 'selected'; selection: { schema: string; roomId: string; authorityRevision: string; items: { id: string; revision: number; attention: DeskAttention; title: string; kind: string; status: string; body?: string }[]; text: string; digest: string }; reads: {invocationId:string;itemId:string;revision:number;title:string;at:string}[] };
export function describeDeskContext(value: DeskContext) {
  if (value.status === 'unavailable') return 'No Desk selection was recorded for this reply.';
  if (value.status === 'invalidated') return 'This earlier Desk selection is no longer available after memory care.';
  const selection=value.selection.items.map(item=>`${deskAttentionLabels[item.attention]} · ${item.title} · version ${item.revision}${item.kind?` · ${item.kind}`:''}${item.status?` · ${item.status}`:''}\n${item.attention==='carried'?item.body??'':'Index only; text is opened separately.'}`).join('\n\n');
  const opened=value.reads.map(item=>`${item.title} · version ${item.revision}\n${new Date(item.at).toLocaleString()}`).join('\n\n');
  return `Desk selected before this reply. Items listed Within reach were not opened by this selection. Later tool reads are separate.\n\n${selection || 'No Desk items were selected.'}\n\nItems opened during reply\n${opened || 'No confirmed individual items were opened.'}`;
}
export interface DeskDraft {
  title: string; body: string; kind: string; status: string; attention: DeskAttention;
  baseRevision: number; dirty: boolean;
}
export interface DeskPending { key: string; actionId: DeskActionId; input: DeskActionInput }
export const deskAttentionLabels: Record<DeskAttention, string> = { carried: 'Carried', 'within-reach': 'Within reach', 'put-away': 'Put away' };
export const deskDraftFields = ['dTitle', 'dBody', 'dKind', 'dStatus', 'dAttention'] as const;
export const deskStorageKey = (actor: string, room: string, item: string, type = 'draft') => `quellight:${actor}:desk:${room}:${item || 'new'}:${type}`;
export function newDeskDraft(item?: DeskItem): DeskDraft {
  return { title: item?.title ?? '', body: item?.body ?? '', kind: item?.kind ?? '', status: item?.status ?? '', attention: item?.attention ?? 'within-reach', baseRevision: item?.revision ?? 0, dirty: false };
}
export function deskLocalDraft(draft: DeskDraft) { return { dTitle: draft.title, dBody: draft.body, dKind: draft.kind, dStatus: draft.status, dAttention: draft.attention }; }
export function deskDraftFromLocal(local: Record<string, unknown>, baseRevision: number, dirty = true): DeskDraft {
  return { title: String(local.dTitle ?? ''), body: String(local.dBody ?? ''), kind: String(local.dKind ?? ''), status: String(local.dStatus ?? ''), attention: ['carried', 'put-away'].includes(String(local.dAttention)) ? local.dAttention as DeskAttention : 'within-reach', baseRevision, dirty };
}
export function loadDeskDraft(actor: string, room: string, item: string): DeskDraft | null {
  try {
    const value = JSON.parse(storageRead(deskStorageKey(actor, room, item)) ?? 'null');
    if (!value || !['title', 'body', 'kind', 'status'].every(key => typeof value[key] === 'string') || !Object.keys(deskAttentionLabels).includes(value.attention) || !Number.isSafeInteger(value.baseRevision) || value.baseRevision < 0 || typeof value.dirty !== 'boolean') return null;
    return value;
  } catch { return null; }
}
export function saveDeskDraft(actor: string, room: string, item: string, draft: DeskDraft | null) { storageWrite(deskStorageKey(actor, room, item), draft ? JSON.stringify(draft) : null); }
export function loadDeskPending(actor: string, room: string, item: string): DeskPending | null {
  try {
    const value = JSON.parse(storageRead(deskStorageKey(actor, room, item, 'pending')) ?? 'null');
    return value && typeof value.key === 'string' && typeof value.actionId === 'string' && value.actionId.startsWith('desk.') && value.input?.roomId === room && (value.input.itemId ?? '') === item ? value : null;
  } catch { return null; }
}
export function saveDeskPending(actor: string, room: string, item: string, pending: DeskPending | null) { storageWrite(deskStorageKey(actor, room, item, 'pending'), pending ? JSON.stringify(pending) : null); }
export function deskSaveInput(roomId: string, itemId: string, draft: DeskDraft): DeskActionInput {
  const { title, body, kind, status, attention } = draft;
  return { roomId, ...(itemId ? { itemId, expectedRevision: draft.baseRevision } : {}), title, body, kind, status, attention };
}
