# Phase 3 delivery — collaborative Desk and room method

**Release pending.** The implementation and local checks below are complete; final hosted qualification and production delivery are still being recorded. This document does not yet claim that Phase 3 is live at quellight.com. The existing Phase 2 delivery remains a separate release.

Phase 3 gives each room one shared Desk. You and Quellight can keep notes, plans, decisions and reference material there, reopen them from another conversation or device, and refine the same saved items. A room can also learn a short practical working method after a successful agent-created item. Automatic memory continues without per-memory approval.

## Using the Desk

Open **Desk** from the sidebar. Desktop uses a compact list and detail view; phone opens an item as a dedicated detail view. Title, body, kind and status are editable. Kind and status are free-form text rather than a prescribed productivity system. Markdown preview, saved versions, version restoration, archive and restore are available. New conversations still start only in the sidebar.

Conversation and item drafts survive switching views. If another client or the agent changes an item, a stale save is refused and the draft stays available. Reloading saved content requires an explicit choice. An interrupted save offers a retry of the original request; the UI does not invent a successful save or silently submit a different edit.

| Attention | How Quellight uses the item |
| --- | --- |
| **Carried** | The selected revision's complete text is included in the conversation's Desk context. |
| **Within reach** | An index entry is included. Quellight must open the item to read its body. New items start here. |
| **Put away** | The item is absent from ordinary automatic context but remains available through deliberate search. |

**Attention filter** can browse Put away items without a keyword. **Search Desk → Find items** searches titles and text. **More items** loads another page; there is no fixed total-item truncation. **Archived** is separate from attention. Put away is an organization choice, not a security boundary.

The owner can change attention. Ordinary agent tools cannot choose Carried, change an existing Carried item's placement, or edit the reserved room method. Owner and agent edits use the same versioned domain rules. An exact-text replacement must match once; ambiguous or stale edits refuse instead of overwriting manual work.

## Room method and quiet inspection

From **Desk → Room method**, inspect the saved method and **Method activity**. This is practical guidance for working with that room's Desk, separate from personal memory and native Observational Memory. Opening it only reads saved state.

**Edit method and view versions** opens it as an ordinary editable Desk item. An owner-selected **Within reach** placement is preserved by later automatic updates. **Put away** or archiving suspends automatic updates; restoring it and choosing Carried or Within reach makes it eligible again. Turning learning off keeps the saved method and does not change its attention.

**Learn a working method** can inherit **Settings → Desk defaults** or override it for this room. **Method instructions** supports app defaults and custom room instructions. Settings drafts, saved versions, restoration and interrupted-save retries use the same explicit revision behavior as other settings. Prompts and policy remain centralized and versioned.

Learning requires a settled conversation with an actual successful agent-create receipt. Manual-only creation, refused creation and identical replay do not create another eligible occurrence. The worker pins source messages, Desk revisions, the previous method and settings. It preserves the last good method on failure and rejects publication after an intervening manual edit or authority change. Generation and publication have their own persisted work and actual VICT receipts.

To inspect a reply, open **⋮ More → Memory → Memory used for a reply**, choose the reply, then **Show Desk context**. The saved Desk selection is separate from **Items opened during reply**, which shows confirmed individual reads. An indexed item is not evidence that its body was opened. These records are context additions and tool-read evidence, not the complete prompt or private model reasoning.

Memory **Forget selected sources** preserves original transcripts and owner-visible Desk documents/history. Previously agent-derived items become unavailable for automatic context and tool reuse after the authority change. A full owner save with a changed body or a version restoration can explicitly reauthor an item. Merely resaving an unchanged body, changing metadata/attention, or making a partial edit does not silently remove its source dependency. This is a source boundary, not a claim of semantic erasure everywhere.

## VICT composition

All visible controls use the existing installed VICT UI: canonical `vict.application@3` documents, Rhea fields, ready buttons, switches, collapsibles, confirmation dialogs, Markdown and the existing Drawer shell. No custom editor framework or new VICT package extension was required for this phase. The isolated controls proof preceded dependent product UI work.

