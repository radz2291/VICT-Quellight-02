# Q4-004 independent review

The captured Cedar Cut provenance join and changed-source rejection both reproduced with Node 22.23.5 from the frozen evidence. The app baseline was `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344`, the design was `9dbfd28175d86b28f9a52340aa4939b4ed11db81`, and the original fixture commit was `6a3f0708e2c4831f3f1343407c0a8f9fbb1f678b`. All review checks used local synthetic files and no network, database, provider or application endpoint.

## Source and result review

I recorded the [source-only assessment](source-only.md) before opening either label file or native observation. The original Cedar Cut turn establishes version-bound comments, delegation of routine retries, and the owner's reserved visibility decision. The scripted published observation instead says internal-only visibility was chosen. The later correction belongs to another replay scope. It cannot fill the earlier gap. The native claim is unsupported despite its exact range and committed receipt.

Checking the raw acceptance artifact independently established one successful retry deduplication and one failed reopen/version check. The two requests for one intent returned the same stored v1 comment. Reopen rendered that comment against v2. The artifact binds the observed result to this fixture only. It gives no cause, release approval, or evidence about a second execution. [Raw artifact check](acceptance-check.json)

The frozen labels broadly match the separate source reading. In the contradiction case, possible future partner access is speculation with an unresolved permanent policy. Its ambiguous status contributes zero accepted claims. The status count depends on that annotation policy. The temporary Alex-only case and existing-links-internal rule remain distinct. For the delegation case, “unknown from this source snapshot” is the supported meaning of undecided visibility. The source cannot establish a policy the owner might have chosen elsewhere.

## Reproduction

From the evidence root, with Node 22.23.5:

```text
node independent/check-acceptance.mjs fixtures
node independent/reproduce-captured-join.mjs .
```

The positive reproduction independently serializes the ordered public rows and recomputes their revision and the product job key. It joins the captured historical publication epoch to the native operation/range and the completed governed receipt recorded in the prior database audit. The altered-source control changes the user's body in memory, retains the original pinned revision, and rejects the calculated mismatch. [Positive and negative output](reproduced-join.json)

I also reran the integrated candidate from an independent working directory and checked every paired result, control and read-ledger entry. Native yielded 5 attributable, 5 unsupported and 1 ambiguous claim. Source-only yielded 10 supported and 2 unknown claims. Both arms accepted zero from the duplicate and all five negative controls. Each arm read five original source snapshots and a separate changed-source fixture exactly once. Native read 8 files and 11,468 bytes. Source-only read 8 files and 11,332 bytes. The shared inputs added 2 files and 16,119 bytes. The independent file-size cross-check is outside those replay counts. [Integrated check](candidate-check.json)

The first reviewed runner accepted a retry with the same intent and comment ID but a changed cut version. The final runner rejected the isolated mutation of R2 from v1 to v2 before emitting a result. The original acceptance fixture still verifies the retry pass and reopen fail. [Artifact counterexample](artifact-counterexample-check.json)

```text
node replay.mjs > replay-review-output.json
node independent/check-integrated-result.mjs replay-review-output.json .
node independent/reproduce-artifact-counterexample.mjs . ../q4-004-acceptance-mutation-scratch
```

The public digest and native stage digest have different inputs. The latter cross-checks the captured anchor and database audit. The full stage envelope and raw invocation argument record are absent from these fixtures, so the replay does not independently re-derive them. The published observation became superseded under later authority while the completed receipt and historical publication event remained. Preserve that distinction when reporting present eligibility.

This is a hand-labelled, targeted calibration in a single synthetic domain. The additional ledgers and malformed controls exercise policy branches. They provide no estimate of live Observer accuracy, the frequency of errors or hosted resource impact. A verified operation proves provenance and execution. A source quote, its scope, and relevant verified outcome determine which claim is supported.
