# Q4-009 approved room context before reply

Use one compact approved room-state block in Quellight’s existing immutable VICT conversation instructions. Place it after the stable authored instructions and response guidance, before the Desk section. Use the authenticated owner, conversation room and current native authority to select an approval at foreground admission. When that scope has no eligible approval, omit the block and continue with the ordinary instructions, Desk and native memory. [Isolated composition](overlay.mjs) · [Installed context audit](capability/SOURCE-AUDIT.md)

The candidate exercised this composition through the exact installed Quellight conversation service, VICT activation and Mastra request path. A fixture-only Vite transform applies the two composition changes in memory. The unchanged arm loads the original app with the same installed archives. The deterministic `LanguageModelV2` fixture records the actual prompt it receives. Both arms use the same user scripts and replies, effective memory settings, Desk actions and maintenance schedule.

## Installed results and cost

All **115 matched pairs** passed the scoped placement and carry checks. Each arm ran 11 short cases and 104 consecutive long-thread turns. The candidate delivered one block to each of 113 eligible requests. The other-room and post-Forget requests each received zero blocks. Exact block sizes were 328 bytes for R1, 338 for R2 and 342 for R3. The block digest was stable within each revision. All pairwise authored instruction digests and effective ordinary-memory setting revisions matched. All 24 sampled ordinary message sequences after the first system message matched after normalizing generated UUIDs, group IDs and timestamps. [Full distributions and per-case digests](measurement/summary.json)

| Paired measurement | 11 short pairs | 104 long pairs |
| --- | ---: | ---: |
| Median total model-interface prompt delta | +350 B | +360 B |
| Foreground model requests per arm | 11 | 104 |
| Added foreground approval reads per candidate request | 1 | 1 |
| Median serialized approval read result | 427 B | 437 B |
| Median paired loopback bytes to PostgreSQL | +677 B | +7,277 B |
| Median paired loopback bytes from PostgreSQL | +997 B | +4,372 B |
| Local median first model delta, control → candidate | 617 → 779 ms | 1,764 → 4,617 ms |
| Local median settlement, control → candidate | 831 → 1,072 ms | 2,480 → 6,636 ms |
| Median paired settlement delta | +236 ms | +4,036 ms |

For unchanged adjacent long-turn revisions, the median common prefix was ten whole messages in both arms. In the four unchanged adjacent pairs with full serialized arrays retained per arm, the median exact prefix was 9,123 bytes in the control and 9,484 in the candidate. At the R1-to-R2 change, the candidate shared 2,237 initial bytes with its previous request. The control shared 2,558 bytes across the same authority transition. The stable authored portion stayed intact, while the approved revision changed in the first system message.

Both short arms used four Observe calls and one Reflect. Each long arm completed 13 Observe jobs, two Reflect jobs and one purge. The long candidate made one extra Observe call at wave 80. Its product job became `MEMORY_SOURCE_SUPERSEDED` after the observer completed. The native record had no prepared checkpoint or published result. The journal supports counting the additional call and leaves the underlying cause unresolved. The sampled ordinary context after that wave still matched. [Background journal witness](measurement/background-witness.json)

The warmed, standalone query probe measured 20 alternating eligible matches and post-Forget misses. Median round trips were 0.659 and 0.618 ms, respectively. The sequential foreground run also slowed after the model’s first delta, when the approval lookup was already complete. The independent short run reversed the arm order. Its paired median settlement difference was −240 ms, compared with +236 ms in the primary control-first run. The direction change shows sensitivity to run order and local conditions. These results leave the hosted latency budget open. [Standalone read probe](measurement/selector-timing.json) · [Independent timing](independent/README.md)

## Scope and invalidation cases

| Case | Required installed witness |
| --- | --- |
| First, repeated and reopened requests | One exact approved block in system message 0 before Desk. A stable revision has the same block bytes on each request. |
| Fresh conversation in the same room | The same current room revision is selected with the new conversation identity. |
| Another room | No approved block or room marker reaches the model. |
| Governed correction and reopened R2 | The current approval replaces R1. The entire next request omits the superseded marker. A new request on the reopened old conversational thread still selects R2. |
| Reflect and native carry | A deliberately echoed R1 marker reaches the actual native observation summary after explicit Reflect. It appears in the second system message before correction and is absent from the entire eligible request after the authority changes. |
| Source exclusion through Forget in the evidence conversation | The selected original becomes excluded, native authority advances, and the subsequent request omits both the old approval and any old derived marker. The normal reply still runs. |

