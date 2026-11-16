# Phase 1 conversation experience

Quellight gives the owner one quiet space to write, read a reply, and return to a conversation from phone or laptop. The transcript and composer are primary. A restrained sidebar groups conversations into rooms; on a phone, the same navigation opens in a VICT Dialog. Room details, new-room fields, and archive confirmation appear only when requested. Warm neutral surfaces and green accents carry through both light and dark appearances.

The first usable journey is password setup or sign-in → choose a room → open or create a conversation → write → read the streamed reply. The composer stays within the available viewport. Existing conversation controls provide copying; the footer offers text export. Empty rooms invite a conversation, a genuinely empty account invites a room, and errors retain the draft and offer reconnection. No demo messages or invented memory are shipped.

## Public VICT composition

All three pages are canonical UI documents, jointly compiled with the installed catalogs and `vict.application@3`. `DocumentHost` renders them inside public `ControlScope` with the required public foundation, catalog, Rhea, and AI styles. Source lives in `src/lib/product/definition.ts`.

| User interaction | Installed public source |
| --- | --- |
| Transcript, Markdown, copy, scrolling | `vict.ai.transcript@1`, `@victframework/ui-ai-svelte/authoring` |
| Draft, Send, Stop | `vict.ai.prompt-input@3`, the public extended prompt input |
| Room/conversation actions | `vict.catalog.button@1` |
| Appearance and archived-room visibility | `vict.catalog.switch@1` |
| Phone navigation, focus containment and dismissal | `vict.catalog.dialog@1` |
| Room, email and password fields | Public `rheaNativePatterns` field recipe from `@victframework/ui-svelte/rhea` |

The field recipe retains VICT's label/input structure, classes and typed state interactions. Quellight supplies its labels, state keys, and authored input attributes (`type=email/password`, `autocomplete=username/current-password/new-password`). Native form submit is a canonical interaction. There is no replacement input, button, dialog, transcript or composer implementation. App-owned CSS composes layout and semantic theme tokens. Local navigation actions return an empty success message because the newly selected content already communicates the outcome; errors remain visible.

## State and transport

Rooms and conversations use the shared domain action contracts and the authenticated `/api/actions` dispatcher. Conversation detail, start, event observation and Stop use the server-owned conversation routes. Selection is represented in the URL so a conversation can be reopened or bookmarked. A device stores drafts under actor and conversation keys; sign-out clears that actor's local entries. Passwords and setup tokens are never stored. The setup fragment is removed as soon as the page captures it in memory.

Each message start retains its idempotency key while the outcome is uncertain, including through a reconnect or reload. The key is removed only when that exact POST is acknowledged. A still-matching draft is cleared after acceptance; subsequent typing survives. Observer cleanup on navigation does not cancel the server turn. Reopening replays public text deltas from the first sequence and then observes incrementally. Polling has no attempt limit or generation timeout.

VICT terminal status and product transcript settlement are separate facts. The browser keeps partial text and observes until `projectionSettled` is true, then replaces the streamed placeholder with the persisted transcript. If another device has started a new turn in that interval, observation transfers to that new turn. Failed, blocked and cancelled last turns retain a truthful status on reopen. User-facing text does not expose reasoning or framework internals.

## Builder verification, 16 November 2026

The canonical application suite passed 6/6 checks, including actual joint compilation, all three render plans, missing component revision rejection, undeclared send rejection, and password field provenance. The integrated Svelte check passed after correcting the prop warning.

`scripts/check-phase1-ui.mjs` exercised the real rendered UI against intercepted, explicitly synthetic browser responses. It used the existing separate Playwright installation without changing the app's package closure. Run Vite at port 4318, then run the script with `QUELLIGHT_PLAYWRIGHT_MODULE` pointing to that installation's `index.mjs`. This harness never calls a real authentication, database, or model service.

The synthetic browser run passed sign-in field binding, conversation selection, draft retention across conversation changes, theme switching, text streaming and Stop, room create/rename/archive, phone navigation dismissal after selection, and a visible phone composer without horizontal overflow. It reported no browser errors. Desktop 1440×1000 and phone 390×844 screenshots are under `test-results/phase1-ui`; their light, dark, sign-in and phone states were visually inspected. These screenshots contain test content only.

A second run with `QUELLIGHT_UI_DROP_START=1` committed the synthetic message then deliberately dropped its start response. Reconnection retained the draft and original idempotency key; retry after Stop reused that key and created no second logical message. Both runs delayed transcript projection after terminal cancellation, proving that partial text remains visible and Send stays disabled until projection is settled. Both also verified that VICT's trimmed send output clears the still-matching draft, including surrounding whitespace. Recovery records are under `test-results/phase1-ui-recovery`; the deliberately injected connection failure is expected there.

This is builder evidence for UI behavior. It does not establish live authentication, database persistence, live GLM inference, independent acceptance or owner review. The root agent owns hosted integration and those separate records. Automatic memory and Desk are later phases; this UI does not pretend they are enabled.

The additional `scripts/check-phase1-two-devices.mjs` run passed with two simultaneous independent browser contexts at desktop and phone widths. Both observed one active turn, followed the new remote turn from cursor zero, and settled to identical saved history without duplicates. Draft editing stayed independent between devices and persisted in each context. There were no browser errors or real auth/provider calls. Its explicitly synthetic record is `test-results/phase1-two-devices/result.json`; the QA server was stopped afterward. Hosted rendering and actual GLM persistence are recorded separately in `../../qualification/phase1-ops/`.
