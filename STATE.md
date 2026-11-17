# Quellight implementation state

## Active work — Phase 3

On 17 November the owner approved the collaborative Desk and learned working method proposal. Delegated backend/UI implementation and independent verification are underway under [the Phase 3 execution plan](docs/PHASE-3-PLAN.md). Starting Git commit `b47f856`; the following Phase 2 production record remains the live baseline until a separately qualified Phase 3 deployment. No Phase 3 result is claimed yet.

The complete functional candidate `a26bbfd37e69113bef38dc7e09be096734ecc3d374a6765974d6fbfebe6c3cca` has now passed the actual GLM API journey (21 checks), hosted desktop/phone browser journey (40), independent receipt audit (7), and method-specific host interruption/recovery. After Vercel's actual 300-second timeout, the one-minute scheduler published the identical prepared method once, with unchanged generation and an honest separate publication receipt. A new GLM chat selected the recovered method and completed a governed Desk read. [Phase 3 delivery record](docs/PHASE-3-DELIVERY.md) owns the scoped evidence. The remaining release work is one light-mode muted-text contrast correction and its separate presentation qualification, production verification, synthetic cleanup and the final commit. Server/prompt/package behavior stays frozen; no duplicate provider tests are needed for the exact CSS-only delta.

Local Desk, method, UI and recovery checks passed. Additive private Desk tables were applied to the existing Free database; no owner records were migrated. The first isolated live GLM Preview created a note, learned a method, and appended while preserving a manual edit. Its next turn exposed a native-maintenance/chat admission race; the failed run `3eef2868-eb4f-44af-aaee-86bb8018d873` is retained, and that synthetic account/session was revoked. A shared conversation lease and public native admission preflight now pass six interleaving checks and seven existing worker regressions. Account-scoped background admission passed five independent groups and actual native care checks.

The separate seven-file **Phase 2 maintenance repair is now live** as `dpl_Fjx4AyiBtExDcQoGZBCJAjjPHsfw`, source `92e69f35b2cb81c332a6112d67436d17e9855fdeca24baf7fe1940bd042a8c22`. [Maintenance verification](../qualification/phase3-hosted/evidence/hotfix-production.json) confirms production readiness, owner configuration and unchanged owner rooms/conversations/turns. It introduces no Desk UI or schema behavior. Final Phase 3 candidate `a26bbfd37e69113bef38dc7e09be096734ecc3d374a6765974d6fbfebe6c3cca` is READY at Preview `dpl_AqCniAv7ReBQ4QzW9c7h6of7gukH`; its fresh synthetic GLM journey is underway. Final release still requires matching live/browser/receipt/method-host-recovery evidence through the concrete production gates in `../qualification/phase3-hosted`.

Local disk exhaustion prevented the final Linux rebuild. The alternative qualification explicitly combines the exact-source Windows Node build/HTTP proof with actual Vercel pinned `npm ci`, fourteen-archive verification, uploaded file hashes, function metadata and seventeen hosted HTTP probes. Restored build cache is disclosed; actual reinstall/build ran. No successful local Linux rebuild or remote invalid-configuration/canary test is claimed. Automatic approval review rejected deletion of the temporary hotfix `node_modules` with **“blocked by policy”**; that folder remains untouched, and cloud build qualification avoids deleting it.

