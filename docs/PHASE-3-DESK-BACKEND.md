# Desk backend and method integration

The Desk is room-owned product data. VICT supplies the actual action/tool authority, invocation records and fenced PostgreSQL transactions. The implementation uses the installed C12 package closure; it does not extend Mastra internals.

## Public product ports

`product/desk-contracts.ts` declares the Desk action contracts and a separate Method settings resource. `server/desk/domain.ts` supplies authenticated owner list/detail/search and declared owner actions. List uses real keyset pagination; Put away is browsable by an owner without a query. Model list omits Put away and body text, while deliberate search can discover its index and an actual read obtains the body. Every mutation checks owner/room, expected revision and immutable history. Exact replacement requires one match, including overlapping-match detection.

`createDeskCapabilities` supplies read/list/search and the declared write definitions, immutable identities, explicit permissions and the narrow Desk quiet-write policy. Its invocation must belong to the authenticated running VICT turn. A product command key binds turn, actual tool-call ID and capability; changed arguments cannot evade conflict detection by receiving another framework invocation ID. Actual first-invocation provenance remains in history.

`prepareDeskContext` selects Carried text and Within reach index once. The host saves that selection with turn admission through `saveDeskContext`; inspection reads that saved selection rather than recomputing a historical prompt. It is a Desk-only addition, not the complete model input. It contains no internal model reasoning.

An actual body read stages only item ID/revision/title and its invocation reference in `desk_reads`. `readDeskReads` additionally requires the trusted host's completed-invocation IDs and current source authority before exposing that evidence. Owner inspection, an unsuccessful call, or a staged record by itself is not reported as an agent read. The audit table contains no body text.

## Source authority and owner choices

Automatic/agent-authored content carries the current native source-authority revision. After Forget or another authority change, older derived content is absent from model context, reads/search and subsequent agent mutations. Owner-visible documents/history remain intact. This deliberately conservative boundary suppresses a whole derived item, not inferred semantic fragments. An explicit full owner save that changes body text, or a version restore, reauthors the content. A save with unchanged body, partial edits and archive/attention changes preserve its dependency.

The host injects the shared memory-care authority fence. Native reads and source validation happen before the SQL callback while holding that gate, so a one-connection hosted pool does not deadlock and a concurrent Forget cannot pass a derived write. The host remains responsible for supplying the exact eligible native source snapshot and completed invocation IDs; these are never accepted from model arguments.

Ordinary agents cannot enter or leave Carried placement or edit the reserved Method. A dedicated method writer may create its initial Carried item. Later owner placement is authoritative: Within reach remains Within reach; archived or Put away suspends automatic method updates. A future successful occurrence may learn from the latest owner-authored method, but a generation pinned before a manual change cannot overwrite it.

## Method jobs and recovery

Method defaults live in `server/prompts/desk-method.json`. Versioned app defaults and room overrides have their own read/save/restore APIs and history; they do not reuse native OM settings or native reflection jobs. Reads never generate a method.

The settlement transaction calls `enqueueMethodOccurrence` with actual completed create-invocation IDs. A settled, non-error product turn and matching committed agent-create revision are required. Manual creation, failed receipts and replayed occurrences do not start extra jobs. Root owns the delivery scheduler and calls `claimMethodJob`, `createMethodJobProcessor` and `settleMethodJob`.

The processor pins eligible native source IDs/digest, prompt/settings revision, current Desk revisions and prior method revision. It persists a generation attempt before calling the injected public VICT/Mastra executor. No model tools, model-specific caps or raw provider calls are assembled by the worker. The executor returns accepted saved assistant text and an actual completed VICT turn reference. The result is checkpointed in PostgreSQL before publication. Prepare/checkpoint/publication each run as an actual declared VICT write.

A lost host preserves the same job and generation attempt. An already completed generation is read from the public accepted transcript; a prepared result publishes without another model call. A fresh generation attempt is allowed only after the executor proves the previous attempt terminal. Claim expiry alone does not prove that. Source, settings, Desk or manual revision changes supersede the old unpublished result. Publication and its item revision/history commit together. If its final runtime acknowledgement is lost, the durable published fact remains true while the original runtime receipt remains honestly uncertain; recovery does not fabricate a completed old receipt.

