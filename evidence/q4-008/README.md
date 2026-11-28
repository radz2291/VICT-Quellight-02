# Q4-008 worker restart and publication replay

The installed Quellight worker recovered an eligible committed preparation with the same two ordered original-message IDs and **zero repeat inference**. The durable handoff is the fenced native commit that sets the operation to `prepared`. A fresh worker reclaimed the same product job after its actual claim expired and reconciled that checkpoint. Exactly one `published` event and the same checkpoint digest remained. [Exact case table](case-table.json) · [Installed capture](capture.json)

## Recovery cases

The `U1` and `A1` aliases identify the synthetic originals in their committed conversation order. Each case uses a distinct conversation and distinct UUIDs. The case table includes exact ordered UUIDs, product and native source/configuration/authority revisions, job and operation IDs, event history, process IDs, checkpoint and result digests, and governed invocation receipts.

| Installed case | Durable state before termination | Restart and publication result | Model calls on the original attempt → restart |
| --- | --- | --- | ---: |
| Before the preparation commit | Product claim running. Another connection could see neither a checkpoint nor a publication. | The open preparation transaction rolled back. The same job and native operation were reclaimed, prepared once and published once with U1, A1. | 1 → 1 |
| After preparation commit | Product claim running. Native operation prepared with U1, A1 and zero publications. | The fresh process reclaimed the same job, kept the checkpoint digest and membership, and published once with U1, A1. | 1 → 0 |
| After publication commit, before product settlement | Product claim running. Native result committed with U1, A1 and one publication. | Reconcile returned the existing result. Its digest stayed identical and the product claim settled. The publication count stayed at one. | 1 → 0 |
| Forget in thread B while A's prepared worker was down | A had a committed preparation with U1, A1. B supplied its own user original to the governed Forget command. | A's old product job became superseded and was never reclaimed. The public old receipt immediately withheld both result and checkpoint. Purge removed the old checkpoint, which had zero publications. A fresh job under the new authority published A's remaining eligible user ID, U1. | 1 → 0 for the stale job. 1 for the replacement. |

Each ordinary same-job restart recorded `queued → running → retryable/HOST_INTERRUPTED → running → completed`. Every duplicate wake after settlement handled zero jobs and added zero attempts, inference, or publications. The core suite used six deterministic Observe calls across those four cases, plus five synthetic Chat calls to create the committed fixtures. All calls were local. The cross-thread replay preserves A's transcript IDs and applies an owner-wide authority revision that quarantines its old assistant original. B supplied the only explicitly forgotten source ID. [Cross-thread command and authority witness](capture.json)

The independent replay used both pinned candidate archives and a separate disposable database. It reproduced the after-prepare handoff and cross-thread Forget, then independently checked real claim expiry, checkpoint and receipt identity, eligible original order, and the governed care digest. [Independent report](independent/README.md)

## Old-pin transition

| State created on the old installation | Candidate outcome | Tested disposition |
| --- | --- | --- |
| Queued with no native operation | Claimed the same job and preserved its source, authority and product settings. It created a native operation under the candidate configuration and published two ordered IDs. | Eligible queue-only work can carry over after checking there is no native operation. |
| Prepared with a native row bound to the old configuration | `MEMORY_NATIVE_OPERATION_CONFLICT`. Zero inference, zero new governed native receipts, zero publications and an unchanged old checkpoint. | Governed Retry followed by the exact old worker drained the same checkpoint with zero repeat inference and one publication. Candidate inspection projected `unavailable` for the legacy group. |

At cutover, keep one active maintenance writer. Pause new work admission, inventory unsettled jobs against native operation records, and drain eligible native-started work with its original installed pin. Verify the outcome of each unresolved operation before opening candidate claims. Carry untouched queued jobs whose source, settings and authority still match. If an old checkpoint cannot be safely drained, keep its audit record and use a separately authorized current-authority operation. Another candidate Retry keeps the same old pin conflict. [Transition replay and exact bindings](pin/README.md) · [Source audit](SOURCE-AUDIT.md)

## Pinned tools and reproduction

App source was `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344`. Design was `9dbfd28175d86b28f9a52340aa4939b4ed11db81`. The unchanged application ran on Node 22.23.5 and PostgreSQL 18.6. The candidate retained the Q4-007 npm 11.21.2 lock and its checked ESM package closure. [Two-archive install and verification](../q4-007/capability/METHOD.md)

| Installation | VICT Mastra archive SHA-256 | Mastra Memory archive SHA-256 |
| --- | --- | --- |
| Shipped baseline | `90b2de7c6515785e23b4e6370c92be019959ffca430a7980f6752d5d104c9b2c` | `f1469f784fbb8385376936e20ad1e89364221f0fe3f53412094955a976527e07` |
| Q4-007 candidate | `9f75998297af4755bfa1abe567f198c7b0731dd304fca1c6c06163f480e03184` | `ed2e8db8e55c60afe1dd4eb3b93b3c5308f35d7accaeff939d488724339c0ea6` |

Initialize generated SvelteKit configuration in each disposable app through its installed `svelte-kit sync` entry. Create three empty disposable loopback databases owned by the test role `q4_fixture`. The runners require the `q4_008_` prefix. From this evidence directory, replace the uppercase path arguments with the pinned checkouts and output locations.

```text
node --preserve-symlinks --experimental-import-meta-resolve run.mjs CANDIDATE_APP DESIGN postgresql://q4_fixture@127.0.0.1:55443/q4_008_primary PRIMARY_OUT
node --preserve-symlinks --experimental-import-meta-resolve pin/run.mjs BASELINE_APP CANDIDATE_APP postgresql://q4_fixture@127.0.0.1:55443/q4_008_oldpin PIN_OUT --provision
node --preserve-symlinks --experimental-import-meta-resolve run.mjs CANDIDATE_APP DESIGN postgresql://q4_fixture@127.0.0.1:55443/q4_008_review INDEPENDENT_OUT after-prepare,cross-thread
node summarize.mjs PRIMARY_OUT/capture.json PIN_OUT/old-pin.json INDEPENDENT_OUT/capture.json
```

The fixture composes the real conversation service, dispatcher, worker, VICT store and governed care. It injects deterministic model responses and holds the installed native methods immediately before a preparation commit or immediately after an actual commit. The parent verifies state from a separate PostgreSQL connection, kills the child, waits for genuine expiry and spawns a fresh process. The local 13-second claim window speeds the exercise. The fixtures use the dispatcher behind the wake transport and therefore qualify the recovery path and repeat wake behavior. The hosted wake transport and production rollout are outside this experiment.

An early harness assertion sorted numeric event IDs as text. The corrected probe explicitly sorts by the numeric database column and reran the full cases. The package-transition run also recorded a Vite development WebSocket port collision during parallel SSR setup. Its installed service checks and database assertions completed successfully. [Checksums](SHA256SUMS)
