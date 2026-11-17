# Phase 3 delivery — collaborative Desk and room method

**Live at [quellight.com](https://quellight.com), 17 November 2026.** Phase 3 production was verified at **08:58:50.695 UTC** (16:58:50.695 Malaysia time). The core Desk and room method passed the actual GLM, browser, receipt and unattended recovery checks below; the final release adds one separately qualified stylesheet adjustment. Production scheduler verification and temporary qualification cleanup are complete. Owner acceptance remains separate.

Phase 3 gives each room one shared Desk. You and Quellight can keep notes, plans, decisions and reference material there, reopen them from another conversation or device, and refine the same saved items. A room can also learn a short practical working method after a successful agent-created item. Automatic memory continues without per-memory approval.

## Using the Desk

Open **Desk** from the sidebar. Desktop uses a compact list and detail view; phone opens an item as a dedicated detail view. Title, body, kind and status are editable. Kind and status are free-form text rather than a prescribed productivity system. Markdown preview, saved versions, version restoration, archive and restore are available. New conversations still start only in the sidebar.

Conversation and item drafts survive switching views. If another client or the agent changes an item, a stale save is refused and the draft stays available. Reloading saved content requires an explicit choice. An interrupted save offers a retry of the original request; the UI does not invent a successful save or silently submit a different edit.

| Attention | How Quellight uses the item |
| --- | --- |
| **Carried** | The selected revision's complete text is included in the conversation's Desk context. |
| **Within reach** | An index entry is included. Quellight must open the item to read its body. Ordinary new items start here. |
| **Put away** | The item is absent from ordinary automatic context but remains available through deliberate search. |

**Attention filter** can browse Put away items without a keyword. **Search Desk → Find items** searches titles and text. **More items** loads another page; there is no fixed total-item truncation. **Archived** is separate from attention. Put away is an organization choice, not a security boundary.

The owner can change attention. Ordinary agent tools cannot choose Carried, change an existing Carried item's placement, or edit the reserved room method. Owner and agent edits use the same versioned domain rules. An exact-text replacement must match once; ambiguous or stale edits refuse instead of overwriting manual work.

## Room method and quiet inspection

From **Desk → Room method**, inspect the saved method and **Method activity**. This is practical guidance for working with that room's Desk, separate from personal memory and native Observational Memory. Opening it only reads saved state.

The automatically learned room method starts **Carried** under its separate method-writing permission. Ordinary agent-created items start **Within reach**. The owner can change the method's attention, and later automatic updates preserve that choice.

**Edit method and view versions** opens it as an ordinary editable Desk item. An owner-selected **Within reach** placement is preserved by later automatic updates. **Put away** or archiving suspends automatic updates; restoring it and choosing Carried or Within reach makes it eligible again. Turning learning off keeps the saved method and does not change its attention.

**Learn a working method** can inherit **Settings → Desk defaults** or override it for this room. **Method instructions** supports app defaults and custom room instructions. Settings drafts, saved versions, restoration and interrupted-save retries use the same explicit revision behavior as other settings. Prompts and policy remain centralized and versioned.

Learning requires a settled conversation with an actual successful agent-create receipt. Manual-only creation, refused creation and identical replay do not create another eligible occurrence. The worker pins source messages, Desk revisions, the previous method and settings. It preserves the last good method on failure and rejects publication after an intervening manual edit or authority change. Generation and publication have their own persisted work and actual VICT receipts.

To inspect a reply, open **⋮ More → Memory → Memory used for a reply**, choose the reply, then **Show Desk context**. The saved Desk selection is separate from **Items opened during reply**, which shows confirmed individual reads. An indexed item is not evidence that its body was opened. These records are context additions and tool-read evidence, not the complete prompt or private model reasoning.

Memory **Forget selected sources** preserves original transcripts and owner-visible Desk documents/history. Previously agent-derived items become unavailable for automatic context and tool reuse after the authority change. A full owner save with a changed body or a version restoration can explicitly reauthor an item. Merely resaving an unchanged body, changing metadata/attention, or making a partial edit does not silently remove its source dependency. This is a source boundary, not a claim of semantic erasure everywhere.

## VICT composition

All visible controls use the existing installed VICT UI: canonical `vict.application@3` documents, Rhea fields, ready buttons, switches, collapsibles, confirmation dialogs, Markdown and the existing Drawer shell. No custom editor framework or new VICT package extension was required for this phase. The isolated controls proof preceded dependent product UI work.

Agent operations use declared public VICT capabilities and the installed Mastra integration. Phase 2's managed native memory is supplied once; Desk selection is an additional app-owned context layer. Desk writes, method generation and method publication have distinct authority and receipt boundaries. Reading an inspector does not start learning.

## Local verification

Each evidence record pins its own tested source and fixture. Earlier component records establish the stated behavior on those exact inputs; they are not a claim that every suite was rerun against every later maintenance change. The release gates bind the core, presentation successor, hosted evidence and packaging separately.

| Evidence | Result and scope |
| --- | --- |
| [Installed ready UI](../../qualification/phase3-ui/evidence/2a6f7165-718d-48b6-b683-0f933ebb71d5/summary.json) | 14 checks against installed public controls, including fields, record-ID composition, Markdown and confirmation dialogs. |
| [Local app browser](../../qualification/phase3-ui/evidence/ed7dc644-21f5-420f-ad7f-1e339363095b/summary.json) | 73 checks with synthetic transport: desktop/phone, light/dark, keyboard, long content, paging, drafts, conflicts, replay, method settings and separate selection/read evidence. Retained screenshots were visually reviewed. No authenticated hosted or provider claim. |
| [Desk domain](../../qualification/phase3-desk/evidence/2d1c54ed-b8eb-4b9a-992e-6da03aeb9e02.json) | 11 real local PostgreSQL groups: authorization, revision history, replay/conflict, exact edits, attention, archive and restoration. |
| [Conversation integration](../../qualification/phase3-conversation/evidence/2e5c2bba-ecb3-4266-b8cf-6d59ca2b9705/summary.json) | 15 groups using installed public VICT/Mastra and a deterministic model: saved turns, cancellation/recovery, actual Desk create, method eligibility, context attention and replay. |
| [Method worker](../../qualification/phase3-desk/evidence/c5d7bff6-a159-4ec7-a9b2-115d4939edeb/summary.json) | 12 groups, including real child-process loss after generation, checkpoint and publication, stale inputs, manual changes and authority. Local process-loss evidence is separate from hosted interruption evidence. |
| [Independent app bridge](../../qualification/phase3-review/evidence/c3267184-47c1-4891-9889-0b26372a7e38/summary.json) | 8 groups through the actual public governed bridge, including forgotten-source restrictions and the changed-body/version-restore reauthoring boundary. |
| [Independent review collection](../../qualification/phase3-review/README.md) | Separate installed capability, native authority-fence, model-step guard, actual method executor and dispatcher proofs. Builder results are not substituted for independent review. |
| [Chat/maintenance interleaving](../../qualification/phase3-desk/evidence/8729da6a-5947-4417-9052-f29bce97dd5f/summary.json) | 6 groups exercise the shared conversation lease and truthful busy refusal before admitting a new turn. |
| [Delivery owner isolation](../../qualification/phase3-review/evidence/da4c3b74-44bd-4aa2-a881-ff965c97b015/summary.json) and [actual selected-owner care](../../qualification/phase3-desk/evidence/c830ad83-b07e-46ec-a70a-75981bbc90d0/summary.json) | 5 independent groups plus 3 real native/VICT care groups. The dispatcher captures the required owner once before I/O; foreign work and expired claims remain untouched. |
| [Core A Windows Node build and HTTP](../../qualification/phase3-hosted/evidence/windows-node-6f52fb68-3f5e-4c0f-a019-13a11dd3209d/summary.json) | Existing installed dependencies, Node 22.23.5, successful Node build and actual HTTP probes. Source and lock were unchanged before/after. Public pages, anonymous refusals, machine authentication refusal and unconfigured readiness were checked; no live owner authentication or provider call. This is A's separate local proof, not a rebuilt local B artifact. |

The earlier local Linux packaging attempt failed during a host disk/I/O problem and is retained as failed evidence. Portable Linux packaging was not requalified. Actual Vercel packaging was qualified separately for both candidates, with the uploaded source, pinned install, fourteen selected archives, generated function metadata and 17 actual HTTP requests checked. Vercel reported restored build cache; this is not described as an empty-cache local build. Invalid-configuration variants and a private-environment canary were not executed remotely.

## Hosted verification

Core **A** is Preview `dpl_AqCniAv7ReBQ4QzW9c7h6of7gukH`, source `a26bbfd37e69113bef38dc7e09be096734ecc3d374a6765974d6fbfebe6c3cca`, committed as `64035cd7d318079cb75db82d5f4fe633c4435ec6`. It received the complete business/model qualification. Presentation successor **B** is Preview `dpl_GE9RdkgbTE4GD8v6CRVcGq7dqxLJ`, source `135db957013265da774b7d2b4ebbeb261a18a2b7aef2fb34142940ccf0bfe3c5`. Its only app change is the light muted-text token in `src/lib/theme.css`; every non-CSS build input matches A. No GLM or interruption test is claimed on B.

| Evidence | Qualified scope and result |
| --- | --- |
| [Core A API journey](../../qualification/phase3-hosted/evidence/1a5f4e87-e6e0-4d3b-88e2-fbb75852b432.json) | 21 checks with an isolated synthetic owner and two independent HTTP cookie jars. Actual GLM creates, appends and deliberately opens saved Desk items; manual text survives, stale writes refuse, method learning respects owner placement, settings inheritance/restoration works, and Forget fences derived context while retaining authored records. |
| [Core A desktop/phone browser](../../qualification/phase3-hosted/evidence/browser-33bc66ca-a1e8-409a-a495-14ab613b4491/summary.json) | 40 read-only checks and 16 retained screenshots: saved items/history, Put away browsing, method activity/settings, actual selected Desk context versus confirmed reads, drawer keyboard behavior and responsive layouts. The two browser contexts reused the synthetic session; these are not independent password sign-ins or physical-device tests. |
| [Actual receipt and baseline audit](../../qualification/phase3-hosted/evidence/receipt-audit.json) | 7 checks bind saved Desk revisions and individual reads to completed VICT invocations. Both eligible method occurrences have pinned inputs, completed generation and exactly one actual publication. Enumerated nonfixture product counts/content hashes remained unchanged. This does not audit Auth, provider billing or all global operational records. |
| [Method-specific hosted interruption/recovery](../../qualification/phase3-hosted/evidence/shadow-result.json) | The shadow host actually reached Vercel's **300-second timeout** after a prepared method checkpoint. The same job, pins, prepared text and generation turn recovered; exactly one publication committed. The original checkpoint run stayed unchanged and a distinct publication run completed. Hosted exit86 was not observed. |
| [Automatic scheduler attribution](../../qualification/phase3-hosted/evidence/shadow-scheduler.json) | Actual cron run **511**, pg_net request **20**, returned **202** at 08:35:00 UTC before the same method job completed at 08:35:07.856 UTC. The claim had genuinely expired. The operator records no manual recovery wake/retry or edits to job timestamps/state. This is correlated delivery evidence, not network interception. |
| [Post-recovery clean-host chat](../../qualification/phase3-hosted/evidence/shadow-post-chat.json) | An actual completed GLM turn selected the recovered method and completed a governed Desk read. Phase 3's method proof is separate from Phase 2 native OM recovery. |
| [A remote packaging](../../qualification/phase3-hosted/evidence/packaging-remote.json) and [B remote packaging](../../qualification/phase3-hosted/evidence/presentation-packaging.json) | Actual Vercel install/build and source correspondence, fourteen pinned archives, runtime/function metadata and 17 HTTP requests per candidate. Public sign-in/setup, readiness, anonymous product/machine refusal and origin guards passed. These packaging probes used no owner session or provider. |
| [B presentation browser](../../qualification/phase3-hosted/evidence/presentation-browser.json) | 24 read-only checks, 12 settled computed-contrast rows and six visually reviewed screenshots. Selected Desk/item text is **4.598:1** in light and **6.092:1** in dark; selected room text is **10.238:1** and **9.691:1**. Phone selected item-row styles are explicitly marked hidden because phone shows a dedicated detail. No data mutation or provider call. |
| [Independent core gate](../../qualification/phase3-hosted/evidence/core-independent-gate.json), [packaging review](../../qualification/phase3-hosted/evidence/remote-packaging-independent.json) and [method-recovery review](../../qualification/phase3-hosted/evidence/shadow-independent.json) | Independent rederivation from the exact retained source, deployment, receipt, checkpoint and scheduler records. These reviews did not perform another provider run. |
| [Presentation successor gate](../../qualification/phase3-hosted/evidence/dpl_BFakfdrHUwTgzEPzhQxnbPim8eN8-presentation-inputs.json) | Passed before production submission: binds A's qualified commit/evidence to B's exact stylesheet-only delta, B packaging and B browser evidence. The submitted-input record does not itself establish successful production verification. |

No new generation turn was created during hosted method reconciliation. This establishes reuse of the saved generation/checkpoint in that path, not a direct provider-network or billing audit. Earlier failed Preview journeys remain retained under their original candidate/fixture identities. The first browser captures also remain retained: Put away initially raced the list response, and dark screenshots caught the 150 ms background transition. Final filter evidence waits for the rendered result; presentation evidence waits for actual CSS animations. A separate settled light contrast shortfall was repaired by darkening the existing light muted-text token from `#687068` to `#606860`.

The isolated [Phase 2 maintenance patch](../../qualification/phase3-hosted/evidence/hotfix-production.json) was separately deployed and verified before the final Phase 3 journey. It restricts background delivery to the configured owner and coordinates chat with native maintenance. Its source is `92e69f35b2cb81c332a6112d67436d17e9855fdeca24baf7fe1940bd042a8c22`; it added no Desk UI/features and is not the full Phase 3 release. The same bounded repairs are included in the Phase 3 core.

## Production and cleanup

[Production verification](../../qualification/phase3-hosted/evidence/presentation-production.json) confirms **READY** deployment `dpl_BFakfdrHUwTgzEPzhQxnbPim8eN8` at quellight.com, source `135db957013265da774b7d2b4ebbeb261a18a2b7aef2fb34142940ccf0bfe3c5`. Vercel Hobby, database readiness, public sign-in, anonymous product/machine refusal and the www redirect passed. The configured owner and existing owner rooms, conversations and turns remained unchanged. Authenticated functional and browser checks used isolated Preview fixtures; no real-owner session was created. Core A is committed as `64035cd7d318079cb75db82d5f4fe633c4435ec6`; it was not separately promoted as an interim public Phase 3 release.

[Production scheduler verification](../../qualification/phase3-hosted/evidence/production-scheduler.json) at **09:00:53.780523 UTC** confirms the existing cron job **1**, still enabled every minute and targeting quellight.com. Its actual private wake function matches the applied migration and checks due native memory, Desk method and care work. The temporary Preview schedule, function and audit table are absent; production execution permissions remain private. No manual wake was invoked for this verification.

[Fixture cleanup](../../qualification/phase3-hosted/evidence/cleanup-fixtures-8ce34a8a-840a-4527-8980-f1c1d8fe3241.json) deleted both synthetic Auth accounts, revoked their sessions, verified stale-cookie refusal and disabled their application actors. Product history, native memory/audit and private operator records remain retained; the real owner was unchanged. [Preview cleanup](../../qualification/phase3-hosted/evidence/preview-cleanup.json) removed exactly six temporary Previews after fixture access was revoked, with production unchanged. The `quellight_phase3_preview_cleanup` migration removed only the temporary qualification scheduler/function/audit objects.

## Release identity and limits

The production build-input SHA-256 is `135db957013265da774b7d2b4ebbeb261a18a2b7aef2fb34142940ccf0bfe3c5`, with the exact A-to-B lineage described above. The fourteen-archive [baseline](../baseline.json) retains C12 framework source `a22615b014aa69f7501dc1504da5f9daad639786`, with app lock `8b821ffabf5d8f184f69862deb9cab7495a63a37a51641e6e074ba342de3d4dc`. Documentation and qualification records are excluded from build inputs.

The release uses the existing free Vercel Hobby and Supabase services and the existing GLM-5.3-Flash Z.AI credential. No alternate provider or paid service was introduced by this implementation. No app inference timeout, output-token cap or turn/step cap was added; the actual host function ceiling remains an infrastructure constraint.

Plain-text/Markdown collaboration is the scope. Simultaneous cursors, a WYSIWYG editor, deeper attunement, ARA data migration, vector semantic search and general multi-user enablement remain outside this phase. The [owner guide](USING-QUELLIGHT.md), [plan](PHASE-3-PLAN.md) and [backend contract notes](PHASE-3-DESK-BACKEND.md) provide further detail. Owner acceptance follows the owner's review, independently of automated qualification.