`methodView` returns the exact method item and activity without paging ambiguity. Its headline prefers outstanding queued/running/retryable/blocked work over a later completed occurrence. Detailed event/receipt records distinguish generation, prepared and published stages.

Production background delivery resolves `QUELLIGHT_OWNER_SUBJECT` once when a dispatch starts and requires a valid UUID before opening stores. The selected actor scopes pending care, queue ordering, expired-claim transitions and every memory/method claim, including fallbacks. It cannot change partway through delivery. Optional unscoped helper arguments remain available to explicit internal test compositions; production always supplies the required-owner resolver. This scope belongs to the personal-app composition and does not replace each worker's actor and source-authority checks.

## Evidence scope

`qualification/phase3-desk` exercises the installed packages and app modules against a restricted real loopback PostgreSQL role. Core domain checks cover actor/room refusal, revision conflict, unique edit, history, attention, pagination, replay and source suppression. Method checks use the public deterministic model and actual VICT executor, with separate child-process exits after generation, checkpoint and publication. Their source adapter is synthetic; they do not prove a hosted provider or scheduler run. Independent bridge and shared-care fence evidence belongs to `qualification/phase3-review`; live GLM and hosted product evidence are separate root-owned gates.

Current backend qualification:

- Domain: **11/11 passed**, evidence `phase3-desk/evidence/2d1c54ed-b8eb-4b9a-992e-6da03aeb9e02.json`.
- Durable method worker: **12/12 passed**, evidence `phase3-desk/evidence/c5d7bff6-a159-4ec7-a9b2-115d4939edeb/summary.json`. Source and fixture bytes were copied before execution and verified unchanged afterward. All three actual child-process exits recovered without another model call; source/configuration/manual/authority changes and post-generation actor revocation refused stale publication.
- Independent actual bridge and read evidence: **7/7 passed**, evidence `phase3-review/evidence/3deb549c-5dc1-40ee-94d9-785ca18284c9`. This verdict is the separate verifier's evidence, not the builder's test.
- Hosted receipt audit tooling: `phase3-hosted/audit-receipts.mjs` is read-only and root-operated. It requires an immutable pre-journey nonfixture baseline, authentic synthetic fixture identity, the exact READY Preview and passed API journey. It checks actual tool and method receipts, emitting only IDs, counts and hashes. Its baseline covers the enumerated private product tables; it does not claim to audit Auth, provider billing or all operational records.
- Chat/memory coordination repair: **6/6 passed**, exact-source evidence `phase3-desk/evidence/8729da6a-5947-4417-9052-f29bce97dd5f/summary.json`; existing memory-worker **7/7** regression evidence `phase2-native/evidence/b56b8dbf-306c-49f1-b7ea-186fec7685bf.json`. Background maintenance now holds the same conversation lease as chat until native resources close, and reuses it for source supersession. The lease follows the actual host window; no model duration or turn limit is added. Chat admission also probes the public native thread coordinator before creating an intent, covering a leftover native lease after host loss. Deterministic interleavings prove refusal before model/intent, successful same-key retry and concurrent chat in another room for the same owner.
- Owner-scoped delivery: independent **5/5 passed**, `phase3-review/evidence/da4c3b74-44bd-4aa2-a881-ff965c97b015/summary.json`, plus actual keyless native/VICT care **3/3 passed**, `phase3-desk/evidence/c830ad83-b07e-46ec-a70a-75981bbc90d0/summary.json`. Both captured source bytes before execution and verified them afterward. Selected-owner queue/recovery work advanced while foreign queued, expired and pending care rows, timestamps, attempts and events stayed unchanged. Missing/invalid required owner failed before I/O. Fixture expiry is test setup, not evidence of an actual hosted interruption.

These records qualify the backend slice. Hosted release, provider/scheduler interruption evidence and owner review remain separately reported in the Phase 3 delivery record.
