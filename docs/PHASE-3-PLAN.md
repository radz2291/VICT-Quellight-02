# Phase 3 — collaborative Desk and learned working method

Authorized 17 November 2026 after the owner reviewed the next-phase investigation. Active implementation; no Phase 3 delivery claim yet. Starting app commit `b47f856afe9e1a474f45a0616ae56e76d43f6ad8`; preserve its hosted Phase 2 behavior and existing data. Use the qualified fourteen-package VICT closure, existing GLM-5.3-Flash profile and free Vercel/Supabase services.

## User journey and experience

Each room has one Desk shared by its conversations. The owner and companion create and refine notes, plans, decisions and reference material. The first complete slice is: ask for a plan, reopen the saved item on another device, manually edit it, ask the agent to append a checklist without losing the edit, and return to the same conversation with the correct context.

Use a compact searchable list and detail/editor on desktop; list then dedicated detail on phone. Preserve conversation and Desk drafts. Use public Rhea fields, ready buttons/menus/disclosures, Markdown and Drawer in canonical @3 documents. New conversation stays exclusively in the sidebar. Do not copy the label-only filtered-list's 1,000-item truncation into a product limit; use record-ID-keyed canonical composition and real data paging. Plain-text/Markdown editing is the initial scope. No WYSIWYG, simultaneous cursor editing or Studio canvas dependency.

## Semantics

- Items carry room/owner identity, title/body, free-form kind/status, attention, archive state, immutable revision history and author/source provenance.
- Human and agent create/read/list/query/search/update/exact unique-text edit/append/archive/restore use the same domain operations. Every mutation is actor-authorized, revision-checked and replay-safe. An ambiguous replacement refuses without changing text. A stale agent write cannot overwrite newer manual work.
- **Carried** contributes complete text to context. **Within reach** contributes an index and requires an actual read for its body. **Put away** contributes no ordinary title/body index but remains deliberately searchable. Put away is not archival or a security boundary. New items default to Within reach. Ordinary agents cannot choose Carried; the owner can, and a separately authorized room-method writer is the narrow exception.
- Agent permissions are a new explicit Desk policy through public VICT capabilities. Existing automatic-memory authority does not authorize arbitrary Desk effects. Never report an opened/saved item without the corresponding actual result.
- Pin Desk selection/item revisions with each turn and expose the recorded selection/read evidence quietly. Existing Mastra managed memory supplies its history/OM/personal context once; Desk context is additional product content, not another memory engine.

## Method learning and memory care

A room method is a short practical instruction about working its Desk, not a personality profile, summary or native OM reflection. Derive it from a settled server transcript, current Desk index and prior method. Eligibility requires at least one committed successful agent-create receipt not already handled; failed starts and manual-only creation do not qualify. Record one durable source occurrence and exact source/item/prompt/configuration versions. Replays must not publish twice or silently adopt new meaning.

Use a separately typed method job and worker. Reuse scheduling/coordination patterns, but do not relabel native `memory_jobs.kind='reflect'` or assume native memory checkpoints implement method recovery. Persist and reconcile actual generation/publication state, preserve the last good method on failure, and reject stale updates after a manual change. Method instructions/settings belong in the centralized editable/versioned system with app defaults and room overrides. Generation retains provider defaults and completion-or-cancellation; actual host deadlines remain infrastructure constraints.

Before integration, implement and verify an explicit forgetting boundary. Original transcript-source exclusions must also fence method inputs and stale derived results. User-authored Desk documents remain explicit authored content, with their own edit/archive controls. Do not claim that memory Forget deletes documents. Derived method output must not reintroduce suppressed material through an untracked Desk copy. Inspection is read-only and never starts learning.

## Work allocation and sequence

| Work | Owner | Evidence needed |
| --- | --- | --- |
| 3A Desk contracts, domain persistence/history and installed proof | Backend agent | Actual PostgreSQL ownership, stale writes, ambiguous edits, replay/conflict, attention and archive/restore |
| 3B Ready VICT Desk UI and local journeys | UI agent | Joint compilation, desktop/phone, appearance/keyboard, drafts, long content and real conflict presentation |
| 3C Conversation capabilities/context and method lifecycle | Root integration + backend | Public governed bridge proof, live tools, exact creation eligibility, manual/source authority, durable recovery |
| 3D Independent integration and hosted release | Verifier + root | Independent source/behavior review, clean builds, synthetic Preview journeys, production readiness/data preservation |

Root owns shared HTTP routes, conversation composition/activation, wake/readiness/build integration, remote migrations and deployments. Backend owns `server/desk`, `product/desk-contracts.ts`, domain/method qualifications. UI owns Desk document/client and existing presentation integration. Verifier initially owns independent qualification only. Coordinate changes to shared files before editing. No original ARA/VICT/TORI reference changes.

## Delivery and continuity

Finish the complete agreed Phase 3 with a usable hosted Desk, learned method, owner guide, evidence and commit. Keep deterministic, installed/browser, actual GLM and owner-review evidence separate. Preserve exact source/artifact identities. Use isolated synthetic accounts for hosted qualification and revoke those sessions before deleting their accounts. No real-owner password/session changes, no provider-key retrieval, no new paid services. Do not reuse removed Phase 2 Preview identities or expired fixture accounts as active test targets.

Progress and actual completion facts belong in STATE.md and linked Phase 3 evidence. Phase 4 deeper attunement, ARA migration and multi-user enablement remain outside this increment.