Agent operations use declared public VICT capabilities and the installed Mastra integration. Phase 2's managed native memory is supplied once; Desk selection is an additional app-owned context layer. Desk writes, method generation and method publication have distinct authority and receipt boundaries. Reading an inspector does not start learning.

## Local verification

Each evidence record pins its own tested source and fixture. Earlier component records establish the stated behavior on those exact inputs; they are not a claim that every suite was rerun against every later maintenance change. The final release gate must bind the current candidate, hosted evidence and packaging separately.

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
| [Current Windows Node build and HTTP](../../qualification/phase3-hosted/evidence/windows-node-6f52fb68-3f5e-4c0f-a019-13a11dd3209d/summary.json) | Existing installed dependencies, Node 22.23.5, successful Node build and actual HTTP probes. Source and lock were unchanged before/after. Public pages, anonymous refusals, machine authentication refusal and unconfigured readiness were checked; no live owner authentication or provider call. |

The earlier local Linux packaging attempt failed during a host disk/I/O problem and is retained as failed evidence. The Windows Node result is not a Linux or Vercel artifact proof. Clean remote packaging is a separate pending release requirement.

## Hosted verification and delivery — pending

The release operator will replace this section with the final exact evidence after success. Prior failed Preview journeys remain historical evidence and must not be relabeled as final passes.

| Required evidence | Current disposition |
| --- | --- |
| Clean build, final Preview ID/origin and matching source | Pending final release record. |
| Authenticated synthetic API journey with actual GLM Desk tools and learned method | Pending final candidate journey. |
| Actual read-only desktop/phone browser journey and screenshots | Pending final API pass and browser execution. |
| Actual completed tool/generation/publication receipts and owner-record baseline audit | Pending final matching audit. |
| Method-specific hosted interruption, same prepared work recovery and automatic scheduler delivery | Pending. Phase 2 OM recovery cannot substitute for this proof. |
| Clean-host chat using the recovered method | Pending matching post-recovery evidence. |
| Production deployment, readiness/configuration, owner-data preservation and scheduler target | Pending; no real-owner login test is claimed. |
| Synthetic account/session/Preview cleanup and release commit | Pending release completion. |

An isolated Phase 2 maintenance patch was prepared separately to restrict background delivery to the configured owner and coordinate chat with native maintenance. Its [local manifest](../../qualification/phase3-hosted/.staging/phase2-owner-delivery-a48e4ff6-7322-4ed8-8a37-8a05bf6bfccb/.local/hotfix-proof/hotfix-manifest.json) contains its distinct source and checks. It adds no Desk UI/features and must not be confused with the full Phase 3 release. Its remote status is recorded by the release operator.

## Candidate identity and limits

The current candidate build-input SHA-256 is `a26bbfd37e69113bef38dc7e09be096734ecc3d374a6765974d6fbfebe6c3cca`; final hosted evidence must match it or explicitly identify a successor. The fourteen-archive [baseline](../baseline.json) retains C12 framework source `a22615b014aa69f7501dc1504da5f9daad639786`, with app lock `8b821ffabf5d8f184f69862deb9cab7495a63a37a51641e6e074ba342de3d4dc`. Documentation and qualification records are excluded from build inputs.

The intended release uses the existing free Vercel Hobby and Supabase services and the existing GLM-5.3-Flash Z.AI credential. No alternate provider or paid service was introduced by this implementation. No app inference timeout, output-token cap or turn/step cap was added; the actual host function ceiling remains an infrastructure constraint.

Plain-text/Markdown collaboration is the scope. Simultaneous cursors, a WYSIWYG editor, deeper attunement, ARA data migration, vector semantic search and general multi-user enablement remain outside this phase. The [owner guide](USING-QUELLIGHT.md), [plan](PHASE-3-PLAN.md) and [backend contract notes](PHASE-3-DESK-BACKEND.md) provide further detail. Owner acceptance follows the owner's review, independently of automated qualification.