The approvals are synthetic and immutable within one owner, room and authority. Approval validates the supporting original against an installed scoped source read. The single foreground lookup reads only the approval for the authority already selected by Quellight. The existing model guard validates that authority again before inference. Correction or Forget rotates authority. An approval for an older authority is ineligible, even if its historical row remains stored. The experiment covers the combined authority and source change through governed Forget. Same-authority approval edits and separate revocation rules remain unqualified. The tested binding would also require requalifying approvals in other rooms after an owner-wide authority change. The other-room case used a room with no approval.

The old marker is intentionally written by the deterministic assistant in both arms. This captures actual carry before invalidation while holding the histories equivalent. The post-Forget request retained the current owner-authored Working Memory correction and omitted the approved room block and its tagged derived carry. The fixture checks exact tagged context. Model-answer quality and semantic recovery from untagged paraphrases remain outside the experiment. [Raw model-bound captures and approved source bindings](capture.json)

The independent reviewer reproduced all 11 short pairs in a fresh database and verified reopen, room scope, and exclusion at the model boundary. The reviewer also matched all 22 actual first-system messages to the corresponding persisted VICT instructions artifacts. [Independent evidence](independent/README.md)

## Workload and measurement boundary

Each long arm uses the same frozen 104 user turns in one thread, a two-second synthetic idle interval, maintenance every ten settled turns and after the final turn, governed working-memory correction and room revision change at turn 51, a carried Desk edit at turn 70 and explicit installed native Reflect after turns 40 and 80. Reflect is admitted as a real governed job through the existing app worker. These runs test scheduled maintenance waves. The earlier per-turn maintenance cadence and foreground contention with a live background worker remain separate measurements. The short suites cover the room and care cases. [Frozen inputs](measurement/workload.mjs) · [Analyzer and metric definitions](measurement/README.md)

Measurements include exact received-model UTF-8 JSON prompt sizes and prefixes, local admission, deterministic model first delta and settlement durations, actual counted model calls, the added scoped PostgreSQL SELECT and its serialized result, and total loopback bytes under the foreground window. PostgreSQL traffic includes framing, reads and writes. Provider token usage, cache fields, billing, network latency and browser-visible first token timing are unavailable. Stable prefix bytes describe request shape. Cache behavior requires a measured provider response.

State Signals are absent from the installed public VICT adapter surface, although native Mastra exposes an API on its underlying agent. This qualification selects the existing instructions path and preserves the normal native context selector, product settings and tool authority. Production adoption and the room-learning policy remain separate decisions. [Installed API inventory](capability/installed-context.json)

## Exact pins and reproduction

The app source is `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344` and the design is `9dbfd28175d86b28f9a52340aa4939b4ed11db81`. Both arms use the shipped mixed VICT archive closure. The canonical lock SHA-256 is `31b606ed8bdffa497bd4621f87877900ed3767f2f0ee0a5681f384e75d75e225`. The installed VICT Mastra archive SHA-256 is `90b2de7c6515785e23b4e6370c92be019959ffca430a7980f6752d5d104c9b2c`. The Mastra Memory 1.28.2 registry archive SHA-256 is `f1469f784fbb8385376936e20ad1e89364221f0fe3f53412094955a976527e07`. Runtime was Node 22.23.5 and loopback PostgreSQL 18.6.

Use the unchanged app checkout with the exact lock and bundled archive set. Run normal SvelteKit sync there. Create a fresh disposable PostgreSQL database owned by the synthetic test user `q4_fixture` with a `q4_009_` name. From this evidence directory, run the following with the pinned checkouts and output paths.

```text
node --preserve-symlinks --experimental-import-meta-resolve run.mjs APP DESIGN postgresql://q4_fixture@127.0.0.1:55443/q4_009_primary PRIMARY_OUT
node measurement/summarize.mjs PRIMARY_OUT/capture.json PRIMARY_OUT/measurement-summary.json
node --preserve-symlinks --experimental-import-meta-resolve run.mjs APP DESIGN postgresql://q4_fixture@127.0.0.1:55443/q4_009_review REVIEW_OUT short room-block,control
node independent/check-room-context.mjs REVIEW_OUT/capture.json
```

The names refer to separate synthetic fixture databases. The approved-state relation and harness changes belong to the experiment. [Independent check](independent/README.md) · [Evidence digests](SHA256SUMS)
