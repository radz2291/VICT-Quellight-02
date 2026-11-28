# Q4-006 · Verify source membership in longer and reflected observations

**28 November 2026 · Review report**

**The public endpoint range is insufficient to establish exact reflected membership.** The installed Reflector received three Observe groups and published a group retaining the two outer notes. Those two parent groups account for eight ordered original message IDs. The published first-to-last interval includes ten eligible originals, adding both messages from the middle group. The public-only reader refused the reflected membership claim and recovered the two short Observe controls. [Installed capture](capture.json)

## Pinned fixture

- App `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344`, design `9dbfd28175d86b28f9a52340aa4939b4ed11db81`, Node 22.23.5 and loopback PostgreSQL 18.6. Canonical lock SHA-256 `31b606ed8bdffa497bd4621f87877900ed3767f2f0ee0a5681f384e75d75e225`. Verified 14 VICT archives and 1,003 installed files. The installed VICT Mastra archive is `90b2de7c6515785e23b4e6370c92be019959ffca430a7980f6752d5d104c9b2c`, Mastra Core is 1.64.0 and Memory is 1.28.2. [Exact closure](closure.json)
- The fictional harbor rehearsal freezes the role-tagged original messages, chronological Observe batches, selected Reflect parents and interior Forget target in commit `5166198b4a39a59701455aa1532deb3243c34059`. In the fixture, native IDs are minted by the installed app. The writer-side inventory binds each unique tag to its native ID before reading the corresponding operation output. Capture at the deterministic model seam verifies the actual new-message sections selected for Observe and the actual prior notes delivered to Reflect. [Frozen fixture](fixture.json) · [Fixture commit](https://github.com/radz2291/VICT-Quellight-02/commit/5166198b4a39a59701455aa1532deb3243c34059)
- Five turns settled through the normal conversation service. Observe jobs ran through the app worker. The two Reflect requests were queued by the fixture with the existing `enqueueMemoryJob` under the conversation fence. The installed worker called native Reflect, staged the result and published it through the governed operation. The targeted Forget used the actual app care action with the native user message ID already captured in the inventory. The worker processed the normal purge and rebuild.

The consumer receives only a conversation and operation ID plus the actor and room scope. It reads the current authority, the public operation and the app’s scoped native source page. It rechecks authority before accepting anything. The fixture inventory and deterministic prompt captures are comparison evidence. They are absent from the consumer’s inputs. [Consumer](consumer.mjs) · [Runner](run.mjs)

## Ordered IDs at publication and read

`U1`–`U5` and `A1`–`A5` are aliases for the captured original user and assistant IDs in the following table. Each list is in source order. `U2` was the targeted interior message.

| Fixture pair | User ID | Assistant ID |
| --- | --- | --- |
| 1 | `acda1ea7-9354-456d-b053-5ba1182694d4` | `78a665ed-d687-4efd-8825-6138d4f2612e` |
| 2 | `b531f623-2a37-4663-9854-de07f158ad74` | `584a2850-431c-47b9-a1ce-2baede801ee2` |
| 3 | `77d5e7db-b381-4025-a8b5-bd869558da2c` | `7f182736-a69f-4ba2-83e4-d8b58752ceef` |
| 4 | `a8ba3517-18a3-44fe-ac87-cf00a3e1b018` | `74d9162f-b289-4cb2-a4c3-137b3d7de86a` |
| 5 | `7145957e-7408-4797-bf63-daa004d8e7fb` | `ece62267-69af-4fe5-8121-c76b88d937ff` |

| Read case | Independently captured expected IDs | Apparent eligible interval at read | Public-only result for this group |
| --- | --- | --- | --- |
| Longer Observe, authority `0` | `U1 A1 U2 A2 U3 A3` | `U1 A1 U2 A2 U3 A3` | Endpoint interval agrees in this sample. Exact interior membership remains unverified. Zero accepted. |
| Middle Observe, authority `0` | `U4 A4` | `U4 A4` | Both exact IDs recovered. |
| Closing Observe, authority `0` | `U5 A5` | `U5 A5` | Both exact IDs recovered. |
| Outer-parent Reflect, authority `0` | `U1 A1 U2 A2 U3 A3 U5 A5` | `U1 A1 U2 A2 U3 A3 U4 A4 U5 A5` | `U4 A4` are still eligible, yet belong to the omitted middle parent. Refused exact membership. |
| Old Observe and Reflect after Forget | The original memberships are historical. Current accepted list is empty. | No current snapshot and no source-page read | Both operations returned `superseded`, null result/checkpoint and the historical publish event. Zero accepted. |
| Rebuilt Observe, new authority | `U1 U3 U4 U5` | `U1 U3 U4 U5` | Actual new Observer input omits `U2`. The endpoint interval still crosses excluded rows, and public exact membership remains unverified. |
| Rebuilt Reflect, new authority | `U1 U3 U4 U5` | `U1 U3 U4 U5` | Published with a single rebuilt parent. Exact membership is available through the fixture comparison and remains unverified by the public endpoint field. |

Before Forget, the actual Reflect input included the opening, middle and closing notes. The prompt stripped group markup, while native reconciliation still held the prior group records. The scripted output copied the exact opening and closing lines. Those copied lines identify the two parent groups under the pinned reconciliation algorithm. This is evidence about group inputs and attribution in the controlled fixture. It gives no general claim about model entailment or which message caused a model judgment.

The new authority is `care:f6acb2f85665203d49b2ed4d2b31135419d3b15b8e464757b0df8a9a5cbcf80d`. `U1` and `U3` remained eligible on either side of the excluded `U2`. All five older assistant messages became quarantined, including `A3`, the old opening range’s upper endpoint. The regenerated interval has nine raw positions and four eligible user IDs. The reader excluded five ineligible IDs inside that interval, including `U2`. Its output contains zero accepted stale or excluded IDs. The operation, source IDs, exact eligibility and model-facing input sections are retained in the capture.

## First missing field

The counterexample came from completed Reflect operation `memory-job:e17550e2-7609-4d58-977f-3d3fc9eee09b`, invocation `bd3b08e1-e7db-432d-a7af-7287f1a0d331`. The public operation exposes the native stage digest, authority/configuration scope and observation text with endpoint markup. The `snapshot.current` keys include `observations`, `generation`, `id` and timing/token data. No typed per-group member list or retained-parent association is present. Q4-005’s bounded endpoint recovery therefore does not generalize to this reflected operation.

Inspecting the pinned Mastra Memory 1.28.2 implementation identifies where the distinction is lost. In installed `dist/src-BYrxAUzs.js`, `deriveObservationGroupProvenance` resolves groups by copied exact lines, with an ordinal fallback. `combineObservationGroupRanges` collapses the selected groups to first start and last end. `wrapInObservationGroup` emits endpoints and kind and does not serialize the parent IDs. Parsing the endpoint markup therefore cannot distinguish omitted interior parent groups. A reconstruction from historical prose would depend on the matching heuristic and available history.

**Qualify one typed membership field on the committed observation view.** Each published group needs its stable ID and either `orderedEligibleMessageIds` with a declared provenance basis or an explicit unavailable state. Observe can bind the actual eligible originals in model-delivery order. Reflect can bind the ordered deduplicated union of verified retained parents when their lineage is known. Mark membership unavailable when the parent attribution cannot be grounded. Preserve the captured order, and bind the field to the existing operation, native scope, source/configuration and authority revisions. A later authority change should suppress stale membership with the stale result. A regenerated publication should carry its new scope rather than rewriting the older record.

A separate fixture audit matched six governed `quellight.memory.maintain@1` receipts to their actual operation arguments using canonical digests. It used the unfiltered public namespace turn list to find the generated invocation IDs. Member recovery here does not require a bounded invocation lookup, so the proposed field contains no invocation pointer. [Captures and receipts](capture.json)

## Resource use and reproduction

| Public reader phase | Attempts | Named reads | Named JSON bytes | Loopback PG bytes sent / received | Range occurrences |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before Forget | 4 | 24 | 75,186 | 65,578 / 123,892 | 7 |
| Historical reads after Forget | 2 | 8 | 13,234 | 13,554 / 39,332 | 0 |
| Rebuilt Observe and Reflect | 2 | 12 | 41,988 | 33,276 / 70,999 | 2 |
| **Total** | **8** | **44** | **130,408** | **112,408 / 234,223** | **9** |

These are measured local named calls and their serialized results, with a separate shadow-only wire meter for all underlying plaintext PostgreSQL traffic. The shadow login cannot insert transcript rows or update native messages. The fixture permits the indexed namespace read lock with one column grant and verifies that a trigger rejects any actual update by that login. The six public source pages exclude the two old-receipt refusals. Bootstrap, fixture writes, prompt capture, and the separate receipt audit are outside the measurement. The reader made **zero model calls and zero foreground Send round trips**. The fixture made 5 deterministic chat, 4 Observe and 2 Reflect calls. Live provider calls were zero.

From the evidence directory, use Node 22.23.5, the pinned installed app and design checkouts, and a fresh local PostgreSQL database. The loopback fixture administrator must be `q4_fixture`, and the database name must start `q4_006_`. The runner provisions limited disposable writer and shadow roles. In the exact app checkout, `npx --yes npm@11.21.2 ci` and `npm run verify:baseline` reproduce the archive install.

```text
node run.mjs APP_CHECKOUT DESIGN_CHECKOUT postgresql://q4_fixture@127.0.0.1:55443/q4_006_replay OUTPUT_DIRECTORY
```

The scope is a controlled native fixture using the installed Observe/Reflect path. The run measures neither live GLM output quality nor production cost. [Independent reproduction and validator](independent/README.md) · [Q4-005 bounded-range result](https://github.com/radz2291/VICT-Quellight-02/blob/e4a22f1c98d26493e29ffdf85f917687dfd85887/evidence/q4-005/README.md)
