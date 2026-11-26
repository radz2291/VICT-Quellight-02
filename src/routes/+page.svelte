<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { goto, beforeNavigate, afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { ControlScope, DocumentHost, type ActionResult } from '@victframework/ui-svelte';
  import type { UiValue } from '@victframework/ui';
  import { document, descriptors, implementations, view as initialView, requireRenderPlan } from '$lib/product/definition';
  import { memoryRoles, memoryDraft, memoryDraftContent, describeMemoryPreview, type MemorySummary, type MemoryVersion, type MemorySourcesPage, type MemoryReplyPage, type MemoryContextResult, type MemoryObservationHistory, type MemorySettingsPayload } from '$lib/product/memory-client';
  import { deskAttentionLabels, deskDraftFields, newDeskDraft, deskLocalDraft, deskDraftFromLocal, loadDeskDraft, saveDeskDraft as persistDeskDraft, loadDeskPending, saveDeskPending, deskSaveInput, describeDeskContext, deskMethodDraft, deskMethodContent, describeMethodSettings, type DeskMethodSettings, type DeskMethodView, type DeskContext, type DeskSummaryList, type DeskSummary, type DeskCurrent, type DeskRevisionSummary, type DeskRevisionPage, type DeskRevisionDetail, type DeskDraft, type DeskPending } from '$lib/product/desk-client';
  import type { DeskItem, DeskActionId, DeskActionInput, DeskMethodSettingsActionId, DeskMethodSettingsInput } from '$lib/product/desk-contracts';
  import { request, RequestError, terminal, storageRead, storageWrite, draftKey, pendingKey, clearActorStorage, delayObservation, readPendingSend, followTurn,
    type Bootstrap, type Room, type Conversation, type Message, type Turn, type Detail, type Observation, type AcceptedTurn, type PendingSend } from '$lib/product/client';

  const plan = requireRenderPlan();
  let data = $state<Bootstrap | null>(null);
  let roomId = $state('');
  let conversationId = $state('');
  let messages = $state<Message[]>([]);
  let activeTurn = $state<Turn | null>(null);
  let streamed = $state('');
  let olderCursor = $state<string | null>(null);
  let unresolvedSend = $state<PendingSend | null>(null);
  let sending = $state<Record<string, PendingSend | undefined>>({});
  let stoppingTurn = $state('');
  let loading = $state(true);
  let cachedTranscript = $state(false);
  let currentDetailKnown = $state(false);
  const recentTranscripts = new Map<string, Message[]>();
  let pending = $state(false);
  let error = $state('');
  let statusText = $state('');
  let local = $state<Record<string, UiValue>>(Object.fromEntries(Object.values(document.localState ?? {}).map(value => [value.key, value.initial])));
  let alive = true;
  let selectionVersion = 0;
  let selectionIntent = 0;
  let workspaceVersion = 0;
  let observer: AbortController | undefined;
  let selectionRequest: AbortController | undefined;
  let historyRequest: AbortController | undefined;
  let pendingMutation: { signature: string; key: string } | undefined;
  type NewChatDraft = { key: string; roomId: string; text: string };
  let newChat = $state<NewChatDraft | null>(null);
  let newChatWaiting = $state(false);
  let arrivingChat: { id: string; draftKey: string; empty: boolean } | undefined;
  const creating = new Set<string>();
  let memoryData = $state<MemorySummary | null>(null);
  let memoryLoading = $state(false);
  let memorySourcesLoaded = $state(false);
  let memorySourcesCursor = $state<string | null>(null);
  let memorySourcesLoading = $state(false);
  let memoryDetailVersion = 0;
  let selectedSources = $state<string[]>([]);
  let memoryCareStatus = $state('');
  let memoryCareRevision = $state('');
  let memoryConflict = $state(false);
  let memoryConnectionMessage = $state('');
  let memoryReadController: AbortController | undefined;
  let memorySettings = $state<MemorySettingsPayload | null>(null);
  let memorySettingsLoading = $state(false);
  let memorySettingsStatus = $state('');
  let memoryPreviewText = $state('');
  let memoryRequestVersion = 0;
  let settingsRequestVersion = 0;
  let settingsTargetKey = '';
  let deskItems = $state<DeskSummary[]>([]);
  let deskDetail = $state<DeskCurrent | null>(null);
  let deskArrival: DeskItem | undefined;
  let deskListReady = false;
  let deskListedQuery = '';
  let deskHistory = $state<DeskRevisionSummary[]>([]);
  let deskNextRevision = $state<number | null>(null);
  let deskHistoryLoading = $state(false);
  let deskDraft = $state<DeskDraft>(newDeskDraft());
  let deskPending = $state<DeskPending | null>(null);
  let deskLoading = $state(false);
  let deskListLoading = $state(false);
  let deskStatus = $state('');
  let deskConflict = $state(false);
  let deskCursor = $state<string | null>(null);
  let deskHistoryText = $state('Choose a saved version to read it.');
  let deskContextText = $state('Choose a reply, then open its recorded Desk context.');
  let deskKey = '', deskRoom = '', deskItem = '';
  let deskReadVersion = 0, deskListVersion = 0;
  let methodSettings = $state<DeskMethodSettings | null>(null), methodView = $state<DeskMethodView | null>(null);
  let methodLoading = $state(false), methodDirty = $state(false), methodConflict = $state(false), methodStatus = $state(''), methodHistoryText = $state('Choose a saved settings version.');
  let methodBaseRevision = $state(0), methodPending = $state<{key:string;actionId:DeskMethodSettingsActionId;input:DeskMethodSettingsInput}|null>(null);
  let methodKey = '', methodReadVersion = 0;
  const memoryIsOpen = $derived(Boolean(local.memoryOpen));
  $effect(() => {
    const open = memoryIsOpen, selectedConversation = conversationId;
    if (!open || !selectedConversation) return;
    const controller = new AbortController();
    untrack(() => { void watchMemory(controller, selectedConversation); });
    return () => { controller.abort(); memoryReadController?.abort(); ++memoryRequestVersion; };
  });
  const currentRoom = $derived(data?.rooms.find(room => room.id === roomId));
  const currentConversation = $derived(data?.conversations.find(item => item.id === conversationId));
  const roomDetails = $derived(!!currentRoom && !currentRoom.archivedAt && page.url.searchParams.get('view') === 'room-details');
  const memoryDefaults = $derived(page.url.searchParams.get('view') === 'memory-defaults');
  const deskOpen = $derived(!!currentRoom && page.url.searchParams.get('view') === 'desk');
  const deskSelected = $derived(deskOpen ? page.url.searchParams.get('item') ?? '' : '');
  const deskMethodOpen = $derived(['desk-method','desk-defaults'].includes(page.url.searchParams.get('view') ?? ''));
  const deskMethodRoom = $derived(page.url.searchParams.get('view') === 'desk-method');
  $effect(() => {
    const key = deskMethodOpen ? deskMethodRoom ? `room:${roomId}` : 'app' : '';
    if (key === methodKey) return;
    methodKey = key;
    untrack(() => { ++methodReadVersion; if (key) void loadMethodSettings(); });
  });
  $effect(() => {
    const key = deskOpen ? `${roomId}:${deskSelected}` : '';
    if (key === deskKey) return;
    deskKey = key;
    untrack(() => {
      saveDeskDraft(); ++deskReadVersion;
      if (key) void openDeskSelection(roomId, deskSelected);
      else { deskListReady = false; deskListLoading = false; ++deskListVersion; }
    });
  });
  const deskHasDetail = $derived(deskOpen && !!deskSelected && !deskLoading && (deskSelected === 'new' || !!deskDetail));
  const deskArchivedItem = $derived(!!deskDetail?.item.archivedAt);
  const deskReadOnly = $derived(pending || deskLoading || deskArchivedItem || !!currentRoom?.archivedAt || !!deskPending);
  const deskCannotMutate = $derived(pending || deskLoading || deskConflict || !!currentRoom?.archivedAt || !!deskPending || deskDraft.dirty);
  $effect(() => {
    const key = roomDetails ? `room:${roomId}` : memoryDefaults ? 'app' : '';
    if (key === settingsTargetKey) return;
    settingsTargetKey = key;
    untrack(() => { if (key) void loadMemorySettings(key.startsWith('room:') ? 'room' : 'app'); });
  });
  let detailsRoomId = '';
  $effect(() => {
    const next = roomDetails ? currentRoom : undefined;
    if ((next?.id ?? '') === detailsRoomId) return;
    detailsRoomId = next?.id ?? '';
    untrack(() => setLocal({ editedName: next?.name ?? '', archiveOpen: false }));
  });
  const busy = $derived(!!activeTurn && (!terminal(activeTurn.status) || !activeTurn.projectionSettled));
  const sendingAttempt = $derived(sending[conversationId]);
  const sendingMessage = $derived(sendingAttempt && !messages.some(message => message.requestKey === sendingAttempt?.key) ? sendingAttempt : null);
  const streamedMessageId = $derived(activeTurn ? `${activeTurn.id}:assistant` : '');
  const transcript = $derived(JSON.stringify({ version: 1, messages: [
    ...messages.filter(message => !streamed || message.id !== streamedMessageId).map(({ id, role, text }) => ({ id, role, text })),
    ...(sendingMessage ? [{ id: `sending-${sendingMessage.key}`, role: 'user', text: sendingMessage.text }] : []),
    ...(streamed && streamedMessageId ? [{ id: streamedMessageId, role: 'assistant', text: streamed }] : [])
  ] }));
  const visibleRooms = $derived((data?.rooms ?? []).filter(room => Boolean(room.archivedAt) === Boolean(local.showArchived)));
  const memorySnapshot = $derived(roomDetails ? memorySettings?.room : memorySettings?.app);
  const memoryChanged = $derived(memoryConflict || (!!memoryCareRevision && !!memoryData && memoryData.authority.revision !== memoryCareRevision));
  const memoryHistory = $derived((roomDetails ? memorySettings?.roomHistory : memorySettings?.appHistory) ?? []);
  const memoryOptions = $derived.by(() => {
    const inherited = roomDetails ? [{ value: 'inherit', label: 'Use app default' }] : [];
    return {
      memoryBooleanOptions: [...inherited, { value: 'true', label: 'On' }, { value: 'false', label: 'Off' }],
      memoryRecallOptions: [...inherited, { value: 'current-room', label: 'This room only' }, { value: 'same-owner', label: 'Across your rooms' }],
      memoryOverrideOptions: [{ value: 'inherit', label: 'Use app default' }, { value: 'override', label: 'Set for this room' }],
      memoryHistoryOptions: memoryHistory.map(item => ({ value: String(item.revision), label: `Version ${item.revision}${item.revision === memorySnapshot?.revision ? ' · current' : ''}${item.createdAt ? ` · ${new Date(item.createdAt).toLocaleString()}` : ' · initial defaults'}` })),
      ...Object.fromEntries(memoryRoles.map(role => [`memory_${role}_options`, [...inherited, ...(role === 'conversation'
        ? [{ value: 'catalog', label: 'Quellight default' }, { value: 'replace', label: 'Custom instructions' }]
        : role === 'workingMemory' ? [{ value: 'preset', label: 'Quellight · personal preferences' }, { value: 'native-default', label: 'Mastra native template' }, { value: 'template', label: 'Custom template' }]
        : [{ value: 'native-default', label: 'Mastra native default' }, { value: 'append', label: 'Add custom instructions' }])]])),
      ...Object.fromEntries(memoryRoles.map(role => [`memory_${role}_custom`, ['replace', 'append', 'template'].includes(String(local[`m_${role}_mode`]))]))
    };
  });
  const view = $derived({ ...initialView,
    deskOpen: deskOpen && !newChat, deskHasDetail, deskLoading, deskStatus, deskContextText, deskCannotContext: pending || !conversationId || !local.memoryReply,
    deskMethodOpen: deskMethodOpen && !newChat, deskMethodRoom, deskHasMethodItem: !!methodView?.item, deskMethodLoading: methodLoading, deskMethodReady: !!methodSettings && !methodLoading,
    deskMethodCustom: !deskMethodRoom || local.dMethodPromptMode === 'custom', deskMethodReadOnly: pending || !!methodPending || (deskMethodRoom && !!currentRoom?.archivedAt),
    deskMethodCannotSave: pending || methodLoading || !!methodPending || methodConflict || !methodDirty || (deskMethodRoom && !!currentRoom?.archivedAt) || ((!deskMethodRoom || local.dMethodPromptMode === 'custom') && !String(local.dMethodPrompt).trim()),
    deskMethodCannotRestore: pending || methodLoading || !!methodPending || methodConflict || methodDirty || !methodSettings?.history.some(h => h.revision === Number(local.dMethodVersion)) || Number(local.dMethodVersion) === methodSettings?.snapshot.revision || (deskMethodRoom && !!currentRoom?.archivedAt),
    deskMethodUncertain: !!methodPending, deskMethodConflict: methodConflict, deskMethodStatus: methodStatus,
    deskMethodTitle: deskMethodRoom ? 'Room method' : 'Desk defaults',
    deskMethodIntro: deskMethodRoom ? 'A short guide to how we work together in this room. Quellight can refine it after creating useful Desk items.' : 'Defaults for learning a working method in each room. Existing room overrides are preserved.',
    deskMethodText: methodLoading ? 'Opening saved method…' : methodView ? methodView.item?.body || 'No working method has been saved for this room yet.' : 'The saved method is unavailable. Reopen this view to try again.',
    deskMethodActivityText: methodView ? methodView.activity.map(event => `${event.stage.replaceAll('-', ' ')}${event.code ? ' · Needs attention' : ''}\n${new Date(event.at).toLocaleString()}`).join('\n\n') || 'No method activity is recorded yet.' : 'Opening saved method activity…',
    deskMethodEffectiveText: methodSettings ? `Saved version ${methodSettings.snapshot.revision}${methodSettings.effective ? ` · Learning ${methodSettings.effective.enabled ? 'on' : 'off'}` : ''}. These settings guide the room method.` : '',
    deskMethodHistoryText: methodHistoryText,
    deskMethodEnabledOptions: [...(deskMethodRoom ? [{value:'inherit',label:'Use app default'}] : []),{value:'enabled',label:'On'},{value:'disabled',label:'Off'}],
    deskMethodPromptOptions: [{value:'inherit',label:'Use app default'},{value:'custom',label:'Custom instructions for this room'}],
    deskMethodHistoryOptions: (methodSettings?.history ?? []).map(h => ({value:String(h.revision),label:`Version ${h.revision}${h.createdAt ? ` · ${new Date(h.createdAt).toLocaleString()}` : ' · Initial defaults'}`})),
    deskItems: deskItems.map(item => ({ id: item.id, label: `${item.title}\n${item.isMethod ? 'Room method · ' : ''}${deskAttentionLabels[item.attention]}${item.kind ? ` · ${item.kind}` : ''}${item.status ? ` · ${item.status}` : ''}`, selected: item.id === deskSelected })),
    deskEmpty: !deskLoading && deskItems.length === 0, deskEmptyText: deskListLoading ? 'Opening Desk…' : local.dSearch || local.dFilter !== 'all' ? 'No items match this search.' : local.dArchived ? 'No archived items.' : 'No items yet. Create something worth keeping.',
    deskHasMore: !!deskCursor, deskConflict, deskUncertain: !!deskPending, deskReadOnly, deskArchivedItem,
    deskExisting: !!deskDetail, deskEditing: deskHasDetail && !local.dPreview && !deskArchivedItem,
    deskPreview: deskHasDetail && (!!local.dPreview || deskArchivedItem), deskCanEdit: !deskArchivedItem && !currentRoom?.archivedAt,
    deskCanArchive: !!deskDetail && !deskArchivedItem && !currentRoom?.archivedAt,
    deskCannotCreate: pending || !!currentRoom?.archivedAt, deskCannotMutate,
    deskCannotSave: deskReadOnly || deskConflict || !deskDraft.dirty || !String(local.dTitle).trim() || String(local.dTitle).length > 200,
    deskCannotRestoreVersion: deskCannotMutate || deskArchivedItem || !deskHistory.some(h => h.revision === Number(local.dHistory)) || Number(local.dHistory) === deskDetail?.item.revision,
    deskRevisionLabel: deskDetail ? `Version ${deskDetail.item.revision} · ${new Date(deskDetail.item.updatedAt).toLocaleString()}${deskArchivedItem ? ' · Archived' : ''}${deskDraft.dirty ? ' · Unsaved draft' : ''}` : 'New item · saved in this room when you choose Save item',
    deskPreviewLabel: local.dPreview ? 'Edit text' : 'Preview', deskHistoryText: deskHistoryLoading ? 'Opening saved versions…' : deskHistoryText, deskMoreVersions: deskNextRevision !== null,
    deskAttentionOptions: Object.entries(deskAttentionLabels).map(([value, label]) => ({ value, label })),
    deskFilterOptions: [{ value: 'all', label: 'All attention levels' }, ...Object.entries(deskAttentionLabels).map(([value, label]) => ({ value, label }))],
    deskHistoryOptions: deskHistory.map(h => ({ value: String(h.revision), label: `Version ${h.revision} · ${h.authorKind === 'owner' ? 'You' : h.authorKind === 'method' ? 'Learned method' : 'Quellight'} · ${new Date(h.createdAt).toLocaleString()}` })),
    ...memoryOptions, memoryIsRoom: roomDetails, memorySettingsLoading,
    hasMemorySettings: !!memorySnapshot && !memorySettingsLoading,
    memoryTarget: roomDetails ? 'room' : 'app', memorySettingsRoomId: roomDetails ? roomId : '',
    memorySettingsRevision: memorySnapshot?.revision ?? 0, memoryRestoreRevision: Number(local.mRestore) || 0,
    memoryCannotRestore: pending || memorySettingsLoading || !memorySnapshot || Number(local.mRestore) === memorySnapshot.revision || !memoryHistory.some(item => item.revision === Number(local.mRestore)),
    memoryDraftJson: JSON.stringify(memoryDraftContent(local, roomDetails)),
    memorySettingsTitle: roomDetails ? 'Memory in this room' : 'Memory defaults',
    memorySettingsIntro: roomDetails ? 'Use app defaults, or make this room different. Home follows the same rules as every room.' : 'Defaults for every room. Existing room overrides are preserved.',
    memorySettingsStatus, memoryPreviewText, hasMemoryPreview: !!memoryPreviewText,
    memoryGuidanceCustom: !roomDetails || local.mGuidanceMode === 'override',
    memoryRevisionLabel: memorySnapshot ? `Saved version ${memorySnapshot.revision}. Restoring creates a new version and keeps this history.` : '',
    memoryStatusLabel: memoryConnectionMessage || (memoryLoading ? 'Opening saved memory…' : memoryData?.statusLabel ?? 'Memory has not been opened.'),
    memoryObservationText: memoryData?.observations.text || memoryData?.observations.emptyText || 'No saved observations yet.',
    memoryObservationHistory: memoryData?.observations.history.map(item => `${item.updatedAt ? new Date(item.updatedAt).toLocaleString() + '\n' : ''}${item.text}`).join('\n\n—\n\n') || 'No earlier observations are available.',
    memoryPreparedText: memoryData?.observations.prepared.map(item => item.text).join('\n\n') || 'No prepared observations are recorded.',
    memoryPersonalText: memoryData?.personal.text || 'No personal preferences have been saved yet.',
    memoryPersonalHelp: memoryData?.personal.enabled === false ? 'Personal memory is not used in this room.' : memoryData?.personal.ownerManaged ? 'Your edited personal memory is kept as written. Observations continue to update automatically.' : 'Preferences shared across your rooms. Room instructions remain separate.',
    memoryOwnerManaged: memoryData?.personal.ownerManaged ?? false,
    memoryActivityText: memoryData?.activity.map(item => `${item.label} · ${item.status}${item.at ? '\n' + new Date(item.at).toLocaleString() : ''}`).join('\n\n') || 'No memory activity is recorded yet.',
    memorySources: (memoryData?.sources ?? []).map(source => ({ ...source, label: `${source.label}${source.excluded ? ' · excluded from memory' : ''}`, selected: selectedSources.includes(source.id) })),
    memorySourceStatus: memorySourcesLoading ? 'Opening original sources…' : selectedSources.length ? `${selectedSources.length} source${selectedSources.length === 1 ? '' : 's'} selected.` : memoryData?.sources.length ? 'No sources selected.' : memorySourcesLoaded ? 'No original sources are available.' : 'Open this section to read saved sources.',
    memoryMoreSources: !!memorySourcesCursor, memoryMoreReplies: !!memoryData?.repliesCursor,
    memoryReplyOptions: (memoryData?.replies ?? []).map(reply => ({ value: reply.turnId, label: reply.label })),
    memoryContextText: memoryData?.context ? `${memoryData.context.text}\n\n${memoryData.context.revisionLabel}\nOmitted: ${memoryData.context.omissions.join(', ')}.` : 'Choose a reply with a recorded memory context.',
    memoryAuthorityRevision: memoryCareRevision, memorySelectedSources: JSON.stringify(selectedSources), memoryCareStatus, memoryChanged,
    memoryCannotCorrect: pending || memoryLoading || memoryChanged || !memoryData?.controls.canCorrect,
    memoryCannotForget: pending || memoryLoading || memoryChanged || !memoryData?.controls.canForget || !selectedSources.length,
    memoryCanRetry: memoryData?.controls.canRetry ?? false, memoryCannotRetry: pending || memoryLoading || memoryChanged || !memoryData?.controls.canRetry,
    rooms: visibleRooms.map(room => ({ id: room.id, name: room.name, selected: room.id === roomId })),
    conversations: (data?.conversations ?? []).filter(item => item.roomId === roomId).map(item => ({ id: item.id, title: item.title, selected: item.id === conversationId && !deskOpen && !newChat })),
    roomId, roomName: currentRoom?.name ?? 'Your space', roomPurpose: currentRoom?.archivedAt ? 'Archived room' : (currentRoom?.purpose ?? ''), roomRevision: currentRoom?.revision ?? 1,
    conversationId: newChat ? '' : conversationId, conversationTitle: currentConversation?.title ?? 'New conversation', turnId: activeTurn?.id ?? '',
    composerText: newChat?.text ?? String(local.draft ?? ''), newChatWaiting,
    transcript: newChat ? initialView.transcript : transcript, busy: !newChat && (busy || !!sendingAttempt), pending,
    hasOlder: !newChat && !!olderCursor,
    canRetrySend: !newChat && currentDetailKnown && !!unresolvedSend && !busy && !sendingAttempt && !loading && !currentRoom?.archivedAt,
    canSend: !newChat && currentDetailKnown && !!conversationId && !loading && !busy && !sendingAttempt && !unresolvedSend && !currentRoom?.archivedAt,
    canStop: !newChat && !!activeTurn && !terminal(activeTurn.status) && stoppingTurn !== activeTurn.id,
    loading: !newChat && loading && !cachedTranscript, error, hasError: !!error, ready: !!data && !loading,
    hasConversation: !!newChat || (!!conversationId && (!loading || cachedTranscript)), hasMoreActions: !newChat && !deskMethodOpen && !deskOpen && !memoryDefaults && !roomDetails && !loading && (!!conversationId || (!!currentRoom && !currentRoom.archivedAt)),
    roomDetails: roomDetails && !newChat, memoryDefaults: memoryDefaults && !newChat,
    headerTitle: newChat ? 'New conversation' : deskMethodOpen ? deskMethodRoom ? `${currentRoom?.name ?? 'Your space'} · Room method` : 'Desk defaults' : deskOpen ? `${currentRoom?.name ?? 'Your space'} · Desk` : memoryDefaults ? 'Memory defaults' : roomDetails ? currentRoom?.name ?? 'Your space' : currentConversation?.title ?? currentRoom?.name ?? 'Your space',
    roomDetailsBackLabel: conversationId ? 'Back to conversation' : 'Back to room',
    activeRoom: !!currentRoom && !currentRoom.archivedAt, hasRoom: !!currentRoom,
    emptyRooms: visibleRooms.length === 0, roomsEmptyText: local.showArchived ? 'No archived rooms.' : 'Create a room to begin.',
    statusText: newChat ? newChatWaiting ? 'Opening conversation…' : 'Your draft is kept. Choose New conversation to retry.' : cachedTranscript && loading ? 'Checking for new messages…' : sendingMessage ? 'Sending…' : busy ? (activeTurn && terminal(activeTurn.status) ? 'Saving the response…' : stoppingTurn || statusText === 'Stopping…' ? 'Stopping…' : streamed ? 'Writing…' : 'Thinking… You can leave and come back.') : (currentRoom?.archivedAt ? 'This room is archived.' : unresolvedSend ? 'Delivery is unconfirmed. Your message is kept here.' : statusText)
  });

  function setLocal(values: Record<string, UiValue>) { local = { ...local, ...values }; }
  function saveDraft() {
    if (data && conversationId) storageWrite(draftKey(data.user.id, conversationId), String(local.draft ?? ''));
  }
  function onStateChange(key: string, value: UiValue) {
    if (key === 'draft' && newChat && data) {
      newChat.text = String(value);
      storeNewChat(data.user.id, newChat.roomId, newChat);
      return;
    }
    setLocal({ [key]: value });
    if ((deskDraftFields as readonly string[]).includes(key)) { deskDraft = deskDraftFromLocal(local, deskDraft.baseRevision); saveDeskDraft(); deskStatus = String(local.dTitle).length > 200 ? 'Item titles can be up to 200 characters. Your draft is kept.' : 'Unsaved changes'; }
    if (key === 'dFilter' || key === 'dArchived') void loadDeskList();
    if (key === 'deskHistoryOpen' && value && !deskHistory.length) void loadDeskHistory();
    if (key === 'memoryReply') {
      deskContextText = 'Open the recorded Desk context for this reply.';
      if (memoryData?.context) memoryData = { ...memoryData, context: null };
    }
    if (key === 'memorySourcesOpen' && value && !memorySourcesLoaded) void loadMemorySources();
    if (key === 'memoryHistoryOpen' && value && memoryData?.moreObservations) void loadEarlierObservations();
    if (['dMethodEnabled','dMethodPromptMode','dMethodPrompt'].includes(key)) {
      methodDirty = true; methodStatus = 'Unsaved settings';
      storageWrite(methodStorageKey('draft'), JSON.stringify({revision:methodBaseRevision,values:{dMethodEnabled:local.dMethodEnabled,dMethodPromptMode:local.dMethodPromptMode,dMethodPrompt:local.dMethodPrompt}}));
    }
    if (key.startsWith('m_') || key.startsWith('mGuidance') || ['mPurpose', 'mAutomatic', 'mPersonal', 'mRecall'].includes(key)) { memoryPreviewText = ''; memorySettingsStatus = 'Unsaved changes'; }
    if (key === 'draft') saveDraft();
    if (key === 'dark') storageWrite('quellight:appearance', value ? 'dark' : 'light');
  }
  function dismissEditors() { setLocal({ newRoomOpen: false, archiveOpen: false, navigationOpen: false, moreOpen: false, settingsOpen: false, mobileSettingsOpen: false, memoryOpen: false, memoryForgetOpen: false }); }
  function methodStorageKey(kind: string) { return `quellight:${data?.user.id}:desk-method:${deskMethodRoom ? roomId : 'app'}:${kind}`; }
  async function loadMethodSettings(replaceDraft = false, includeMethod = true) {
    const key = methodKey, version = ++methodReadVersion, selectedRoom = deskMethodRoom ? roomId : '';
    methodLoading = true; methodSettings = null; if (includeMethod) methodView = null;
    methodConflict = false; methodStatus = ''; methodDirty = false; methodPending = null; methodHistoryText = 'Choose a saved settings version.';
    try {
      const [settings, savedMethod] = await Promise.all([request<DeskMethodSettings>(`/api/desk/method-settings${selectedRoom ? `?roomId=${encodeURIComponent(selectedRoom)}` : ''}`), includeMethod && selectedRoom ? request<DeskMethodView>(`/api/rooms/${selectedRoom}/desk/method`) : Promise.resolve(null)]);
      if (!alive || key !== methodKey || version !== methodReadVersion) return;
      methodSettings = settings; if (includeMethod) methodView = savedMethod;
      methodBaseRevision = settings.snapshot.revision;
      setLocal({...deskMethodDraft(settings.snapshot),deskMethodReloadOpen:false,deskMethodRestoreOpen:false});
      if (replaceDraft) storageWrite(methodStorageKey('draft'),null);
      else try {
        const draft=JSON.parse(storageRead(methodStorageKey('draft')) ?? 'null');
        if(draft && Number.isSafeInteger(draft.revision) && ['dMethodEnabled','dMethodPromptMode','dMethodPrompt'].every(k=>typeof draft.values?.[k]==='string')) {methodBaseRevision=draft.revision;methodDirty=true;methodConflict=draft.revision!==settings.snapshot.revision;setLocal(draft.values);}
      } catch { /* Malformed device drafts do not change server authority. */ }
      try { const prior=JSON.parse(storageRead(methodStorageKey('pending'))??'null');if(prior&&['desk.method.settings.save','desk.method.settings.restore'].includes(prior.actionId)&&typeof prior.key==='string'&&prior.input?.roomId===selectedRoom&&prior.input?.target===(selectedRoom?'room':'app'))methodPending=prior; } catch { /* Server validates every mutation independently. */ }
      methodStatus=methodPending?'An earlier settings change needs its result checked.':methodDirty?'Your local settings draft is restored.':`Saved version ${settings.snapshot.revision}`;
    } catch(cause){if(alive&&key===methodKey&&version===methodReadVersion)failure(cause);}
    finally{if(alive&&version===methodReadVersion)methodLoading=false;}
  }
  async function changeMethodSettings(actionId?:DeskMethodSettingsActionId):Promise<ActionResult>{
    if(!methodSettings)throw new Error('Open method settings first.');
    const selectedKey=methodKey,pendingStorageKey=methodStorageKey('pending'),draftStorageKey=methodStorageKey('draft');
    let attempt=methodPending;
    if(!attempt){if(!actionId)throw new Error('There is no interrupted settings change.');attempt={key:crypto.randomUUID(),actionId,input:{target:deskMethodRoom?'room':'app',roomId:deskMethodRoom?roomId:'',expectedRevision:methodBaseRevision,...(actionId.endsWith('.save')?{content:JSON.stringify(deskMethodContent(local,deskMethodRoom))}:{restoreRevision:Number(local.dMethodVersion)})}};methodPending=attempt;storageWrite(pendingStorageKey,JSON.stringify(attempt));}
    try{await request('/api/actions',{actionId:attempt.actionId,input:attempt.input,idempotencyKey:attempt.key});}
    catch(cause){if(cause instanceof RequestError&&!cause.uncertain){storageWrite(pendingStorageKey,null);if(alive&&selectedKey===methodKey){methodPending=null;if(cause.status===409)methodConflict=true;}}throw cause;}
    storageWrite(pendingStorageKey,null);storageWrite(draftStorageKey,null);
    if(!alive||selectedKey!==methodKey)return{ok:true,message:''};
    methodPending=null;methodDirty=false;
    await loadMethodSettings(true, false);methodStatus='Method settings saved. The current learned method is kept.';return{ok:true,message:''};
  }
  function saveDeskDraft() {
    if (data && deskRoom && deskItem && deskDraft.dirty) persistDeskDraft(data.user.id, deskRoom, deskItem === 'new' ? '' : deskItem, deskDraft);
  }
  async function navigateDesk(item = '', close = false) {
    saveDraft(); saveDeskDraft(); dismissEditors();
    const url = new URL(page.url);
    if (close) { url.searchParams.delete('view'); url.searchParams.delete('item'); }
    else { url.searchParams.set('view', 'desk'); url.searchParams.set('room', roomId); if (item) url.searchParams.set('item', item); else url.searchParams.delete('item'); }
    await goto(url, { noScroll: true });
  }
  async function loadDeskList(more = false) {
    if (!roomId) return;
    const selectedRoom = roomId, version = ++deskListVersion;
    deskListLoading = true;
    const params = new URLSearchParams({ view: 'summary', query: String(local.dSearch), archived: String(!!local.dArchived) });
    if (local.dFilter !== 'all') params.set('attention', String(local.dFilter));
    if (more && deskCursor) params.set('cursor', deskCursor);
    try {
      const result = await request<DeskSummaryList>(`/api/rooms/${selectedRoom}/desk?${params}`);
      if (!alive || selectedRoom !== roomId || version !== deskListVersion) return;
      deskItems = more ? [...deskItems, ...result.items.filter(item => !deskItems.some(old => old.id === item.id))] : result.items;
      deskCursor = result.nextCursor;
      deskListReady = true;
      deskListedQuery = params.get('query') ?? '';
    } catch (cause) { if (alive && selectedRoom === roomId && version === deskListVersion) failure(cause); }
    finally { if (alive && version === deskListVersion) deskListLoading = false; }
  }
  async function openDeskSelection(selectedRoom: string, selectedItem: string, replaceDraft = false) {
    const version = ++deskReadVersion;
    const changedRoom = deskRoom !== selectedRoom;
    deskRoom = selectedRoom; deskItem = selectedItem; deskLoading = !!selectedItem; deskDetail = null; deskDraft = newDeskDraft(); deskPending = null; deskStatus = ''; deskConflict = false;
    deskHistoryText = 'Choose a saved version to read it.';
    deskHistory = []; deskNextRevision = null; deskHistoryLoading = false;
    setLocal({ dPreview: false, deskHistoryOpen: false, deskMetadataOpen: false, deskArchiveOpen: false, deskReloadOpen: false, deskRestoreVersionOpen: false });
    if (changedRoom) {
      ++deskListVersion; deskItems = []; deskCursor = null; deskListReady = false; deskListLoading = false; deskListedQuery = '';
      setLocal({ dSearch: '', dFilter: 'all', dArchived: false });
    }
    if (!deskListReady && !deskListLoading) void loadDeskList();
    if (!selectedItem || !data) { deskLoading = false; return; }
    try {
      const received = deskArrival?.id === selectedItem ? deskArrival : undefined;
      if (received) deskArrival = undefined;
      const result = selectedItem === 'new' ? null : received ? { item: received } : await request<DeskCurrent>(`/api/rooms/${selectedRoom}/desk/${selectedItem}?view=current`);
      if (!alive || version !== deskReadVersion || selectedRoom !== roomId) return;
      deskDetail = result;
      const stored = replaceDraft ? null : loadDeskDraft(data.user.id, selectedRoom, selectedItem === 'new' ? '' : selectedItem);
      deskDraft = stored?.dirty ? stored : newDeskDraft(result?.item);
      deskPending = loadDeskPending(data.user.id, selectedRoom, selectedItem === 'new' ? '' : selectedItem);
      deskConflict = !!result && deskDraft.dirty && deskDraft.baseRevision !== result.item.revision;
      if (replaceDraft) persistDeskDraft(data.user.id, selectedRoom, selectedItem, null);
      setLocal({ ...deskLocalDraft(deskDraft), dHistory: String(result?.item.revision ?? '') });
      deskStatus = deskPending ? 'A previous change needs its saved result checked.' : deskDraft.dirty ? 'Your local draft is restored.' : received ? 'Saved' : result ? 'Saved item' : '';
    } catch (cause) { if (alive && version === deskReadVersion) failure(cause); }
    finally { if (alive && version === deskReadVersion) deskLoading = false; }
  }
  async function loadDeskHistory(more = false) {
    if (!deskDetail || deskHistoryLoading || (more && deskNextRevision === null)) return;
    const version = deskReadVersion, id = deskDetail.item.id;
    deskHistoryLoading = true;
    try {
      const page = await request<DeskRevisionPage>(`/api/rooms/${roomId}/desk/${id}?view=history${more ? `&beforeRevision=${deskNextRevision}` : ''}`);
      if (version !== deskReadVersion || id !== deskDetail?.item.id) return;
      deskHistory = more ? [...deskHistory, ...page.history] : page.history;
      deskNextRevision = page.nextRevision;
    } catch (cause) { if (version === deskReadVersion) failure(cause); }
    finally { if (version === deskReadVersion) deskHistoryLoading = false; }
  }
  async function showDeskRevision() {
    const id = deskDetail?.item.id, revision = Number(local.dHistory), version = deskReadVersion;
    if (!id || !deskHistory.some(item => item.revision === revision)) return;
    const { revision: saved } = await request<DeskRevisionDetail>(`/api/rooms/${roomId}/desk/${id}?view=revision&revision=${revision}`);
    if (version !== deskReadVersion || revision !== Number(local.dHistory)) return;
    deskHistoryText = `Version ${saved.revision} · ${saved.operation}\n${saved.title}\n${deskAttentionLabels[saved.attention]}${saved.kind ? ` · ${saved.kind}` : ''}${saved.status ? ` · ${saved.status}` : ''}\n\n${saved.body}`;
  }
  async function mutateDesk(actionId?: DeskActionId): Promise<ActionResult> {
    if (!data || !deskHasDetail) throw new Error('Open a Desk item first.');
    const selectedRoom = roomId, selectedItem = deskSelected === 'new' ? '' : deskSelected, actor = data.user.id;
    let attempt = deskPending;
    if (!attempt) {
      if (!actionId) throw new Error('There is no interrupted change to retry.');
      const input: DeskActionInput = ['desk.create', 'desk.save'].includes(actionId) ? deskSaveInput(selectedRoom, selectedItem, deskDraft)
        : { roomId: selectedRoom, itemId: selectedItem, expectedRevision: deskDraft.baseRevision, ...(actionId === 'desk.restore-version' ? { restoreRevision: Number(local.dHistory) } : {}) };
      attempt = { key: crypto.randomUUID(), actionId, input };
      deskPending = attempt; saveDeskPending(actor, selectedRoom, selectedItem, attempt);
    }
    let result: { ok: true; value: { item: DeskItem } };
    try { result = await request('/api/actions', { actionId: attempt.actionId, input: attempt.input, idempotencyKey: attempt.key }); }
    catch (cause) {
      if (cause instanceof RequestError && !cause.uncertain) { saveDeskPending(actor, selectedRoom, selectedItem, null); if (alive && roomId === selectedRoom && (deskSelected === 'new' ? '' : deskSelected) === selectedItem) { deskPending = null; if (cause.status === 409) deskConflict = true; } }
      throw cause;
    }
    saveDeskPending(actor, selectedRoom, selectedItem, null); persistDeskDraft(actor, selectedRoom, selectedItem, null);
    if (!alive || !deskOpen || roomId !== selectedRoom || (deskSelected === 'new' ? '' : deskSelected) !== selectedItem) return { ok: true, message: '' };
    deskPending = null;
    const saved = result.value.item;
    const { body, ...summary } = saved;
    const query = deskListedQuery.toLowerCase();
    const visible = Boolean(saved.archivedAt) === Boolean(local.dArchived) &&
      (local.dFilter === 'all' || local.dFilter === saved.attention) &&
      (!query || `${saved.title}\n${body}\n${saved.kind}\n${saved.status}`.toLowerCase().includes(query));
    deskItems = [...(visible ? [summary] : []), ...deskItems.filter(item => item.id !== saved.id)];
    deskArrival = saved;
    try {
      if (saved.id !== deskSelected) await navigateDesk(saved.id);
      else await openDeskSelection(selectedRoom, saved.id, true);
      deskStatus = 'Saved';
    } catch { deskStatus = 'Your change was saved. Reopen this item to refresh it.'; return { ok: true, dataStale: true }; }
    return { ok: true, message: '' };
  }
  async function loadMemorySettings(target: 'app' | 'room') {
    const selectedRoom = target === 'room' ? roomId : '';
    const version = ++settingsRequestVersion;
    memorySettingsLoading = true; memorySettings = null; memoryPreviewText = ''; memorySettingsStatus = '';
    try {
      const result = await request<MemorySettingsPayload>(`/api/memory/settings${selectedRoom ? `?roomId=${encodeURIComponent(selectedRoom)}` : ''}`);
      if (!alive || version !== settingsRequestVersion || (selectedRoom && selectedRoom !== roomId)) return false;
      memorySettings = result;
      const snapshot = target === 'room' ? result.room : result.app;
      if (!snapshot) throw new Error('These room settings are unavailable.');
      const purpose = target === 'room' ? result.effective.configuration.purpose : '';
      const roomRevision = result.effective.versions?.roomRecordRevision;
      if (data && selectedRoom && roomRevision !== undefined && data.rooms.some(room => room.id === selectedRoom && room.revision <= roomRevision)) {
        data = { ...data, rooms: data.rooms.map(room => room.id === selectedRoom && room.revision <= roomRevision ? { ...room, purpose, revision: roomRevision } : room) };
        ++workspaceVersion;
      }
      setLocal({ ...memoryDraft(snapshot, target === 'room', purpose), mRestore: String(snapshot.revision) });
      memorySettingsStatus = `Saved version ${snapshot.revision}`;
      return true;
    } catch (cause) { if (alive && version === settingsRequestVersion) failure(cause); return false; }
    finally { if (alive && version === settingsRequestVersion) memorySettingsLoading = false; }
  }
  async function loadMemory(reset = false, background = false, signal?: AbortSignal) {
    const selectedConversation = conversationId, version = ++memoryRequestVersion;
    if (!background) memoryLoading = true;
    if (reset) { memoryData = null; memoryCareStatus = ''; memoryCareRevision = ''; memoryConflict = false; }
    memoryReadController?.abort(); memoryReadController = new AbortController();
    const readSignal = signal ? AbortSignal.any([signal, memoryReadController.signal]) : memoryReadController.signal;
    try {
      const result = await request<MemorySummary>(`/api/conversations/${selectedConversation}/memory?view=summary`, undefined, readSignal);
      if (!alive || readSignal.aborted || version !== memoryRequestVersion || selectedConversation !== conversationId) return false;
      if (memoryData && memoryData.authority.revision !== result.authority.revision) deskContextText = 'Memory care changed. Reopen the recorded Desk context to check its availability.';
      const previousReply = String(local.memoryReply ?? '');
      memoryData = result; memoryConnectionMessage = '';
      ++memoryDetailVersion;
      memorySourcesLoaded = false; memorySourcesLoading = false; memorySourcesCursor = null; selectedSources = [];
      if (reset) { memoryCareRevision = result.authority.revision; setLocal({ memoryProfileText: result.personal.text }); }
      setLocal({ memoryReply: result.replies.some(reply => reply.turnId === previousReply) ? previousReply : result.replies[0]?.turnId ?? '' });
      if (local.memorySourcesOpen) void loadMemorySources();
      if (local.memoryHistoryOpen && result.moreObservations) void loadEarlierObservations();
      return true;
    } catch (cause) {
      if (readSignal.aborted || !alive || version !== memoryRequestVersion) return false;
      if (background) memoryConnectionMessage = 'Connection interrupted. Reconnecting to saved memory…';
      else failure(cause);
      return false;
    }
    finally { if (alive && version === memoryRequestVersion && !background) memoryLoading = false; }
  }
  async function loadMemorySources(more = false) {
    if (!memoryData || memorySourcesLoading || (more && !memorySourcesCursor)) return;
    const version = memoryDetailVersion, chat = conversationId;
    const cursor = more ? `&cursor=${encodeURIComponent(memorySourcesCursor!)}` : '';
    memorySourcesLoading = true;
    try {
      const result = await request<MemorySourcesPage>(`/api/conversations/${chat}/memory?view=sources${cursor}`);
      if (version !== memoryDetailVersion || chat !== conversationId || !memoryData || !local.memoryOpen) return;
      if (result.authorityRevision !== memoryData.authority.revision) { void loadMemory(); return; }
      memoryData = { ...memoryData, sources: more ? [...memoryData.sources, ...result.sources] : result.sources };
      memorySourcesLoaded = true; memorySourcesCursor = result.nextCursor;
    } catch (cause) {
      if (version === memoryDetailVersion && chat === conversationId && local.memoryOpen) {
        if (cause instanceof RequestError && cause.status === 409) void loadMemory();
        else failure(cause);
      }
    } finally { if (version === memoryDetailVersion) memorySourcesLoading = false; }
  }
  async function loadEarlierObservations() {
    if (!memoryData?.moreObservations) return;
    const chat = conversationId, version = memoryDetailVersion;
    try {
      const result = await request<MemoryObservationHistory>(`/api/conversations/${chat}/memory?view=observations`);
      if (version === memoryDetailVersion && conversationId === chat && memoryData && local.memoryOpen && result.authorityRevision === memoryData.authority.revision) {
        memoryData = { ...memoryData, moreObservations: false, observations: { ...memoryData.observations, history: result.history } };
      }
    } catch (cause) { if (version === memoryDetailVersion && conversationId === chat && local.memoryOpen) failure(cause); }
  }
  async function loadMoreReplies() {
    const cursor = memoryData?.repliesCursor;
    if (!cursor) return;
    const chat = conversationId, version = memoryDetailVersion;
    const result = await request<MemoryReplyPage>(`/api/conversations/${chat}/memory?view=replies&cursor=${encodeURIComponent(cursor)}`);
    if (version === memoryDetailVersion && conversationId === chat && memoryData && local.memoryOpen) {
      memoryData = { ...memoryData, replies: [...memoryData.replies, ...result.replies], repliesCursor: result.nextCursor };
    }
  }
  async function loadMemoryContext() {
    const turn = String(local.memoryReply ?? ''), chat = conversationId, version = memoryDetailVersion;
    if (!turn) return;
    const result = await request<MemoryContextResult>(`/api/conversations/${chat}/memory?view=context&turnId=${encodeURIComponent(turn)}`);
    if (version === memoryDetailVersion && conversationId === chat && local.memoryReply === turn && memoryData && local.memoryOpen && result.authorityRevision === memoryData.authority.revision) {
      memoryData = { ...memoryData, context: result.context };
    }
  }
  async function watchMemory(controller: AbortController, selectedConversation: string) {
    while (alive && !controller.signal.aborted && selectedConversation === conversationId) {
      await delayObservation(controller.signal, 3000);
      if (controller.signal.aborted || !alive || selectedConversation !== conversationId) return;
      if (globalThis.document.visibilityState !== 'visible' || pending || memoryLoading || !memoryData) continue;
      try {
        const result = await request<MemoryVersion>(`/api/conversations/${selectedConversation}/memory?view=version`, undefined, controller.signal);
        if (controller.signal.aborted || selectedConversation !== conversationId || pending) continue;
        if (result.version !== memoryData?.version) await loadMemory(false, true, controller.signal);
        else memoryConnectionMessage = '';
      } catch (cause) {
        if (controller.signal.aborted || selectedConversation !== conversationId) return;
        if (cause instanceof RequestError && cause.status === 401) { failure(cause); return; }
        memoryConnectionMessage = 'Connection interrupted. Reconnecting to saved memory…';
      }
    }
  }
  async function memoryMutation(actionId: string, input: Record<string, unknown>): Promise<ActionResult> {
    const signature = JSON.stringify({ actionId, input });
    if (pendingMutation?.signature !== signature) pendingMutation = { signature, key: crypto.randomUUID() };
    try { await request('/api/actions', { actionId, input, idempotencyKey: pendingMutation.key }); }
    catch (cause) {
      if (!actionId.startsWith('memory.settings.') && cause instanceof RequestError && cause.status === 409) memoryConflict = true;
      throw cause;
    }
    pendingMutation = undefined;
    try { if (actionId.startsWith('memory.settings.')) {
      if (!await loadMemorySettings(input.target === 'room' ? 'room' : 'app')) throw new Error('MEMORY_REFRESH_UNAVAILABLE');
      memorySettingsStatus = actionId.endsWith('restore') ? 'Version restored and saved. Learned memory is unchanged.' : 'Settings saved. Learned memory is unchanged.';
    } else {
      setLocal({ memoryForgetOpen: false }); if (!await loadMemory(actionId !== 'memory.retry')) throw new Error('MEMORY_REFRESH_UNAVAILABLE');
      memoryCareStatus = actionId === 'memory.forget' ? 'Selected sources are excluded from memory. Your conversation is unchanged.' : actionId === 'memory.resume' ? 'Personal memory can update automatically again.' : actionId === 'memory.retry' ? 'Pending memory was queued for another attempt.' : 'Correction saved. Your conversation is unchanged.';
    } } catch { error = 'Your change was saved. Reopen memory to refresh the recorded state.'; return { ok: true, dataStale: true }; }
    return { ok: true, message: '' };
  }
  function failure(cause: unknown): ActionResult {
    if (cause instanceof RequestError && cause.status === 401) void goto('/auth/sign-in');
    error = cause instanceof Error ? cause.message : 'Something interrupted this request. Please try again.';
    return { ok: false, code: cause instanceof RequestError ? cause.code : 'REQUEST_FAILED', message: error };
  }
  function newChatStorageKey(actor: string, room: string) {
    return `quellight:${actor}:new-chat:${room}`;
  }
  function storeNewChat(actor: string, room: string, draft: NewChatDraft | null) {
    try {
      const key = newChatStorageKey(actor, room);
      if (draft) sessionStorage.setItem(key, JSON.stringify(draft));
      else sessionStorage.removeItem(key);
    } catch { /* The in-memory draft stays available. */ }
  }
  function readNewChat(actor: string, room: string): NewChatDraft | null {
    try {
      const draft = JSON.parse(sessionStorage.getItem(newChatStorageKey(actor, room)) ?? 'null');
      return draft?.roomId === room && typeof draft.key === 'string' && typeof draft.text === 'string' ? draft : null;
    } catch { return null; }
  }
  async function createChat(room: string): Promise<ActionResult> {
    const actor = data?.user.id;
    if (!actor || room !== roomId || !currentRoom || currentRoom.archivedAt) {
      return { ok: false, code: 'ROOM_UNAVAILABLE', message: 'Open an active room first.' };
    }
    const resuming = newChat?.roomId === room ? newChat : readNewChat(actor, room);
    const draft = resuming ?? { key: crypto.randomUUID(), roomId: room, text: '' };
    if (creating.has(draft.key)) return { ok: true };
    saveDraft();
    dismissEditors();
    error = '';
    newChat = draft;
    newChatWaiting = true;
    creating.add(draft.key);
    storeNewChat(actor, room, draft);
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      void tick().then(() => {
        if (newChat?.key !== draft.key) return;
        globalThis.document.querySelector<HTMLTextAreaElement>('.ql-transcript textarea[name="message"]')?.focus();
      });
    }
    try {
      const result = await request<{ ok: true; value: Conversation; replay?: boolean }>('/api/actions', {
        actionId: 'conversation.create', input: { roomId: room }, idempotencyKey: draft.key
      });
      const chat = result?.value;
      if (!chat?.id || chat.roomId !== room) throw new RequestError('The conversation receipt could not be confirmed.', 'CREATE_UNCONFIRMED', true);
      if (!alive || data?.user.id !== actor) return { ok: true };
      const visible = newChat?.key === draft.key;
      const savedDraft = visible ? newChat : readNewChat(actor, room);
      if (savedDraft?.key === draft.key && savedDraft.text) {
        const storageKey = draftKey(actor, chat.id);
        if (!storageRead(storageKey) || visible) storageWrite(storageKey, savedDraft.text);
      }
      data = { ...data, conversations: [chat, ...data.conversations.filter(item => item.id !== chat.id)] };
      ++workspaceVersion;
      storeNewChat(actor, room, null);
      if (visible) {
        arrivingChat = { id: chat.id, draftKey: draft.key, empty: result.replay === false && !resuming };
        await navigateSelection(room, chat.id);
      }
      return { ok: true };
    } catch (cause) {
      if (newChat?.key === draft.key) failure(cause);
      return { ok: false, code: 'CREATE_UNCONFIRMED', message: '' };
    } finally {
      creating.delete(draft.key);
      if (newChat?.key === draft.key) newChatWaiting = false;
    }
  }
  async function refreshData() {
    const version = workspaceVersion;
    const snapshot = await request<Bootstrap>('/api/bootstrap?view=sidebar');
    if (version === workspaceVersion) data = snapshot;
  }
  async function navigateSelection(nextRoom: string, nextConversation = '', replaceState = false) {
    const query = new URLSearchParams();
    if (nextRoom) query.set('room', nextRoom);
    if (nextConversation) query.set('conversation', nextConversation);
    await goto(`/${query.size ? `?${query}` : ''}`, { replaceState, noScroll: true, keepFocus: true });
    await resolveSelection();
  }
  async function navigateRoomDetails(open: boolean) {
    const url = new URL(page.url);
    if (open) {
      url.searchParams.set('room', roomId);
      url.searchParams.set('view', 'room-details');
    } else url.searchParams.delete('view');
    await goto(url, { noScroll: true, replaceState: !open });
    await tick();
    globalThis.document.querySelector<HTMLElement>(open ? '[data-ui-node="editTitle"]' : '[data-ui-node="moreMenu"][data-ui-part="root"]')?.focus();
  }
  async function resolveSelection(force = false) {
    if (!data || !alive) return;
    const wantedConversation = data.conversations.find(item => item.id === page.url.searchParams.get('conversation'));
    const wantedRoom = data.rooms.find(item => item.id === (wantedConversation?.roomId ?? page.url.searchParams.get('room')))
      ?? data.rooms.find(item => !item.archivedAt);
    const nextRoom = wantedRoom?.id ?? '';
    const nextConversation = wantedConversation?.id ?? '';
    const arrival = arrivingChat?.id === nextConversation ? arrivingChat : undefined;
    if (!force && !arrival && nextRoom === roomId && nextConversation === conversationId) return;
    saveDraft();
    if (conversationId && currentDetailKnown) {
      recentTranscripts.delete(conversationId);
      recentTranscripts.set(conversationId, messages.slice(-30));
      if (recentTranscripts.size > 8) recentTranscripts.delete(recentTranscripts.keys().next().value!);
    }
    const recent = recentTranscripts.get(nextConversation);
    currentDetailKnown = false; cachedTranscript = !!recent;
    observer?.abort(); selectionRequest?.abort(); historyRequest?.abort(); historyRequest = undefined;
    const version = ++selectionVersion;
    roomId = nextRoom; conversationId = nextConversation; messages = recent ?? []; activeTurn = null; streamed = ''; statusText = ''; stoppingTurn = '';
    olderCursor = null;
    unresolvedSend = nextConversation && !sending[nextConversation] ? readPendingSend(data.user.id, nextConversation) : null;
    ++memoryRequestVersion; memoryData = null; selectedSources = [];
    dismissEditors();
    const arrivalText = arrival && newChat?.key === arrival.draftKey ? newChat.text : undefined;
    if (arrival) {
      storeNewChat(data.user.id, nextRoom, null);
      arrivingChat = undefined; newChat = null; newChatWaiting = false;
    }
    setLocal({ draft: arrivalText ?? (nextConversation ? (storageRead(draftKey(data.user.id, nextConversation)) ?? '') : ''), showArchived: !!wantedRoom?.archivedAt });
    if (arrivalText !== undefined) saveDraft();
    if (!nextConversation || arrival?.empty) { currentDetailKnown = !!arrival?.empty; loading = false; return; }
    loading = true;
    const controller = new AbortController(); selectionRequest = controller;
    try {
      const detail = await request<Detail>(`/api/conversations/${nextConversation}`, undefined, controller.signal);
      if (!alive || version !== selectionVersion) return;
      currentDetailKnown = true;
      messages = detail.messages; activeTurn = detail.activeTurn; olderCursor = detail.olderCursor ?? null;
      mergeMessage(detail.activeUserMessage);
      if (unresolvedSend && messages.some(message => message.requestKey === unresolvedSend?.key)) {
        const attempt = unresolvedSend;
        if (readPendingSend(data.user.id, nextConversation)?.key === attempt.key) storageWrite(pendingKey(data.user.id, nextConversation), null);
        if (String(local.draft ?? '').trim() === attempt.text) { setLocal({ draft: '' }); saveDraft(); }
        unresolvedSend = null;
      }
      if (!detail.activeTurn && ['failed', 'blocked'].includes(detail.lastTurn?.status ?? '')) statusText = 'The last response was interrupted. You can continue here.';
      if (!detail.activeTurn && detail.lastTurn?.status === 'cancelled') statusText = 'Stopped. You can continue whenever you’re ready.';
      if (detail.activeTurn) {
        void observe(detail.activeTurn.id, nextConversation, version);
      }
    } catch (cause) {
      if (!controller.signal.aborted && alive && version === selectionVersion) {
        if (recent && !(cause instanceof RequestError && (cause.status === 401 || cause.status === 404))) statusText = 'Recent messages shown. Reconnect to check for updates.';
        else { messages = []; recentTranscripts.delete(nextConversation); }
        failure(cause);
      }
    } finally { if (alive && version === selectionVersion) { loading = false; cachedTranscript = false; } }
  }
  async function loadOlder() {
    if (!olderCursor || historyRequest) return;
    const version = selectionVersion;
    const controller = new AbortController(); historyRequest = controller;
    const findFeed = () => globalThis.document.querySelector<HTMLElement>('.ql-transcript [data-testid="conversation-feed"]');
    const feed = findFeed();
    const top = feed?.getBoundingClientRect().top ?? 0;
    const anchor = [...(feed?.querySelectorAll<HTMLElement>('[data-message-id]') ?? [])]
      .find(item => item.getBoundingClientRect().bottom > top);
    const anchorId = anchor?.dataset.messageId;
    const offset = anchor ? anchor.getBoundingClientRect().top - top : 0;
    try {
      const older = await request<Detail>(`/api/conversations/${conversationId}?before=${encodeURIComponent(olderCursor)}`, undefined, controller.signal);
      if (!alive || version !== selectionVersion) return;
      const existing = new Set(messages.map(message => message.id));
      messages = [...older.messages.filter(message => !existing.has(message.id)), ...messages];
      olderCursor = older.olderCursor ?? null;
      await tick();
      // VICT's Markdown and message scroller both adjust layout as the older
      // rows mount. Keep this request guard outside the document view so its
      // reset cannot override the reading position after the layout settles.
      const viewport = findFeed();
      if (!viewport || !anchorId) return;
      const interaction = new AbortController();
      const stopRestoring = () => interaction.abort();
      for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
        viewport.addEventListener(event, stopRestoring, { signal: interaction.signal, passive: true });
      }
      const settleBy = performance.now() + 250;
      while (!controller.signal.aborted && !interaction.signal.aborted && performance.now() < settleBy) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (!alive || version !== selectionVersion) break;
        const restored = [...viewport.querySelectorAll<HTMLElement>('[data-message-id]')]
          .find(item => item.dataset.messageId === anchorId);
        if (!restored) break;
        const shift = restored.getBoundingClientRect().top - viewport.getBoundingClientRect().top - offset;
        if (Math.abs(shift) > 0.5) viewport.scrollTop += shift;
      }
      interaction.abort();
    } catch (cause) { if (!controller.signal.aborted && alive && version === selectionVersion) failure(cause); }
    finally { if (historyRequest === controller) historyRequest = undefined; }
  }
  function mergeMessage(message: Message | null | undefined) {
    if (!message) return;
    const existing = messages.findIndex(item => item.id === message.id);
    if (existing < 0) messages = [...messages, message];
    else messages = messages.map(item => item.id === message.id ? message : item);
  }
  function settleTurn(turn: Turn, assistantMessage: Message | null | undefined) {
    mergeMessage(assistantMessage);
    streamed = ''; activeTurn = null; stoppingTurn = '';
    statusText = turn.status === 'cancelled' ? 'Stopped. You can continue whenever you’re ready.'
      : ['failed', 'blocked'].includes(turn.status) ? 'The response was interrupted. Your conversation is saved.' : '';
    if (['failed', 'blocked'].includes(turn.status)) error = 'The response could not finish. You can send another message to continue.';
  }
  async function observe(turnId: string, selectedConversation: string, version: number, initialCursor = 0) {
    observer?.abort();
    const controller = new AbortController(); observer = controller;
    let cursor = initialCursor;
    let retry = 200;
    const connectionMessage = 'Connection interrupted. Reconnecting to your saved response…';
    const current = () => alive && !controller.signal.aborted && version === selectionVersion && selectedConversation === conversationId;
    const apply = (observed: Observation) => {
      if (!current()) return true;
      if (observed.turn.id !== turnId || observed.nextCursor < cursor) return false;
      const previousCursor = cursor;
      for (const event of observed.events) {
        if (event.sequence <= cursor) continue;
        if (event.kind === 'text.delta') streamed += event.delta ?? '';
        cursor = event.sequence;
      }
      cursor = observed.nextCursor;
      activeTurn = observed.turn;
      if (cursor > previousCursor) retry = 200;
      if (error === connectionMessage) error = '';
      if (!terminal(observed.turn.status) || !observed.turn.projectionSettled) return false;
      settleTurn(observed.turn, observed.assistantMessage);
      if (observed.nextActiveTurn && observed.nextActiveTurn.id !== turnId) {
        mergeMessage(observed.nextUserMessage);
        activeTurn = observed.nextActiveTurn;
        void observe(observed.nextActiveTurn.id, selectedConversation, version);
      }
      return true;
    };
    while (current()) {
      try {
        if (await followTurn(turnId, cursor, controller.signal, apply)) return;
      } catch (cause) {
        if (current() && cause instanceof RequestError && [401, 403].includes(cause.status)) { failure(cause); return; }
      }
      if (!current()) return;
      try {
        const observed = await request<Observation>(`/api/turns/${turnId}/events?after=${cursor}`, undefined, controller.signal);
        if (apply(observed)) return;
      } catch (cause) {
        if (!current()) return;
        if (cause instanceof RequestError && [401, 403, 404].includes(cause.status)) { failure(cause); return; }
        error = connectionMessage;
      }
      await delayObservation(controller.signal, retry);
      retry = Math.min(retry * 2, 2_000);
    }
  }
  async function send(input: Record<string, unknown>, retry = false): Promise<ActionResult> {
    const selectedConversation = String(input.conversationId ?? '');
    const text = String(input.text ?? '').trim();
    if (!data || !currentDetailKnown || newChat || !text || !selectedConversation || selectedConversation !== conversationId || loading || busy || sending[selectedConversation] || currentRoom?.archivedAt)
      return { ok: false, code: 'MESSAGE_UNAVAILABLE', message: 'Open an active conversation and write a message first.' };
    const actor = data.user.id;
    const version = selectionVersion;
    const previous = unresolvedSend ?? readPendingSend(actor, selectedConversation);
    if (previous && (!retry || previous.text !== text)) return { ok: false, code: 'DELIVERY_UNCONFIRMED', message: 'Retry the previous message to confirm delivery.' };
    const attempt = previous ?? { text, key: crypto.randomUUID(), createdAt: new Date().toISOString() };
    const key = pendingKey(actor, selectedConversation);
    const current = () => alive && version === selectionVersion && selectedConversation === conversationId;
    sending[selectedConversation] = attempt;
    error = ''; statusText = ''; unresolvedSend = null;
    storageWrite(key, JSON.stringify(attempt));
    try {
      const accepted = await request<AcceptedTurn>(`/api/conversations/${selectedConversation}/turns`, { input: text, idempotencyKey: attempt.key });
      if (accepted.conversationId !== selectedConversation) throw new RequestError('The message receipt did not match this conversation.', 'ADMISSION_MISMATCH', true);
      if (readPendingSend(actor, selectedConversation)?.key === attempt.key) storageWrite(key, null);
      const draft = draftKey(actor, selectedConversation);
      if (storageRead(draft)?.trim() === text) storageWrite(draft, null);
      if (!current()) {
        if (alive && conversationId === selectedConversation) {
          if (String(local.draft ?? '').trim() === text) { setLocal({ draft: '' }); saveDraft(); }
          if (!messages.some(message => message.id === accepted.userMessage?.id)) void resolveSelection(true);
        }
        return { ok: true, message: '' };
      }
      if (String(local.draft ?? '').trim() === text) { setLocal({ draft: '' }); saveDraft(); }
      mergeMessage(accepted.userMessage);
      activeTurn = { id: accepted.turnId, status: accepted.status }; streamed = '';
      void observe(accepted.turnId, selectedConversation, version);
      return { ok: true, message: '' };
    } catch (cause) {
      if (alive && conversationId === selectedConversation && messages.some(message => message.requestKey === attempt.key)) {
        if (readPendingSend(actor, selectedConversation)?.key === attempt.key) storageWrite(key, null);
        if (String(local.draft ?? '').trim() === text) { setLocal({ draft: '' }); saveDraft(); }
        unresolvedSend = null;
        return { ok: true, message: '' };
      }
      const uncertain = previous || !(cause instanceof RequestError) || cause.uncertain;
      if (!uncertain && readPendingSend(actor, selectedConversation)?.key === attempt.key) storageWrite(key, null);
      if (alive && conversationId === selectedConversation && uncertain) unresolvedSend = attempt;
      return current() ? failure(cause) : { ok: false, code: 'REQUEST_FAILED', message: 'Check delivery when you reopen the conversation.' };
    } finally {
      delete sending[selectedConversation];
    }
  }
  async function mutate(actionId: string, input: Record<string, unknown>): Promise<ActionResult> {
    const origin = page.url.href;
    const intent = selectionIntent;
    const signature = JSON.stringify({ actionId, input });
    if (pendingMutation?.signature !== signature) pendingMutation = { signature, key: crypto.randomUUID() };
    const result = await request<{ ok: true; value: Room }>('/api/actions', { actionId, input, idempotencyKey: pendingMutation.key });
    pendingMutation = undefined;
    if (!data || !alive) return { ok: true, message: '' };
    const saved = result.value;
    const exists = data.rooms.some(room => room.id === saved.id);
    data = { ...data, rooms: exists ? data.rooms.map(room => room.id !== saved.id || room.revision > saved.revision ? room : saved) : [...data.rooms, saved] };
    ++workspaceVersion;
    if (page.url.href !== origin || intent !== selectionIntent || newChat) return { ok: true, message: '' };
    dismissEditors();
    try {
      if (actionId === 'room.create') {
        setLocal({ roomName: '', roomPurpose: '', showArchived: false });
        await navigateSelection(saved.id);
      } else if (actionId === 'room.archive') {
        await navigateSelection(data?.rooms.find(room => !room.archivedAt)?.id ?? '', '', true);
      } else if (actionId === 'room.rename') {
        await navigateRoomDetails(false);
      }
      return { ok: true, message: '' };
    } catch {
      error = 'Your change was saved. Reconnect to refresh your space.';
      return { ok: true, dataStale: true };
    }
  }
  async function dispatch(actionId: string, value?: unknown): Promise<ActionResult> {
    const input = (value ?? {}) as Record<string, unknown>;
    if (actionId === 'conversation.create') return await createChat(String(input.roomId ?? ''));
    if (actionId === 'ui.room.select' || actionId === 'ui.conversation.select' || actionId === 'ui.desk.select') {
      const selected = actionId === 'ui.conversation.select' ? data?.conversations.find(item => item.id === input.id) : undefined;
      const intent = ++selectionIntent;
      newChat = null;
      newChatWaiting = false;
      error = '';
      const navigation = actionId === 'ui.desk.select' ? navigateDesk(String(input.id))
        : selected ? navigateSelection(selected.roomId, selected.id)
        : actionId === 'ui.room.select' ? navigateSelection(String(input.id)) : undefined;
      void navigation?.catch(cause => { if (intent === selectionIntent && alive) failure(cause); });
      // Each repeated row binds the same action ID. Keep row feedback clear
      // while the selected route owns loading and reports its error once.
      return { ok: true, message: '' };
    }
    if (actionId === 'conversation.send') return await send(input);
    if (actionId === 'ui.send.retry' && unresolvedSend) return await send({ conversationId, text: unresolvedSend.text }, true);
    if (actionId === 'ui.history.older') { void loadOlder(); return { ok: true, message: '' }; }
    if (actionId === 'conversation.cancel') {
      const turnId = String(input.turnId);
      const version = selectionVersion;
      if (!activeTurn || activeTurn.id !== turnId || terminal(activeTurn.status) || stoppingTurn) return { ok: false, code: 'STOP_UNAVAILABLE', message: 'There is no running response to stop.' };
      stoppingTurn = turnId;
      try {
        await request(`/api/turns/${turnId}/cancel`, {});
        if (version === selectionVersion && activeTurn?.id === turnId) statusText = 'Stopping…';
        return { ok: true, message: '' };
      } catch (cause) {
        return version === selectionVersion && activeTurn?.id === turnId ? failure(cause) : { ok: false, code: 'STOP_UNCONFIRMED', message: 'Open the conversation to check its status.' };
      } finally { if (version === selectionVersion && stoppingTurn === turnId) stoppingTurn = ''; }
    }
    if (actionId === 'ui.memory.source.toggle') {
      const id = String(input.id);
      if (memoryData?.sources.some(source => source.id === id && !source.excluded)) selectedSources = selectedSources.includes(id) ? selectedSources.filter(item => item !== id) : [...selectedSources, id];
      return { ok: true, message: '' };
    }
    if (actionId === 'ui.memory.forget.open' || actionId === 'ui.memory.forget.close') {
      setLocal({ memoryForgetOpen: actionId.endsWith('.open') && selectedSources.length > 0 });
      return { ok: true, message: '' };
    }
    if (actionId === 'ui.archive.open' || actionId === 'ui.archive.dismiss') {
      if (roomDetails) setLocal({ archiveOpen: actionId === 'ui.archive.open' });
      return { ok: true, message: '' };
    }
    if (pending) return { ok: false, code: 'REQUEST_PENDING', message: 'Your request is being saved.' };
    pending = true; error = '';
    try {
      if (actionId === 'ui.desk.open') await navigateDesk();
      else if (actionId === 'ui.desk.method' || actionId === 'ui.desk.defaults' || actionId === 'ui.desk.method.close') {
        dismissEditors();saveDraft();saveDeskDraft();const url=new URL(page.url);
        if(actionId==='ui.desk.method.close'){if(deskMethodRoom)url.searchParams.set('view','desk');else url.searchParams.delete('view');}
        else url.searchParams.set('view',actionId==='ui.desk.method'?'desk-method':'desk-defaults');
        await goto(url,{noScroll:true});
      }
      else if(actionId==='ui.desk.method.item' && methodView?.item)await navigateDesk(methodView.item.id);
      else if(actionId==='ui.desk.method.reload')await loadMethodSettings(true);
      else if(actionId==='ui.desk.method.save')return await changeMethodSettings('desk.method.settings.save');
      else if(actionId==='ui.desk.method.restore')return await changeMethodSettings('desk.method.settings.restore');
      else if(actionId==='ui.desk.method.retry')return await changeMethodSettings();
      else if(actionId==='ui.desk.method.history'){
        const snapshot=methodSettings?.history.find(h=>h.revision===Number(local.dMethodVersion));
        methodHistoryText=snapshot?describeMethodSettings(snapshot):'This version is unavailable.';
      }
      else if (actionId === 'ui.desk.close') await navigateDesk('', true);
      else if (actionId === 'ui.desk.new') await navigateDesk('new');
      else if (actionId === 'ui.desk.list') await navigateDesk();
      else if (actionId === 'ui.desk.search') await loadDeskList();
      else if (actionId === 'ui.desk.more') await loadDeskList(true);
      else if (actionId === 'ui.desk.reload') await openDeskSelection(roomId, deskSelected, true);
      else if (actionId === 'ui.desk.preview') setLocal({ dPreview: !local.dPreview });
      else if (actionId === 'ui.desk.history') await showDeskRevision();
      else if (actionId === 'ui.desk.history-more') await loadDeskHistory(true);
      else if (actionId === 'ui.desk.context') {
        const selectedConversation = conversationId, selectedReply = String(local.memoryReply ?? '');
        const result = await request<DeskContext>(`/api/conversations/${selectedConversation}/desk-context?turnId=${encodeURIComponent(selectedReply)}`);
        if (conversationId === selectedConversation && local.memoryReply === selectedReply) deskContextText = describeDeskContext(result);
      }
      else if (actionId === 'ui.desk.retry') return await mutateDesk();
      else if (actionId === 'ui.desk.save') return await mutateDesk(deskSelected === 'new' ? 'desk.create' : 'desk.save');
      else if (['ui.desk.archive', 'ui.desk.restore', 'ui.desk.restore-version'].includes(actionId)) return await mutateDesk(actionId.replace('ui.', '') as DeskActionId);
      else if (actionId === 'ui.memory.open') {
        setLocal({ moreOpen: false, memoryOpen: true }); await loadMemory(true);
      } else if (actionId === 'ui.memory.context') await loadMemoryContext();
      else if (actionId === 'ui.memory.more-sources') await loadMemorySources(true);
      else if (actionId === 'ui.memory.more-replies') await loadMoreReplies();
      else if (actionId === 'ui.memory.reload') await loadMemory(true);
      else if (actionId === 'ui.memory.defaults' || actionId === 'ui.memory.defaults.close') {
        dismissEditors();
        const url = new URL(page.url);
        if (actionId === 'ui.memory.defaults') url.searchParams.set('view', 'memory-defaults'); else url.searchParams.delete('view');
        await goto(url, { noScroll: true });
      } else if (actionId === 'ui.memory.settings.preview') {
        const result = await request<{ effective: MemorySettingsPayload['effective'] }>('/api/memory/settings/preview', { target: roomDetails ? 'room' : 'app', roomId: roomDetails ? roomId : '', content: JSON.stringify(memoryDraftContent(local, roomDetails)) });
        memoryPreviewText = describeMemoryPreview(result.effective); memorySettingsStatus = 'Preview only. Nothing has been saved.';
      } else if (['memory.settings.save', 'memory.settings.restore', 'memory.correct', 'memory.forget', 'memory.resume', 'memory.retry'].includes(actionId)) return await memoryMutation(actionId, input);
      else if (actionId === 'ui.room.edit') {
        dismissEditors();
        if (currentRoom && !currentRoom.archivedAt) await navigateRoomDetails(true);
      } else if (actionId === 'ui.room.dismiss' || actionId === 'ui.room.new') {
        dismissEditors();
        if (roomDetails) await navigateRoomDetails(false);
        if (actionId === 'ui.room.new') setLocal({ newRoomOpen: true });
      } else if (actionId === 'ui.reload') { await refreshData(); await resolveSelection(true); if (roomDetails || memoryDefaults) await loadMemorySettings(roomDetails ? 'room' : 'app'); }
      else if (actionId === 'ui.export') {
        if (!conversationId) throw new Error('Open a conversation first.');
        setLocal({ moreOpen: false });
        window.location.assign(`/api/conversations/${conversationId}/export`);
      } else if (actionId === 'auth.sign-out') {
        await request('/auth/sign-out', {});
        if (data) {
          clearActorStorage(data.user.id);
          for (const room of data.rooms) storeNewChat(data.user.id, room.id, null);
        }
        observer?.abort(); await goto('/auth/sign-in');
      } else if (['room.create', 'room.rename', 'room.archive'].includes(actionId)) return await mutate(actionId, input);
      else return { ok: false, code: 'UNKNOWN_ACTION', message: 'This action is unavailable.' };
      return { ok: true, message: '' };
    } catch (cause) { return failure(cause); }
    finally { pending = false; }
  }
  beforeNavigate(({ to }) => {
    if (!newChat || to?.url.searchParams.get('conversation') === arrivingChat?.id) return;
    newChat = null;
    newChatWaiting = false;
    arrivingChat = undefined;
  });
  afterNavigate(() => { if (data) void resolveSelection(); });
  onMount(() => {
    setLocal({ dark: storageRead('quellight:appearance') === 'dark' });
    void (async () => {
      try { await refreshData(); await resolveSelection(true); }
      catch (cause) { failure(cause); loading = false; }
    })();
    return () => { alive = false; saveDraft(); saveDeskDraft(); observer?.abort(); selectionRequest?.abort(); historyRequest?.abort(); memoryReadController?.abort(); };
  });
</script>

<svelte:head>
  <title>{deskMethodOpen ? `${deskMethodRoom ? 'Room method' : 'Desk defaults'} · Quellight` : deskOpen ? 'Desk · Quellight' : memoryDefaults ? 'Memory defaults · Quellight' : roomDetails ? 'Room details · Quellight' : currentRoom ? `${currentRoom.name} · Quellight` : 'Quellight'}</title>
  <meta name="description" content="Your private space to think and work through what matters." />
</svelte:head>

<div class="quellight" data-ui-application-viewport data-appearance={local.dark ? 'dark' : 'light'}>
  <ControlScope>
    <DocumentHost {plan} extensionDescriptors={descriptors} extensionImplementations={implementations}
      localState={document.localState} stateValues={local} {view} {dispatch}
      navigate={() => {}} {onStateChange} ariaLabel="Quellight conversation" />
  </ControlScope>
</div>
