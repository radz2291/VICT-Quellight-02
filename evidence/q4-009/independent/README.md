# Q4-009 independent room context replay

**Pass for 11 paired cases on a fresh database.** The paired short workload uses the installed conversation service and the same 14-archive VICT closure in both arms. The room-state arm adds a fixture-only approval lookup and activation composition. I parsed the raw ordered LanguageModelV2 messages, checked exact prompt and per-message digests, joined admitted turns to approved room, owner, source and authority, and recomputed the six care command digests. I also read the durable VICT activation for each of the 22 turns through the installed governance port and recomputed its pinned instruction revision from the actual first system message. The matcher compares original instruction text, Desk content, settings revision, input and deterministic reply across each pair. It normalizes fixture-specific Desk identifiers.

| Case | Evidence checked |
| --- | --- |
| Reopen after correction | The runner closes the prior module runtime and opens a fresh one on the same conversation. The actual first system message carries R2 once after the base instructions and before Desk. R1 is absent across all roles. A deliberate R2 echo remains in an assistant history message, distinct from the injected block. |
| Forget the approved source | The governed action excludes the exact approved original and advances native authority. The last eligible request demonstrates an R3 block and history echo. After Forget, the scoped read returns an empty result and the next request contains none of R1, R2 or R3 in any role. Ordinary instructions, Desk and current native context continue through the installed path. |
| Compacted carry | A real installed Reflect publication contains the deliberate R1 carry. The following request receives that carry in the native system message. The first R2 request after care contains no R1. |
| Fresh conversation and another room | The fresh conversation in the same room gets the same R1 block and approved source as the original. The unrelated room under the same actor receives no block or carry. |

The approval rows bind a checked user original to an actor, room and native authority. The fixture exercises supersession through governed authority changes. Its read selects the current exact authority row and falls back to the baseline activation composition when none is present. Production integration, same-authority revision changes, and preservation of an unrelated room's own approved revision after actor-wide care remain outside the tested scope.

The room block took 328, 338 and 342 UTF-8 bytes for R1, R2 and R3. The matched SDK JSON inputs grew by 350, 360 and 364 bytes, respectively. Both fallback cases had zero prompt byte growth. The room-state arm made one additional approval read per turn and both arms made one deterministic foreground model call per turn. The active block began 2,162 UTF-8 bytes into the first system message. The changed-to-reopened R2 pair shared a 4,634-byte serialized prompt prefix. The initial R1-to-R2 pair shared 2,237 bytes.

The independent run reversed the primary arm order. Across 11 pairs, the median room-state-minus-control elapsed time was −147.59 ms at the first local model delta and −239.95 ms at settlement. Primary short medians were +137.72 ms and +236.14 ms. The isolated selector probe separately measures the approval read. Live provider cache, token statistics and time to first visible output were unavailable.

## Reproduce

Use the pinned, installed app and design checkouts and a fresh disposable database named `q4_009_review` on the loopback fixture cluster. Run from the Q4-009 evidence directory with installation paths and fixture DSN supplied as environment variables.

```sh
node --preserve-symlinks --experimental-import-meta-resolve run.mjs "$APP" "$DESIGN" "$FIXTURE_DSN" "$OUT" short room-block,control
node independent/check-room-context.mjs "$OUT/capture.json"
node --preserve-symlinks independent/check-activation-bindings.mjs "$APP" "$FIXTURE_DSN" "$OUT/capture.json"
node measurement/summarize.mjs "$OUT/capture.json" "$OUT/summary.json"
```

| Pin | Tested identity |
| --- | --- |
| App | `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344` |
| Design | `9dbfd28175d86b28f9a52340aa4939b4ed11db81` |
| Canonical app lock SHA-256 | `31b606ed8bdffa497bd4621f87877900ed3767f2f0ee0a5681f384e75d75e225` |
| VICT Mastra archive SHA-256 | `90b2de7c6515785e23b4e6370c92be019959ffca430a7980f6752d5d104c9b2c` |
| Mastra Memory `1.28.2` archive SHA-256 | `f1469f784fbb8385376936e20ad1e89364221f0fe3f53412094955a976527e07` |
| Node and PostgreSQL | `22.23.5` and `18.6` |
| Frozen workload SHA-256 | `2548014bdd4c0b8aca5d310ae0b27620a5691222ed5c7cfb04630f2b28bfbab7` |

[`fresh-capture.json`](fresh-capture.json) is the independent raw synthetic capture with SHA-256 `6fa8f0b2151a2bfc408c3ebafa9d347ebe72d5467ca9085a67e435ac906261d5`. [`fresh-audit.json`](fresh-audit.json) records the prompt and care joins. [`activation-audit.json`](activation-audit.json) records the durable activation readback. [`fresh-summary.json`](fresh-summary.json) contains the reversed-order short measurements. [`main-audit.json`](main-audit.json) binds the separate primary trace.
