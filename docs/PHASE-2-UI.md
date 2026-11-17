# Quiet memory and settings

The conversation remains primary. Its three-dot menu opens **Memory**, a ready VICT right-side Drawer. Current thread observations appear first; earlier/prepared observations, personal memory, activity, original sources, selected-reply memory and correction/forget controls are progressively disclosed. Phone and desktop use the same content and controls. New conversation remains exclusively in sidebar navigation.

`src/lib/product/memory-ui.ts` composes the installed public Drawer, catalog collapsibles/checkboxes/buttons, media icons and Rhea textarea/native-select recipes into the canonical `vict.application@3` document. No separate UI kit or replacement control was added. Semantic colors, quiet action sizing, slim scrolling and labelled field bindings continue the approved Phase 1 design.

**Memory defaults** is reached through sidebar Settings. Room details retains its dedicated page and adds room overrides, purpose and prompt choices. Each inherited value is explicit; custom empty additions and false values are preserved. Prompt controls distinguish Quellight defaults/personal-preferences preset from Mastra native defaults and custom additions/templates. Preview is read-only; Save and Restore use declared governed actions with optimistic revisions. Restoring appends a version and does not erase learned memory.

Inspection uses the JSON-safe `MemoryInspection` contract in `src/lib/product/memory-client.ts`. Native SDK records, private reasoning and provider metadata are never rendered directly. Selected context is labelled memory selected before a reply, with omissions; it is not presented as the complete prompt or proof of a successful provider call. Empty/history/prepared states describe recorded data rather than implying completed activity.

While Memory is open and the page visible, read-only inspection refreshes using the existing observation cadence. Closing it, changing conversation or leaving the page aborts reads. Reconnection preserves disclosure state, selected reply, source selections and the correction draft. The expected correction revision is separately pinned when that draft is populated; background reads never advance its authority. Changed authority or a conflict disables stale edits, retains the draft, and offers explicit reload with replacement copy.

Correction may update owner-authored personal memory and suppress selected original sources. The UI explains that a personal edit stays as written while observations keep updating. **Resume automatic updates** releases that owner-managed override. Forget requires selected original sources and explicit confirmation; transcript retention is stated. **Retry pending memory** is shown only when the server declares an eligible recovery, and is an explicit action rather than an effect of inspection.

Acknowledged saves followed by failed refresh return a saved-but-stale state. A lost save acknowledgement keeps the original command key for an identical retry. Draft content is retained on errors; background refresh cannot approve or initiate a mutation.

## Local validation

Use `node scripts/preview-ui.mjs --port 4320` for the visibly labelled local sample preview. The sample transport is isolated from credentials, authentication, database and provider services. It is not evidence that live memory ran.

`node scripts/check-phase2-ui.mjs` uses the existing isolated `qualification/public-ui` Playwright Core and Chromium installation. It exercises the actual rendered app with fresh synthetic transport per desktop (1280×900) and phone (390×844) context. Evidence and screenshots are under `test-results/phase2-memory-ui`.

The final local journey passed 54 assertions: observations first, progressive disclosure, selected context omissions, pending-to-completed refresh, explicit pending-work retry without losing the correction draft, disconnect/reconnect, pinned stale-edit refusal and explicit reload, correction/resume/forget with retained transcript, stopping polling on close, settings preview, lost-response idempotent retry, version restore, room inheritance/empty/false overrides, reload persistence and absence of horizontal overflow. Screenshots were visually inspected by builder and root; root's independent review prompted the refresh and revision-pinning improvements. The final run is recorded at `2026-11-16T19:14:12.570Z` in the harness summary.

Canonical app tests passed 6/6 and Svelte checks had zero errors/warnings. Product API authorization, reusable framework behavior, actual PostgreSQL writes and hosted GLM evidence are separate qualifications. Root owns hosted integration and final rollout; this UI work did not deploy or call a provider.

After the recorded browser run, root review added the concise assistant-source exclusion note and disabled Restore for the current or unavailable version, including unsaved initial version 0. That source passed Svelte checks with zero errors/warnings. A further one-line presentation change gives `personal.enabled === false` precedence and says personal memory is not used in this room while retaining inspectable saved text. These bounded changes are later than the screenshot source hashes.