Updated 17 November 2026. **Phase 2A–2E is delivered at [quellight.com](https://quellight.com)** with the maintenance repair above. The original Phase 2 release was `dpl_5qKJLV218S9rjqababvbkBbbbF4v`, qualified build `7cb4a8abfc0812f40289395dce52737c17f891aa4a23e5c7be19182520f4e177`. [Delivery record](docs/PHASE-2-DELIVERY.md), [portable evidence](evidence/phase-2.json) and [owner guide](docs/USING-QUELLIGHT.md). Owner review remains separate from the completed engineering milestone.

## Current product

The owner can sign in from phone or laptop, use Home and created rooms, create/reopen conversations, stream/Stop replies, copy and export. The quiet VICT interface keeps New conversation only in the sidebar or phone drawer. Unsent drafts remain device-local. All controls use installed public VICT UI in canonical `vict.application@3` documents.

Automatic memory now uses Mastra message history, thread Observational Memory, shared personal Working Memory and governed original-source recall through VICT. There is no per-memory approval. **⋮ → Memory** reads saved observations, personal memory, activity, original sources and actual selected memory additions for a reply. It never displays private reasoning or pretends the recorded additions are the entire prompt. Correct, Forget, Resume automatic updates and eligible Retry are governed product actions.

Home and newly created rooms inherit versioned app defaults. Room purpose and explicit overrides are local. Recall defaults to the current room; same-owner recall is an explicit option. Correcting personal memory protects the entire edited profile until Resume. Forget suppresses selected original source IDs and quarantines stale generated sources while retaining readable transcripts. It is not a semantic-erasure guarantee.

The existing `zai-coding-plan/glm-5.3-flash` profile serves every model-backed role; the provider key remains in Vercel. No application generation timeout, output cap, turn cap or step cap was added. The actual host ceiling is 300 seconds. Full history is retained; managed context uses observations, applicable personal memory and recent/unobserved messages with the installed `lastMessages:1000` policy. Semantic vector search, deeper ARA-style attunement and Desk are later work. No ARA data has been imported.

## Identity and infrastructure

- The allowed owner remains `radziamin91@gmail.com`, UUID `d84e888e-4be3-414e-81b7-8bbc000423ee`. Public sign-up is disabled; owner and active-session checks run server-side. Future multi-user access is not enabled by this milestone.
- Vercel Hobby, Node 22.x, Singapore, with existing Free Supabase `wekfufgllxfpmjtusnre` on PostgreSQL 17.12. No paid services added. Preview/immutable URLs retain Vercel Authentication; the public domain uses Quellight sign-in. The previously recorded project data-sharing opt-out was not changed. Current UI rechecking was unavailable; the public API does not expose that project flag.
- Restricted TLS role `ql_app_runtime` accesses `quellight_product_v1`, `quellight_ops_v1` and the qualified private `quellight_memory_v2`. Legacy `quellight_memory_v1` remains intact. The twelve new native tables use RLS. Migration login/CREATE and temporary Vault privileges are sealed; browser/runtime roles cannot read scheduler credentials or invoke its private SQL function.
- Supabase cron checks due work every minute and sends authenticated HTTP202 wakes only when needed. Production origin is `https://quellight.com`. Queue claims, checkpoint publication and care recovery are durable; browser presence is unnecessary. [Operations](docs/PHASE-2-HOSTING.md).
- [Production verification](../qualification/phase2-hosted/evidence/production.json) covers public sign-in, anonymous data/machine refusal, readiness, real owner configuration and unchanged hashes for that owner's rooms/conversations/turns. Authenticated functional and browser testing used isolated synthetic accounts, not a newly created owner session. Owner password and sessions were not changed.

## Exact release baseline

All fourteen VICT installed package trees match their pinned archives. C12 framework executable source is `a22615b014aa69f7501dc1504da5f9daad639786`; runtime archive SHA `e94ee682d7f57efbbc9722818f2ab6059ad6a9bb3f9c8229e73c24197b0abb3f`, Mastra SHA `2d136123705f92e88a15e7e2b80e1732218ca00018c9cc55165a69a7774a84d3`. Current app lock SHA `8b821ffabf5d8f184f69862deb9cab7495a63a37a51641e6e074ba342de3d4dc`.

[baseline.json](baseline.json) retains its artifact-adoption-stage label `phase-2-local-candidate`; this release promotes exactly those qualified inputs without rewriting their identity. Local qualification uses portable Node 22.23.5, leaving system Node 22.13.1 unchanged. Original VICT/ARA/TORI reference checkouts remain untouched. Framework work is separate at `C:/Users/RZ1/Desktop/RZ/261116-VICT-Vercel` and remains reusable across applications.

## Verification and continuation

- C12 installed 28/28 plus separate threshold-driven reflection; independent framework GO and actual GLM native roles/fresh-host persistence.
- App 29 checks; types/Svelte 0 errors/0 warnings; settings/queue15, conversation 13, care 11, worker 7, native helper 4, independent integration 4; inspection/harness 53 focused checks plus actual PostgreSQL overlap regression.
- Independent local UI 60 behavior +32 appearance/keyboard checks. Actual hosted desktop/phone browser48 checks,16 screenshots reviewed. Browser visits made no writes or provider calls.
- Actual hosted API 24 checks passed: short-chat learning, cross-chat preference use, changed preferences, room scoping, real source recall, protected correction, Resume, effective Forget with retained originals, replay/conflict and two-client reopening.
- A 2,103-word synthetic brief produced a real checkpoint. The hosted test requested exit86, but Vercel actually reported its 300-second runtime timeout. After true claim expiry, cron run79/delivery11 received202; the same job completed with the identical checkpoint, one publication, no added native Observer/Reflector events and a distinct truthful reconciliation receipt. A new actual GLM conversation then recovered both project detail and preference through the source tool. This is not an HTTP-egress or billing audit.
- Clean Linux Node/Vercel builds and actual handler/HTTP checks passed: three function groups, 4,444 files, 34 aliases, no private canary. Final source `7cb4a8abfc0812f40289395dce52737c17f891aa4a23e5c7be19182520f4e177` matches packaging, qualified Preview and production inputs. Independent final release gate 33 checks passed.

The first product Preview exposed overlapping same-owner maintenance claims and an inspector status-priority issue. Both were repaired and qualified before the fresh final account/Preview journey. Historical failed evidence is retained; it is not substituted for final success. Provider-failure/fencing/race probes are deterministic or installed checks where identified; actual GLM and browser evidence have separate scopes. [Source-based ARA comparison](docs/PHASE-2-ARA-COMPARISON.md) is not a live A/B test or a superiority claim.

Next product increment is Phase 3 Desk; deeper adaptation follows later. Continue from the owner's review, using the VICT skill for structure/UI and ready public controls. No unfinished Phase 2 implementation is implied by the later roadmap. Final synthetic-account/session and temporary-Preview cleanup evidence accompanies the delivery record; keep audit/product history and do not delete real owner data.

## Historical Phase 1 evidence

| Scope | Observed result |
| --- | --- |
| Application/config unit checks | 14 passed |
| Types/Svelte | Zero errors and warnings |
| Domain on real local PostgreSQL | 9 groups passed: governed bootstrap, replay, identity, authority, revisions/archive, simultaneous edits, uncertain settlement, session enforcement and role isolation |
| Conversation on real local PostgreSQL | 12 groups passed; independent review identified and repaired lifecycle races before the final regression |
| Browser UI with synthetic transport | Desktop 1440×1000 and phone 390×844 journeys passed; light/dark, draft retention, streaming/Stop, rooms and mobile navigation inspected |
| Browser recovery with synthetic transport | A committed start with a dropped response reused the original key on retry; terminal projection retained partial text and disabled Send until settlement |
| Simultaneous browser views with synthetic transport | Two independent desktop/phone contexts observed the same active turn, followed a new remote turn, settled to identical history without duplicates and retained separate drafts |
| Real hosted product/provider | 11 checks passed on the READY Phase 1 Preview, including an actual GLM response and saved/reopened transcript |
| Production browser continuity | Two independent desktop/phone browser contexts rendered the same saved GLM reply after redeployment; both text exports matched and neither had browser errors |
| Hosted session revocation | The test session was signed out; its stale cookie immediately received 401, and its local cookie file was removed |
| Final packaging/production | Clean Node and Vercel builds passed, actual Node HTTP and all three generated Vercel handlers passed, 4,424 output files inspected, production promoted |

[Domain evidence](../qualification/phase1-domain/evidence/latest.json), [conversation evidence index](../qualification/phase1-conversation/latest.json), and [browser builder record](docs/PHASE-1-EXPERIENCE.md) retain their separate scopes. The [live test record](../qualification/phase1-ops/live-test.json) ran from `2026-11-16T15:28:02.454Z` to `15:28:22.963Z` and passed: anonymous refusal, foreign-origin refusal, owner authentication, governed room/conversation creation, exact-key replay, conflicting-key refusal, live GLM completion, streamed text persistence, matching reopen, remote Stop settlement and archive history preservation. This is real hosted integration evidence, separate from synthetic browser fixtures and the owner's eventual review.

The UI preserves uncertain send keys through reconnect/reload, waits for durable transcript projection after a terminal turn, and transfers observation when another device starts a new active turn. Navigating away stops observation only; explicit Stop requests cancellation. [Production browser evidence](../qualification/phase1-ops/browser/result.json) used a verified owner session in two independent contexts; it does not claim two independent password logins. [Session revocation](../qualification/phase1-ops/session-revocation.json) passed. The private owner password has not been created by an agent, and a fresh one-time setup link has been handed to the owner.

## Historical Phase 0 record — 16 November 2026

The foundation stage intentionally had sending disabled, page-local drafts, no product records and readiness 503. Those descriptions apply only to its earlier deployments and tests. The protected foundation deployment was `dpl_5nwgRcjdb7aT5hav2mdh8ip7NfAG`; its 12-check suite and six-then-twelve archive stages are not the current Phase 1 product evidence.

- [Phase 0 app evidence](docs/PHASE-0-EVIDENCE.md), [machine record](evidence/phase-0.json), [Vercel foundation deployment](docs/VERCEL-DEPLOYMENT.md) and [independent hosting review](docs/VERCEL-INDEPENDENT-REVIEW.md).
- [Installed UI proof](../docs/phase-0/public-ui-proof.md), [hosted boundary proof](../docs/phase-0/hosted-capability.md) and [combined twelve-archive consumer](../docs/phase-0/vercel-extension-consumer.md).
- [Hosted synthetic runtime qualification](docs/HOSTED-RUNTIME-QUALIFICATION.md) and [declared-action proof](../qualification/phase0-action-boundary/README.md).
- [GLM adapter qualification](../qualification/zai-provider/ADAPTER-QUALIFICATION.md) and [live Preview provider record](evidence/zai-provider-live-preview.json). After the owner updated the key, the temporary provider test completed through VICT/Mastra with one synthetic automatic write and its authorization receipt; that test deployment was removed.

The reusable VICT extension is separate framework work. Quellight consumes its public persistence/coordination and owns product rules and composition. Earlier Oracle/Render assessments remain historical alternatives, not selected hosts. Docker execution remains unproven.


### Historical Phase 2 checkpoints

These records explain progression and do not override the current state above:

- The owner-approved quiet UI was committed as `01fd00f`; prompt/plan foundation as `1e6023b`; pure inheritance model as `03767c1`. At those checkpoints native memory and live overrides were still planned.
- [C6](../qualification/phase2-memory/INDEPENDENT-CANDIDATE-6.md) qualified maintenance/inspection with 11 installed groups and [five live checks plus fresh-host persistence](../qualification/phase2-memory-live/LIVE-C6.md). It was not full product adoption.
- [C8](../qualification/phase2-memory/INDEPENDENT-CANDIDATE-8.md) added managed context. Its [live record](../qualification/phase2-memory-live/LIVE-C8.md) retains the repaired fixture interpretation of native relative-date formatting. It later ran with the real provider; the earlier statement that it had not was a pre-live checkpoint.
- [C10](../qualification/phase2-memory/INDEPENDENT-CANDIDATE-10.md) passed 27 installed groups, but review found the in-flight generated-source authority race. C11 added immutable provenance/quarantine and C12 retained that behavior with corrected Node support metadata. The current C12 28-group evidence supersedes the earlier adoption blocker.
- Earlier settings/queue 14-group and UI 54-check records remain historical; current reruns and independent UI results are linked above. Temporary reusable-framework C6/C8/C12 hosted fixtures are separate from this product Preview and its new native-v2 schema.

### Operator-only cleanup history

Automatic approval review previously rejected recursive cleanup of `C:/Users/RZ1/AppData/Local/Temp/vict-memory-stage-Rec7zd` with the stated reason **“blocked by policy.”** The framework agent left that synthetic staging folder untouched. Cleanup remains pending; do not bypass the rejection. This is operator history, not a product warning or a memory failure.

The final owned interruption stage `qualification/phase2-hosted/.staging/interruption-e9eb4b82-b175-43ba-acdb-1e0dfd3c5870` was likewise retained after automatic approval review rejected its recursive deletion with **“blocked by policy.”** Both synthetic Auth accounts and all three temporary hosted Previews were removed successfully. [Cleanup record](../qualification/phase2-hosted/evidence/local-cleanup.json). No deletion bypass was attempted.

The owner completed private Phase 1 password setup and reported “Done — Quellight opened.” [Setup confirmation](../qualification/phase1-ops/owner-setup-completed.json), [Phase 1 packaging](../qualification/phase1-ops/packaging.json), [release inputs](../qualification/phase1-ops/release-inputs.json) and [operator notes](../qualification/phase1-ops/README.md) retain that historical delivery evidence.
