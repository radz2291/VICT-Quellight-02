# Q4-004 · Verify native observations against original messages

**28 November 2026 · Review report**

Use committed native observations as leads for room learning, with eligible original sources and independently verified outcomes as the evidence. In this pre-labelled replay, native text covered **5 of 10 supported claims**. The source-only arm recovered the other five, including who retained decision authority and which acceptance check failed. The native text also contained **five unsupported claims and one ambiguous claim**. The replay withheld all six.

## Tested baseline and method

- App **`14b6ccaf6f409eac3e041dc3d9abd0bb9f875344`**, design **`9dbfd28175d86b28f9a52340aa4939b4ed11db81`**, Node **22.23.5**. The canonical lock SHA-256 is `31b606ed8bdffa497bd4621f87877900ed3767f2f0ee0a5681f384e75d75e225`. The verified closure contains 14 VICT archives and 1,003 byte-matched installed files. The relevant VICT Mastra archive is `90b2de7c6515785e23b4e6370c92be019959ffca430a7980f6752d5d104c9b2c`, with installed Mastra core 1.64.0 and memory 1.28.2. The replay itself uses only built-in Node modules. [Exact closure](baseline/q4-001-installed-closure.json)
- The dataset has five source cohorts and six deliveries. The second delivery of one occurrence is the sixth category. Cedar Cut delegation uses an actual Q4-001 captured publication from a synthetic app run. The other ledgers, observation text and lifecycle controls are authored research fixtures. The acceptance artifact records fictional requests and results with an independently computed check. [Case index](fixtures/cases.json) · [Captured anchor](baseline/q4-001-cold-anchor.json) · [Captured audit](baseline/q4-001-cold-audit.json)
- I froze the source-only labels and native candidate annotations before implementing the replay. The native arm verifies recorded observation spans and joins proposed attributable claims to eligible original spans. The source-only arm reads its own labels and the same original source revisions. It verifies a source ID, exact quotation, source role and authority for each claim. Labels are human adjudications. The tool validates provenance and eligibility; the sample cannot establish general semantic entailment. [First fixture freeze](https://github.com/radz2291/VICT-Quellight-02/commit/6a3f0708e2c4831f3f1343407c0a8f9fbb1f678b) · [Claim-level labels](https://github.com/radz2291/VICT-Quellight-02/commit/629d81d7472ff8ea77301afe1fa86ad8f4358625)

## Six paired cases

| Case | Native attributable | Native unsupported / ambiguous | Source-only supported / unknown | Consequential difference |
| --- | ---: | ---: | ---: | --- |
| Delegation | 2 | 1 / 0 | 3 / 1 | Supported version-bound comments and routine retry delegation. The observation asserted internal-only access. The original turn reserved the choice for the founder. The specific policy was unknown at that epoch. |
| Correction | 1 | 1 / 0 | 2 / 0 | The owner explicitly chose internal-only access. The instruction to preserve authorized editors’ access to prior comments was omitted, and deletion was unsupported. |
| Greeting | 0 | 1 / 0 | 0 / 0 | The greeting established no durable change. The readiness-to-approve inference lacked evidence. |
| Contradictory guidance | 1 | 1 / 1 | 3 / 1 | Alex’s private Friday review was a bounded exception. Existing links stayed internal pending the owner’s decision. Public future links were unsupported and a future default for partners remained speculative. |
| Duplicate delivery | 0 | 0 / 0 | 0 / 0 | The same actor, room, thread and operation identity returned zero new evidence rows and caused zero additional source reads. |
| Independently verified outcome | 1 | 1 / 0 | 2 / 0 | Requests R1 and R2 returned the same single stored v1 comment. Reopen showed v2. The observation retained the successful retry but omitted the failed version check and claimed release approval without authority. |
| **Total** | **5** | **5 / 1** | **10 / 2** | **Five consequential observations were missing from native text.** |

Every accepted claim resolves to a current eligible source span for its replay epoch. Outcomes derived from the acceptance artifact also include the exact checked IDs and observed values. [Claims, source spans, and withheld diagnostics](result.json) · [Acceptance fixture](fixtures/acceptance-run.json)

## Publication and replay controls

The Cedar Cut positive case reproduced the app’s canonical digest of the two committed public source rows, the product job key, the `memory-job:<job UUID>` operation identity, two exact native range IDs and one historical publication. The governed `quellight.memory.maintain@1` receipt completed. This supports use of the existing boundary as a provenance anchor. The fixture retains the later superseded state separately. It emits no current evidence from that old publication. Full original native stage bytes and invocation inputs were unavailable in the capture. The replay cross-checks the native stage digest against the independent captured audit.

| Replay control | Result in both arms | Accepted rows |
| --- | --- | ---: |
| Same occurrence re-delivered | `duplicate-operation` | 0 |
| Prepared before publication | `not-published` | 0 |
| Source invalidated after the preparation event | `stale-authority` | 0 |
| Source body edited with unchanged product job revision | `source-revision-mismatch` | 0 |
| Historical publication after captured native supersession | `stale-authority` | 0 |
| Delivery for a foreign room | `scope-mismatch` | 0 |

These controls test evidence reader behavior over frozen ledgers. Q4-001 supplies the actual synthetic app publication and supersession evidence. The replay performs no new database transactions or model work.

## Cost and reproduction

| Read scope | JSON reads | Bytes read | Scoped source passes | Source bytes |
| --- | ---: | ---: | ---: | ---: |
| Shared case index and captured audit metadata | 2 | 16,119 | 0 | 0 |
| Native arm | 8 | 11,468 | 6 | 6,439 |
| Source-only arm | 8 | 11,332 | 6 | 6,439 |
| **Combined** | **18** | **38,919** | **12** | **12,878** |

Each arm reads five original source bundles and the separate changed-source control once each, plus its annotation file and the acceptance artifact. The other control paths read zero source files. No unrelated original-message file is opened. The ledger counts UTF-8 bytes from all comparison fixture reads. It excludes process startup and module files, and measures no database egress. Model requests, added foreground prompt bytes and added Send round trips were all **zero**.

From this directory on Node 22.23.5:

```text
node replay.mjs
node independent/check-acceptance.mjs fixtures
node independent/reproduce-captured-join.mjs .
```

The replay prints the same comparison, provenance, scopes and byte counts. Local duration varies. The independent reviewer inspected original sources before viewing the annotations or native text, separately validated the acceptance artifact, and reproduced the captured positive and edited-source negative. They also caught a missing version check in the first harness. The corrected predicate requires both retry requests and the stored comment to agree on the reviewed cut. [Independent review and rerun evidence](independent/README.md)

## Recommendation

Use the existing application settlement, governed operation and original-message identities for the next research slice. Require an explicit eligible source span and current authority for every learning claim. Treat native prose as a candidate input. Reserve an outcome judgment for a check with independent evidence, and retain unknowns where a decision or outcome is unconfirmed.

The smallest next test is a source-grounding shadow replay on held-out synthetic operations that span multiple threads and observation ranges, including a correction and authority change between receipt and read. Use the current public path with zero additional inference and measure eligible source resolution, omissions and read volume. If the existing observables cannot recover the messages for a committed observation, qualify a minimal public VICT receipt extension carrying operation ID, immutable eligible source IDs, scope, configuration and authority revisions at publication. Verify replay and stale-source refusal before relying on that contract. This sample gives no basis to add structured extraction or a live model call yet.

The 5-of-10 result describes this deliberately adversarial, hand-labelled fixture. It does not estimate live Observer accuracy, numbers of errors in owner conversations, hosted database traffic or cache behavior.
