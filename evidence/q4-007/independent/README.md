# Q4-007 independent installed replay

**Pass for the pinned VICT Mastra ESM candidate on Harbor.** I checked both the primary capture and a separate replay with a fresh loopback database. The fresh app consumed the same immutable two-archive install. I derived expected native IDs from ordered app originals and the actual Observer history delivered to the deterministic model seam. For Reflect I matched the copied lines to their input parent notes and reconstructed their ordered source union before comparing the public membership field. I also recomputed the six scoped capability receipt argument digests.

| Harbor case | Fresh public result |
| --- | --- |
| Opening Observe | 6 ordered IDs, `observe-input` |
| Middle and closing Observe | 2 ordered IDs each, `observe-input` |
| Outer Reflect | 8 ordered IDs, `retained-parents`. The unchanged published endpoints span 10 eligible originals. `SYN_U04` and `SYN_A04` are inside the endpoints and outside the copied-parent membership. The baseline reader accepted zero reflected IDs. |
| Old Observe and Reflect after Forget | Both `superseded`, with zero accepted IDs and no exposed result or checkpoint |
| Rebuilt Observe and rebuilt Reflect | 4 ordered IDs each, matching `SYN_U01`, `SYN_U03`, `SYN_U04`, `SYN_U05`. The forgotten `SYN_U02` is absent from both. |
| Reopen | Same committed operation, membership and publication event |
| Historical and prepared records | Fixture-authored completed record without the field returns `unavailable`. Fixture-authored prepared checkpoint with private members exposes zero IDs. |
| Ambiguous Reflect | Actual deterministic Reflect publication retains the fallback endpoints and returns `unavailable` with zero accepted IDs. |

Observation prose and endpoints matched the baseline after normalizing per-run identifiers and runtime boundary timestamps. The strict TypeScript check against installed exports verified receipt and availability narrowing, including a readonly member list. Exact archive comparison matched all 66 pinned VICT adapter files, all 69 candidate adapter files and all 205 candidate Mastra dependency files. The native proof seam runs in the candidate ESM worker. The original and candidate CJS entry and worker matched byte for byte, so this verification covers the installed ESM path.

Both comparable runs made 5 Chat, 4 Observe and 2 Reflect deterministic requests. Candidate reader model calls and live provider calls were zero. The ambiguity control had its own deterministic Reflect request. Across eight membership-reader attempts, the baseline returned 44 named results totaling 130,408 bytes. The fresh candidate returned 38 totaling 118,863 bytes. Through the fixture counter, the baseline sent and received 112,411 and 234,311 PostgreSQL wire bytes, respectively. The fresh candidate sent and received 64,474 and 169,896. The additive field occupied 2,863 serialized JSON bytes across the six current publications. These counts describe the chosen fixture and reader. The staged worker can also query the prior committed receipt to inherit membership. Source content and claim entailment require their own reads and checks.

## Reproduction

Use the parent evidence assembly for the pinned installed consumer and a fresh disposable database on loopback. Node was `22.23.5`, PostgreSQL `18.6`, and the type smoke used TypeScript `5.9.3`. App commit is `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344`, design commit is `9dbfd28175d86b28f9a52340aa4939b4ed11db81`, and the frozen fixture SHA-256 is `d038fa9710703434ef123243a76f5efe6e4e7edf749574ee7f26dc207b289fee`. The baseline capture SHA-256 is `63e8bf378ded8bf8d23014805827d84b1d1971a6a3fc4518e7c85c3be9a49ffb`. The candidate install lock SHA-256 is `9b9c90361392dd0af0f282834ad231011554f04a3e5ac2ab20eff734874563be`.

Run from the Q4-007 evidence directory with the paths set for your installation. The install instructions include normal SvelteKit synchronization.

```sh
node --preserve-symlinks --experimental-import-meta-resolve run.mjs "$CANDIDATE_APP" "$DESIGN" "$FIXTURE_DSN" "$OUT" "$BASELINE_CAPTURE"
node independent/check-membership.mjs "$OUT/capture.json" fixture.json "$BASELINE_CAPTURE"
node --preserve-symlinks independent/check-installed-archive.mjs "$BASELINE_VICT_TGZ" "$BASELINE_APP" 90b2de7c6515785e23b4e6370c92be019959ffca430a7980f6752d5d104c9b2c
node --preserve-symlinks independent/check-installed-archive.mjs "$CANDIDATE_VICT_TGZ" "$CANDIDATE_APP" 9f75998297af4755bfa1abe567f198c7b0731dd304fca1c6c06163f480e03184
node --preserve-symlinks independent/check-installed-archive.mjs "$CANDIDATE_MEMORY_TGZ" "$CANDIDATE_APP" ed2e8db8e55c60afe1dd4eb3b93b3c5308f35d7accaeff939d488724339c0ea6 "$BASELINE_MEMORY_TGZ"
```

To run the type smoke, copy `check-public-types.mts` into the isolated installed candidate root and run its local TypeScript compiler.

```sh
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext check-public-types.mts
```

[`fresh-audit.json`](fresh-audit.json) records the separate replay IDs and receipt digests. [`main-audit.json`](main-audit.json) records the primary audit. Both audit outputs bind the complete input captures by SHA-256.
