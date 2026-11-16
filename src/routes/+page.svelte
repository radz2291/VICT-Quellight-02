<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { goto, afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { ControlScope, DocumentHost, type ActionResult } from '@victframework/ui-svelte';
  import type { UiValue } from '@victframework/ui';
  import { document, descriptors, implementations, view as initialView, requireRenderPlan } from '$lib/product/definition';
  import { request, RequestError, terminal, storageRead, storageWrite, draftKey, pendingKey, clearActorStorage, delayObservation,
    type Bootstrap, type Room, type Conversation, type Message, type Turn, type Detail, type Observation } from '$lib/product/client';

  const plan = requireRenderPlan();
  let data = $state<Bootstrap | null>(null);
  let roomId = $state('');
  let conversationId = $state('');
  let messages = $state<Message[]>([]);
  let activeTurn = $state<Turn | null>(null);
  let streamed = $state('');
  let loading = $state(true);
  let pending = $state(false);
  let error = $state('');
  let statusText = $state('');
  let local = $state<Record<string, UiValue>>(Object.fromEntries(Object.values(document.localState ?? {}).map(value => [value.key, value.initial])));
  let alive = true;
  let selectionVersion = 0;
  let observer: AbortController | undefined;
  let selectionRequest: AbortController | undefined;
  let pendingMutation: { signature: string; key: string } | undefined;
  const currentRoom = $derived(data?.rooms.find(room => room.id === roomId));
  const currentConversation = $derived(data?.conversations.find(item => item.id === conversationId));
  const roomDetails = $derived(!!currentRoom && !currentRoom.archivedAt && page.url.searchParams.get('view') === 'room-details');
  let detailsRoomId = '';
  $effect(() => {
    const next = roomDetails ? currentRoom : undefined;
    if ((next?.id ?? '') === detailsRoomId) return;
    detailsRoomId = next?.id ?? '';
    untrack(() => setLocal({ editedName: next?.name ?? '', archiveOpen: false }));
  });
  const busy = $derived(!!activeTurn && (!terminal(activeTurn.status) || !activeTurn.projectionSettled));
  const visibleRooms = $derived((data?.rooms ?? []).filter(room => Boolean(room.archivedAt) === Boolean(local.showArchived)));
  const view = $derived({ ...initialView,
    rooms: visibleRooms.map(room => ({ id: room.id, name: room.name, selected: room.id === roomId })),
    conversations: (data?.conversations ?? []).filter(item => item.roomId === roomId).map(item => ({ id: item.id, title: item.title, selected: item.id === conversationId })),
    roomId, roomName: currentRoom?.name ?? 'Your space', roomPurpose: currentRoom?.archivedAt ? 'Archived room' : (currentRoom?.purpose ?? ''), roomRevision: currentRoom?.revision ?? 1,
    conversationId, conversationTitle: currentConversation?.title ?? 'New conversation', turnId: activeTurn?.id ?? '',
    transcript: JSON.stringify({ version: 1, messages: [
      ...messages.map(({ id, role, text }) => ({ id, role, text })),
      ...(streamed && activeTurn ? [{ id: `stream-${activeTurn.id}`, role: 'assistant', text: streamed }] : [])
    ] }), busy, pending, canSend: !!conversationId && !loading && !pending && !busy && !currentRoom?.archivedAt,
    canStop: !!activeTurn && !terminal(activeTurn.status) && !pending, loading, error, hasError: !!error, ready: !!data && !loading,
    hasConversation: !!conversationId && !loading, hasMoreActions: !roomDetails && !loading && (!!conversationId || (!!currentRoom && !currentRoom.archivedAt)),
    roomDetails, headerTitle: roomDetails ? currentRoom?.name ?? 'Your space' : currentConversation?.title ?? currentRoom?.name ?? 'Your space',
    roomDetailsBackLabel: conversationId ? 'Back to conversation' : 'Back to room',
    activeRoom: !!currentRoom && !currentRoom.archivedAt,
    emptyRooms: visibleRooms.length === 0, roomsEmptyText: local.showArchived ? 'No archived rooms.' : 'Create a room to begin.',
    statusText: busy ? (activeTurn && terminal(activeTurn.status) ? 'Saving the response…' : statusText === 'Stopping…' ? statusText : streamed ? 'Writing…' : 'Thinking… You can leave and come back.') : (currentRoom?.archivedAt ? 'This room is archived.' : statusText)
  });

  function setLocal(values: Record<string, UiValue>) { local = { ...local, ...values }; }
  function saveDraft() {
    if (data && conversationId) storageWrite(draftKey(data.user.id, conversationId), String(local.draft ?? ''));
  }
  function onStateChange(key: string, value: UiValue) {
    setLocal({ [key]: value });
    if (key === 'draft') saveDraft();
    if (key === 'dark') storageWrite('quellight:appearance', value ? 'dark' : 'light');
  }
  function dismissEditors() { setLocal({ newRoomOpen: false, archiveOpen: false, navigationOpen: false, moreOpen: false, settingsOpen: false, mobileSettingsOpen: false }); }
  function failure(cause: unknown): ActionResult {
    if (cause instanceof RequestError && cause.status === 401) void goto('/auth/sign-in');
    error = cause instanceof Error ? cause.message : 'Something interrupted this request. Please try again.';
    return { ok: false, code: cause instanceof RequestError ? cause.code : 'REQUEST_FAILED', message: error };
  }
  async function refreshData() { data = await request<Bootstrap>('/api/bootstrap'); }
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
    if (!force && nextRoom === roomId && nextConversation === conversationId) return;
    saveDraft();
    observer?.abort(); selectionRequest?.abort();
    const version = ++selectionVersion;
    roomId = nextRoom; conversationId = nextConversation; messages = []; activeTurn = null; streamed = ''; statusText = '';
    dismissEditors();
    setLocal({ draft: nextConversation ? (storageRead(draftKey(data.user.id, nextConversation)) ?? '') : '', showArchived: !!wantedRoom?.archivedAt });
    if (!nextConversation) { loading = false; return; }
    loading = true;
    const controller = new AbortController(); selectionRequest = controller;
    try {
      const detail = await request<Detail>(`/api/conversations/${nextConversation}`, undefined, controller.signal);
      if (!alive || version !== selectionVersion) return;
      messages = detail.messages; activeTurn = detail.activeTurn;
      if (!detail.activeTurn && ['failed', 'blocked'].includes(detail.lastTurn?.status ?? '')) statusText = 'The last response was interrupted. You can continue here.';
      if (!detail.activeTurn && detail.lastTurn?.status === 'cancelled') statusText = 'Stopped. You can continue whenever you’re ready.';
      if (detail.activeTurn) {
        void observe(detail.activeTurn.id, nextConversation, version);
      }
    } catch (cause) { if (!controller.signal.aborted && alive && version === selectionVersion) failure(cause); }
    finally { if (alive && version === selectionVersion) loading = false; }
  }
  async function settleTurn(turn: Turn, selectedConversation: string, version: number) {
    const detail = await request<Detail>(`/api/conversations/${selectedConversation}`);
    if (!alive || version !== selectionVersion) return;
    messages = detail.messages; streamed = ''; activeTurn = detail.activeTurn;
    statusText = turn.status === 'cancelled' ? 'Stopped. You can continue whenever you’re ready.'
      : ['failed', 'blocked'].includes(turn.status) ? 'The response was interrupted. Your conversation is saved.' : '';
    if (['failed', 'blocked'].includes(turn.status)) error = 'The response could not finish. You can send another message to continue.';
    if (detail.activeTurn && detail.activeTurn.id !== turn.id) void observe(detail.activeTurn.id, selectedConversation, version);
    await refreshData();
  }
  async function observe(turnId: string, selectedConversation: string, version: number) {
    observer?.abort();
    const controller = new AbortController(); observer = controller;
    let cursor = 0;
    const connectionMessage = 'Connection interrupted. Reconnecting to your saved response…';
    while (alive && !controller.signal.aborted && version === selectionVersion) {
      try {
        const observed = await request<Observation>(`/api/turns/${turnId}/events?after=${cursor}`, undefined, controller.signal);
        if (controller.signal.aborted || !alive || version !== selectionVersion) return;
        for (const event of observed.events) if (event.sequence > cursor && event.kind === 'text.delta') streamed += event.delta ?? '';
        cursor = observed.nextCursor; activeTurn = observed.turn;
        if (error === connectionMessage) error = '';
        if (terminal(observed.turn.status) && observed.turn.projectionSettled) { await settleTurn(observed.turn, selectedConversation, version); return; }
      } catch (cause) {
        if (controller.signal.aborted || !alive || version !== selectionVersion) return;
        if (cause instanceof RequestError && [401, 403, 404].includes(cause.status)) { failure(cause); return; }
        error = connectionMessage;
      }
      await delayObservation(controller.signal);
    }
  }
  async function send(input: Record<string, unknown>): Promise<ActionResult> {
    const selectedConversation = String(input.conversationId ?? '');
    const text = String(input.text ?? '');
    if (!text.trim() || !selectedConversation || selectedConversation !== conversationId || busy || currentRoom?.archivedAt)
      return { ok: false, code: 'MESSAGE_UNAVAILABLE', message: 'Open an active conversation and write a message first.' };
    const actor = data!.user.id;
    let attempt: { text: string; key: string } | undefined;
    try { attempt = JSON.parse(storageRead(pendingKey(actor, selectedConversation)) ?? 'null') ?? undefined; } catch { /* A malformed local draft is not authority. */ }
    if (!attempt || attempt.text !== text || typeof attempt.key !== 'string') attempt = { text, key: crypto.randomUUID() };
    storageWrite(pendingKey(actor, selectedConversation), JSON.stringify(attempt));
    const accepted = await request<{ turnId: string; conversationId: string; status: string }>(`/api/conversations/${selectedConversation}/turns`, { input: text, idempotencyKey: attempt.key });
    storageWrite(pendingKey(actor, selectedConversation), null);
    const version = selectionVersion;
    if (selectedConversation === conversationId) {
      if (String(local.draft ?? '').trim() === text) { setLocal({ draft: '' }); saveDraft(); }
      activeTurn = { id: accepted.turnId, status: accepted.status }; streamed = '';
      // Fetch the persisted user message; a successful send remains successful
      // even if this subsequent display refresh is interrupted.
      try {
        const detail = await request<Detail>(`/api/conversations/${selectedConversation}`);
        if (version === selectionVersion) messages = detail.messages;
      } catch { error = 'Your message was sent. Reconnecting to the saved conversation…'; }
      if (version === selectionVersion) void observe(accepted.turnId, selectedConversation, version);
    }
    return { ok: true, message: '' };
  }
  async function mutate(actionId: string, input: Record<string, unknown>): Promise<ActionResult> {
    const signature = JSON.stringify({ actionId, input });
    if (pendingMutation?.signature !== signature) pendingMutation = { signature, key: crypto.randomUUID() };
    const result = await request<{ ok: true; value: Room | Conversation }>('/api/actions', { actionId, input, idempotencyKey: pendingMutation.key });
    pendingMutation = undefined;
    dismissEditors();
    try {
      await refreshData();
      if (actionId === 'room.create') {
        setLocal({ roomName: '', roomPurpose: '', showArchived: false });
        await navigateSelection(result.value.id);
      } else if (actionId === 'conversation.create') {
        await navigateSelection((result.value as Conversation).roomId, result.value.id);
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
    if (actionId === 'ui.archive.open' || actionId === 'ui.archive.dismiss') {
      if (roomDetails) setLocal({ archiveOpen: actionId === 'ui.archive.open' });
      return { ok: true, message: '' };
    }
    if (pending) return { ok: false, code: 'REQUEST_PENDING', message: 'Your request is being saved.' };
    pending = true; error = '';
    try {
      if (actionId === 'ui.room.edit') {
        dismissEditors();
        if (currentRoom && !currentRoom.archivedAt) await navigateRoomDetails(true);
      } else if (actionId === 'ui.room.dismiss' || actionId === 'ui.room.new') {
        dismissEditors();
        if (roomDetails) await navigateRoomDetails(false);
        if (actionId === 'ui.room.new') setLocal({ newRoomOpen: true });
      } else if (actionId === 'ui.room.select') await navigateSelection(String(input.id));
      else if (actionId === 'ui.conversation.select') {
        const selected = data?.conversations.find(item => item.id === input.id);
        if (selected) await navigateSelection(selected.roomId, selected.id);
      } else if (actionId === 'ui.reload') { await refreshData(); await resolveSelection(true); }
      else if (actionId === 'ui.export') {
        if (!conversationId) throw new Error('Open a conversation first.');
        setLocal({ moreOpen: false });
        window.location.assign(`/api/conversations/${conversationId}/export`);
      } else if (actionId === 'auth.sign-out') {
        await request('/auth/sign-out', {});
        if (data) clearActorStorage(data.user.id);
        observer?.abort(); await goto('/auth/sign-in');
      } else if (actionId === 'conversation.send') return await send(input);
      else if (actionId === 'conversation.cancel') {
        const result = await request<{ turnId: string; status: string }>(`/api/turns/${String(input.turnId)}/cancel`, {});
        statusText = terminal(result.status) ? 'Stopped.' : 'Stopping…';
      } else if (['room.create', 'room.rename', 'room.archive', 'conversation.create'].includes(actionId)) return await mutate(actionId, input);
      else return { ok: false, code: 'UNKNOWN_ACTION', message: 'This action is unavailable.' };
      return { ok: true, message: '' };
    } catch (cause) { return failure(cause); }
    finally { pending = false; }
  }
  afterNavigate(() => { if (data) void resolveSelection(); });
  onMount(() => {
    setLocal({ dark: storageRead('quellight:appearance') === 'dark' });
    void (async () => {
      try { await refreshData(); await resolveSelection(true); }
      catch (cause) { failure(cause); loading = false; }
    })();
    return () => { alive = false; saveDraft(); observer?.abort(); selectionRequest?.abort(); };
  });
</script>

<svelte:head>
  <title>{roomDetails ? 'Room details · Quellight' : currentRoom ? `${currentRoom.name} · Quellight` : 'Quellight'}</title>
  <meta name="description" content="Your private space to think and work through what matters." />
</svelte:head>

<div class="quellight" data-ui-application-viewport data-appearance={local.dark ? 'dark' : 'light'}>
  <ControlScope>
    <DocumentHost {plan} extensionDescriptors={descriptors} extensionImplementations={implementations}
      localState={document.localState} stateValues={local} {view} {dispatch}
      navigate={() => {}} {onStateChange} ariaLabel="Quellight conversation" />
  </ControlScope>
</div>
