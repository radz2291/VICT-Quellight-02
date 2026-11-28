# Q4-011 · Quellight voice audition preparation

Three speaking conditions are pinned and the seven-case owner reading is prepared. This run exercised the installed VICT/Mastra model boundary on fictional conversations. The real audition needs an eligible GLM-5.3-Flash route. [Provider readiness and live setup](provider-readiness.md)

| Speaking condition | Assembled UTF-8 bytes | SHA-256 |
| --- | ---: | --- |
| Current Quellight | 79 | `6d97f9a426099a450fb4c8d48748d105c918714e652bd4a7720adca7cd411966` |
| Frozen legacy | 12,842 | `10d3c558097a7955c66ce66cc9b07c3ce2253abc67ee11274d110ef6d21177ea` |
| Eight movements | 30,489 | `23adc723ab5a8d25dcc1371e2a70df248c4f6db1eb9c141df58f5c2ca8b77254` |

The pinned app contributes the first catalog element. The alternate fixture replaces that element's effective resolved prefix at activation, after native memory settings have been resolved. The other catalog elements, room purpose and a saved fixture response-guidance override remain in the governed composition. Q4-009 contributes one scoped room-approval lookup after authenticated room and native authority resolution. Its eligible text enters the immutable instructions before Desk. The unmodified app control produced the same system text as the empty-context fixture control. [Voice instrumentation](instrumentation.mjs) · [Installed capture](capture.json) · [Q4-009 room binding](https://github.com/radz2291/VICT-Quellight-02/blob/eb583cd56d4594374335cf89e542f691b980ff80/evidence/q4-009/README.md)

Original Quellight is pinned at `0025fb0b47fcc7b6f0de4da642898b7e9f79db31`. Its nine archive text files match both committed blobs and the checked-out files byte for byte. The frozen legacy file has no editorial delimiter and retains its trimmed body. The archive assembler strips the editorial passages in all eight movements, then joins `soul`, `root`, `tradition`, `moment`, `knowing`, `bond`, `boundary` and `tendencies` with blank lines. A second implementation recomputed the strings and matched an execution of the archived assembler. The explicit `.ts` import extension adapts it for Node's TypeScript loader. The reviewed ARA default from `c70e574fccde3241ab005001322d2fe734748eee` equals the frozen legacy archive file byte for byte. The exact reconstructed voice and SDK prompts remain in local private files. [Per-file and assembler pins](capture.json) · [Assembly check](voices.mjs)

## Installed results

All 48 study turns settled through the installed conversation service and called the deterministic SDK model once. Each system prompt begins with its pinned voice exactly once, and its digest recomputes the persisted VICT instructions revision. Across 16 matched turn trios on 42 fresh threads, the operating text, saved guidance, native Working Memory and ordinary conversation content, model profile and defaults, recall and Desk tool schemas, grant and write-approval policies, and Desk revision matched. The six shared correction-prefix turns carried the same preceding reply into their paired correction tests. The same approved room block entered each of the 24 approved-context requests before Desk and appeared in none of the 24 empty-context requests. Once that single block was removed for comparison, the remaining effective content matched across both passes.

Fresh threads give each request its own thread header, time metadata and recall capability revision. The comparison aliases only the SDK `mastra.createdAt` field, the exact bound thread header and the exact admitted recall revision inside its tool description. Raw digests remain in the evidence. The two setup calls are outside the 48-turn comparison. Fixture replies verify the transport and context. Radzi's voice decision awaits eligible live replies. [Matched capture and raw digests](capture.json) · [Comparator](comparison.mjs) · [Evidence audit](audit.mjs)

## Owner reading

Read the seven cases with empty approved context, then repeat them with one identical approved room revision in all three conditions. The cases cover practical help, a factual question in one sentence, a weak premise that invites depth, a vulnerable moment, explicit correction, reserved choice and delegated judgment. The correction has a fixed preceding exchange. Reading positions rotate across cases. The published order contains opaque codes and a commitment to the private reveal key. The prepared sheet includes an unscripted continuation of the practical exchange and space to record which turn mattered and where the decision stayed with the owner. [Frozen wording](scenarios.json) · [Sealed reading order](blind-order.json) · [Private reader generator](reader.mjs)

## Reproduce the preparation

Use app `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344`, design `9dbfd28175d86b28f9a52340aa4939b4ed11db81` and the original Q4-009 installed closure. Use Node 22.23.5, normal SvelteKit sync in the pinned app and a new loopback PostgreSQL fixture owned by `q4_fixture`. Supply both private archives and their matching source checkouts. The runner validates 14 archive pins, the installed package closure, source blobs and composed inputs. Keep PRIVATE_DIR outside repository checkouts.

```text
node --preserve-symlinks --experimental-import-meta-resolve capture.mjs APP DESIGN postgresql://q4_fixture@127.0.0.1:55443/q4_009_replay ORIGINAL_QUELLIGHT ARA_LIGHT QUELLIGHT_ZIP ARA_ZIP PRIVATE_DIR SANITIZED_CAPTURE_JSON
node reader.mjs freeze PRIVATE_READER NEW_BLIND_ORDER_JSON
node reader.mjs render PRIVATE_READER NEW_BLIND_ORDER_JSON
```

Use the retained private key with the published order to reproduce the existing owner sheet. A new freeze creates fresh opaque codes. The source archives belong to the owner and are available separately from this package. [Exact app package baseline](https://github.com/radz2291/VICT-Quellight-02/blob/14b6ccaf6f409eac3e041dc3d9abd0bb9f875344/baseline.json) · [Pinned qualification protocol](https://github.com/radz2291/VICT-Quellight-02/blob/9dbfd28175d86b28f9a52340aa4939b4ed11db81/docs/PHASE-4-QUALIFICATION.md#4-4i--identity-and-the-owners-felt-gate)
