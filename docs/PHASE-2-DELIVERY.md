# Phase 2 delivery — automatic, inspectable memory

**Live at [quellight.com](https://quellight.com), 17 November 2026.** Phase 2 was deployed and verified at 02:52:24 UTC (10:52:24 Malaysia time). The complete product passed its isolated hosted Preview checks before release. Owner review remains separate. The [machine record](../evidence/phase-2.json) holds exact inputs, evidence hashes and release status.

Quellight now learns useful information after a conversation without asking you to approve each memory. Background learning can finish after the reply. Saved conversations remain available on phone and laptop, while memory details stay behind **⋮ → Memory**.

| Memory layer | What to expect |
| --- | --- |
| Message history | Original conversations remain saved. Selected recent or unobserved messages provide immediate context. |
| Observational Memory | Each conversation develops observations; native reflection consolidates them when its threshold is reached. |
| Working Memory | A small personal profile carries useful preferences across conversations when enabled for the room. |
| Original-source recall | The assistant can retrieve earlier source messages through an authorized tool. A room can allow only its own sources or sources across your rooms. |

These are Mastra-native capabilities composed through public VICT APIs. The reusable extension contains no Quellight room rules or fixed GLM model. Quellight supplies its owner, rooms, prompts, provider and scheduling policy. All visible controls use the installed ready-made VICT UI.

## Using it

- Open **⋮ → Memory** to inspect observations, personal memory, recorded activity, original sources and the memory selected for a reply. Opening it only reads. Selected memory is not the complete prompt or private model reasoning.
- Use **Settings → Memory defaults** for shared settings, or **Room details → Memory in this room** for overrides. Home and created rooms follow the same inheritance rules. Preview changes before saving; saved versions can be restored.
- **Prompts and templates** exposes conversation instructions, additions to native Observer/Reflector/recall instructions and the personal-memory template. App-owned defaults live in the server-only prompt catalog; versions are pinned into execution. Native defaults remain the starting point rather than copied prompt strings scattered through the app.
- **Save correction** replaces the entire personal profile and protects your edited text from automatic replacement. Keep everything you want to retain. **Resume automatic updates** releases that protection.
- **Forget selected sources** excludes the selected messages from future memory and recall and rebuilds affected observations. Original transcript/export stays intact. Existing manually edited personal text must be edited separately. This is source exclusion, not a guarantee of semantic erasure everywhere.
- If unfinished work needs attention, its actual status and **Retry pending memory** remain available. A retry preserves the original work identity where reconciliation is possible.

The [owner guide](USING-QUELLIGHT.md) describes these controls in more detail. Learning may take time; no app generation timeout, output-token cap or step cap was introduced. Vercel's actual 300-second function ceiling remains a host constraint. The short-chat observation threshold is a configurable memory-processing trigger, not a limit on GLM reasoning.

## What was verified

| Evidence | Scope and result |
| --- | --- |
| [Exact installed C12](../../qualification/phase2-memory/evidence/1de39f27-d530-4264-81fb-78849b58be25/summary.json) and [independent review](../../qualification/phase2-memory/INDEPENDENT-CANDIDATE-12.md) | 28 groups using installed archives, real local PostgreSQL and deterministic models. Covers authorization, context, recall, concurrency, staged publication, process loss and stale-source quarantine. |
| [Automatic reflection](../../qualification/phase2-memory/evidence/6648420f-0383-4a3f-9c5a-d59bd83757b4/summary.json) | Separate installed check: ordinary observation invokes native reflection when due. This was a deterministic model check. |
| [Live C12 GLM](../../qualification/phase2-memory-live/LIVE-C12.md) | Ten actual actions, including Observer, Reflector, same/new-conversation chat, governed recall, changed preferences and care; fresh-host read/reconciliation also passed. |
| [Actual app API journey](../../qualification/phase2-hosted/evidence/b0c81dd1-7899-4e8e-8e0e-aa95b1ccfa70.json) | 24 checks on the final Preview: automatic short-chat learning, inherited/overridden settings, room recall scope, changed preferences, correction/protection/resume, forgetting and two-client reopening. |
| [Actual desktop/phone browser journey](../../qualification/phase2-hosted/evidence/browser-a9a4a57f-c833-410d-bcf2-b8884db500cb/summary.json) | 48 read-only checks in two independent contexts sharing one fixture session. Real saved memory rendered in light/dark, keyboard focus and layout passed. This is not two independent password logins. |
| [Hosted interruption and recovery](../../qualification/phase2-hosted/evidence/interruption-result.json) | Real Vercel timeout after a prepared checkpoint. The same job/operation recovered once through clean-host cron delivery; exact OM/profile content was published. The original interrupted receipt stayed unchanged and a distinct reconciliation receipt completed. |
| [Scheduler evidence](../../qualification/phase2-hosted/evidence/interruption-scheduler.json) and [later recall chat](../../qualification/phase2-hosted/evidence/interruption-post-recovery-chat.json) | Actual cron run 79 / HTTP delivery 11 returned 202 before recovery. A new clean-host conversation then used the recovered preference and original project tag through a completed source tool. |

Application database checks separately cover settings/queue, conversation, care, worker, inspection and independent integration. Provider-failure handling was tested with deterministic failures; it was not a deliberate live Z.AI outage. Native generation events did not repeat during hosted checkpoint reconciliation. That supports no repeated native inference in that path; it is not a direct audit of provider HTTP retries or billing. The hosted interruption was a **300-second timeout**, not an observed exit86, although the local child-process proof did observe exit86.

## Release identity and limits

Production `dpl_5qKJLV218S9rjqababvbkBbbbF4v` uses the qualified build-input SHA-256 `7cb4a8abfc0812f40289395dce52737c17f891aa4a23e5c7be19182520f4e177`, matching the clean packaged source and Preview `dpl_Frok872d3DTkeAbDLvpppNrN5d44`. The fourteen-archive [baseline](../baseline.json) includes C12 framework source `a22615b014aa69f7501dc1504da5f9daad639786`; the app lock is `8b821ffabf5d8f184f69862deb9cab7495a63a37a51641e6e074ba342de3d4dc`. This delivery document and evidence are excluded from build inputs.

[Production verification](../../qualification/phase2-hosted/evidence/production.json) confirmed readiness, public sign-in, anonymous product/machine refusal, the www redirect and unchanged owner records/configuration. No real-owner session was created; authenticated functional and browser checks used the isolated Preview owner. The [production scheduler](../../qualification/phase2-hosted/evidence/production-scheduler.json) is enabled for quellight.com, with no pending work at verification and temporary elevated permissions sealed.

Hosting remains the existing Vercel Hobby project and separate free Supabase project, with its existing GLM-5.3-Flash Z.AI Coding Plan credential. No paid service or alternative provider was added. The new private memory schema preserves the legacy schema; qualification uses an isolated synthetic owner. ARA's live project and the real owner's conversations are not test fixtures.

The project's earlier data-sharing opt-out was not changed by this release. A fresh UI check was unavailable and the current public project API does not expose that flag; this release does not claim it was newly verified off.

ARA's automatic-learning experience is retained, while its capture/digest implementation is replaced by the native layers above. The comparison is based on inspected ARA source and supplied scenarios; no controlled ARA-versus-Quellight A/B run or superiority claim is made. Vector semantic search, the collaborative Desk, deeper attunement and general multi-user access are outside this release.

[Hosted cleanup is complete](../../qualification/phase2-hosted/evidence/cleanup-fixtures-cb519774-d9fb-402e-b7c5-486e1d0e4ae5.json): both synthetic Auth accounts were deleted, their sessions revoked and stale cookies refused; their application actors are disabled. [Exactly three temporary Previews were removed](../../qualification/phase2-hosted/evidence/preview-cleanup.json), with production unchanged. Synthetic history/audit and private operator records are retained. The release commit is recorded in Git history and the [commit record](../../qualification/phase2-hosted/evidence/release-commit.json); owner acceptance follows the owner's review.

[Local staging cleanup](../../qualification/phase2-hosted/evidence/local-cleanup.json) was retained because automatic approval review rejected recursive deletion with **“blocked by policy.”** The owned interruption staging directory and an earlier temporary native-memory staging directory remain. Deletion was not retried or bypassed. This has no effect on the live product or completed hosted cleanup.
