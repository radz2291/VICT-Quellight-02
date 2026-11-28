# Candidate implementation and build

The candidate adds `MemoryObservationSourceMembership` to a completed native memory operation result. A consumer calls `MastraMemoryService.operation(conversationId, operationId)` and reads `result.sourceMembership` after narrowing the operation result. The result schema is `vict.mastra-observation-membership@1`. Each current observation group has a `groupId` and either `status: available` with `basis` and ordered `messageIds`, or `status: unavailable`. An empty group list represents an operation with no parsed groups. The field remains optional on the general mutation type for storage profiles outside the recoverable thread path.

## How membership reaches the committed receipt

- The exact Mastra Observer runtime records the IDs of originals that produce rendered content in the final observer-history prompt. The thread strategy attaches those IDs to the single newly appended, verified observation wrapper. Staged groups inherited from a prior publication must have the same content, range and kind, and their original IDs must remain eligible.
- The Reflector retains parent IDs inside Mastra's existing exact-line reconciliation, before it combines the parent ranges. It carries the proof from the accepted compression attempt into the native storage input. Every retained line must have a unique parent and each implicated parent must already have available membership. Novel text, shared lines, duplicate group IDs, ordinal-only and whole-input fallback have no verified parent membership.
- The stage receives only the configured thread's authorized source originals. It deduplicates membership and orders it by the captured originals. One scoped read can recover prior membership from a completed receipt matching the resource, thread, authority, configuration and current observation ID and text. Divergent candidate receipts for that same state fail closed.
- The checkpoint carries the proof in the privileged recovery journal. The same authority-fenced transaction publishes observation storage and commits the operation result. `MastraMemoryService.operation` preserves the existing prepared checkpoint preview and withholds membership from it. A completed legacy receipt projects an explicit unavailable entry for each parsed group. Authority supersession masks both the current result and checkpoint at that interface.

The guarantee is the published group's source membership. Supported qualification covers the VICT ESM recoverable thread path with the pinned Mastra pair. Mastra's CommonJS build retains the baseline implementation. The ESM bundle changed for this candidate has its baseline source map removed. The rest of the registry source map set is preserved. Claim entailment still requires reading the source content. No schema migration is required. The changed dependency pin contributes to the configuration revision, so rollout would require a decision about old in-flight operations under the original pin.

## Exact package inputs

| Artifact | Version | SHA-256 |
| --- | --- | --- |
| Shipped VICT Mastra | `0.4.0-rc.1` | `90b2de7c6515785e23b4e6370c92be019959ffca430a7980f6752d5d104c9b2c` |
| Shipped Mastra Memory registry tar | `1.28.2` | `f1469f784fbb8385376936e20ad1e89364221f0fe3f53412094955a976527e07` |
| Candidate VICT Mastra | `0.4.0-rc.1-q4-007.1` | `9f75998297af4755bfa1abe567f198c7b0731dd304fca1c6c06163f480e03184` |
| Candidate Mastra Memory | `1.28.2-q4-007.1` | `ed2e8db8e55c60afe1dd4eb3b93b3c5308f35d7accaeff939d488724339c0ea6` |

VICT source `d30a63434645a594359cfd157cc6ab7a9b66245c` is based on the exact shipped packaging source `03f1f1e4bffadbf38c6bf1f756754eee8ec6a41a`. The review branch contains the candidate change and built archives. The packaging base remains in the existing source retention workspace. [Implementation patch](implementation.patch) · [Candidate packages](packages/)

With Node 22.23.5, npm 11.21.2, Python 3.12.10, the pinned app lock and the retained VICT compiler dependency tree with TypeScript 6.0.3, use the following commands. Run the VICT build from the exact packaging base with `implementation.patch` applied. `NPM_CLI` and `TSC` refer to the pinned npm and TypeScript entry points.

```text
node NPM_CLI pack @mastra/memory@1.28.2 --offline --ignore-scripts --pack-destination ARTIFACTS
python patch-mastra.py ARTIFACTS/mastra-memory-1.28.2.tgz PINNED_APP/package-lock.json ARTIFACTS/mastra-memory-1.28.2-q4-007.1.tgz
git am IMPLEMENTATION_PATCH
node TSC -p packages/mastra/tsconfig.json
cd packages/mastra
node NPM_CLI pack --ignore-scripts --pack-destination ARTIFACTS
```

For replay, the two ready-built review archives support the installation command in [Source and disposable consumer](capability/METHOD.md).
