# Q4-006 independent verification

I ran the final installed fixture on a fresh disposable local PostgreSQL 18.6 database. The Node 22.23.5 runner verified all 14 VICT archives, app `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344`, design `9dbfd28175d86b28f9a52340aa4939b4ed11db81` and canonical lock SHA-256 `31b606ed8bdffa497bd4621f87877900ed3767f2f0ee0a5681f384e75d75e225`. It used frozen fixture commit `5166198b4a39a59701455aa1532deb3243c34059`. Both the fresh capture and builder capture passed the independent validator. [Fresh audit](fresh-audit.json) [Builder capture audit](main-audit.json)

The validator extracts ordered tags from the recorded Observer prompt sections and matches them to the original native IDs in the app's pre-observation inventory. It separately reads the Reflector's actual input and returned lines, identifies the copied parent notes, and combines the tag-bound IDs of those parents. It reconstructs each public interval from the endpoints and the current source inventory. The fixture's tags and captured model input are independent comparison evidence. The measured reader gets only public operation and source reads.

| Publication | IDs independently established | Public interval | Accepted by the bounded reader |
| --- | ---: | --- | ---: |
| Opening Observe | 6 input IDs | The same 6 in order | 0 |
| Middle and closing Observe | 2 input IDs each | Both pairs match in order | 2 each |
| Outer Reflect | 8 IDs from copied opening and closing notes | 10 eligible IDs, including both middle-parent IDs | 0 |
| Rebuilt Observe and Reflect | 4 each | 9 interval IDs, of which 4 are eligible and 5 rejected | 0 |

All three parent notes reached the Reflector before Forget. The captured prompt omitted the parent group markup, IDs and ranges, which remained available to the native reconciliation path. The scripted reply preserved the two outer notes. The public range included two still-eligible middle-parent IDs. That is a membership over-inclusion relative to the copied-parent lineage. It says nothing about whether the Reflector considered the middle note while producing its answer. The opening and rebuilt cases happened to match the independently established IDs after eligibility filtering. That agreement does not prove a general endpoint-to-membership contract.

The governed Forget excluded the interior `SYN_U02` native user ID. Nearby user IDs `SYN_U01` and `SYN_U03` remained eligible. The old Observe and Reflect operations each retained one historical publication event, returned `superseded` with result and checkpoint cleared, and yielded zero accepted IDs. The rebuilt observation and subsequent reflection excluded the forgotten ID from their four known members even though the raw interval still enclosed it.

I independently recomputed six canonical VICT invocation argument digests. The separate fixture audit searched 14 namespace turn records to find those receipts. Its bytes are outside the scoped reader measurement. The fresh reader recorded 44 named reads across eight attempts and 130,408 bytes of named JSON results. The loopback PostgreSQL proxy recorded 112,410 sent and 234,291 received bytes. Fixture setup and replay dispatched five deterministic chat, four Observe and two Reflect calls. The reader added zero inference and zero Send round trips, and the fixture called no live provider.

The public publication contains endpoints and committed scope and authority, while exact per-group ordered membership remains missing. The reproduced loss arises where the first and last selected parent bounds replace the parent-member union. Preserve the publication's ordered eligible original IDs with an explicit unavailable state when the adapter lacks reliable lineage. [Installed contract audit](contract-audit.md)

## Reproduction

From the evidence root, with Node 22.23.5, the verified app and design checkouts, and a fresh disposable local database:

```text
node run.mjs <installed-app> <design> postgresql://q4_fixture@127.0.0.1:<port>/q4_006_review <scratch>
node independent/check-capture.mjs <scratch>/capture.json fixture.json
```

Runner SHA-256 was `0c6b56df8275b76faccba0b00cd5d514811e07f927698dd3f3c52079a6ad0132`. The consumer exercised in both runs had SHA-256 `d03c412c6be8e4fde6f3b1359c908f99db11e605de1e21a8ba4001240d066dcf`. The published file has SHA-256 `a33f3187c867eefd3705a1bbc3f40720833c55dd1d0121267d08427855e5a7de` after converting its final CRLF to LF. This is a local synthetic exercise of source membership and authority. It does not measure live model accuracy, paraphrase provenance, concurrent authority races or hosted traffic.
