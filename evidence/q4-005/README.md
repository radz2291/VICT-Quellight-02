# Q4-005 · Ground room learning across threads after a correction

**28 November 2026 · Review report**

The installed path recovered the exact original user span for the new correction in thread B. It refused the revoked publication from thread A, two other prior-authority publications, both duplicate deliveries and identical source text in a different room. The bounded replay could resolve single-message and adjacent user/assistant ranges from the installed observation markup and the app’s scoped source page. **The public operation has no typed, immutable list of member messages for each published range.** That is the first missing source link for a general-purpose evidence reader. [Full installed capture](capture.json)

## Baseline and replay

- App `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344`, design `9dbfd28175d86b28f9a52340aa4939b4ed11db81`, Node 22.23.5 and loopback PostgreSQL 18.6. Canonical lock SHA-256 `31b606ed8bdffa497bd4621f87877900ed3767f2f0ee0a5681f384e75d75e225`. The reused exact install verified 14 VICT archives and 1,003 installed package files, including Mastra archive `90b2de7c6515785e23b4e6370c92be019959ffca430a7980f6752d5d104c9b2c`. [Installed closure](closure.json)
- The world of the fixture is a fictional rehearsal. A and B are separate conversations in the same room. C belongs to the same owner in a different room. The user quotes, roles, expected authorities, scoped negatives, omitted layout clause and unknown approval claim were frozen at `b588e6ffcd1b648fb42bd20bd8e6909db4db9ed5` before replay. Exact native message and operation IDs were captured after the installed path minted them. [Frozen fixture](fixture.json) · [Fixture commit](https://github.com/radz2291/VICT-Quellight-02/commit/b588e6ffcd1b648fb42bd20bd8e6909db4db9ed5)
- The unchanged app conversation service started, executed and settled five turns. The real memory dispatcher and worker published the associated native observations. Public memory activity supplied each new job ID in this one-writer fixture. The only model seam returned deterministic fixture text. It ran 5 foreground and 8 Observer calls, including 3 normal care rebuild calls. The governed Forget action queued one purge and three rebuilds and excluded the actual A source ID. The explicit owner correction was a new turn in B under the resulting authority.
- The reader starts from the discovered operation and app conversation scope. It checks current authority, reads `MastraMemoryService.operation()`, and resolves the markup’s endpoint IDs through `memorySourcePage`. It checks eligible IDs, role and a unique exact user span, then rechecks the authority and exclusions. There is no pre-built message join in the reader. This is a local trusted-service test, with no HTTP or browser coverage.

## Expected and captured cases

The source IDs below are native message identities. The capture separately records product settlements and their actual turn IDs. The evidence reader does not infer a native-to-product turn mapping from matching text.

| Case and authority | Captured result |
| --- | --- |
| A original, `0` | Source `a8cd8b59-c429-4635-82cb-01e078848872`, span `[0,63)` asks to invite all workshop volunteers. Its original receipt completed. |
| A layout, `0` | The snapshot carried two ranges. The earlier range was skipped, and `6c098d04-28ea-43f5-8369-5eaa368a5de5`, `[0,44)`, supported 24-point type. The same original message contains “Keep the page number on every page.” at offset 45. That clause was absent from native prose. |
| B accessibility, `0` | Source `adb625ec-2035-48b8-938c-8c343ffcc959`, `[0,46)`, reserves two seats. This is a same-room source in the other conversation. |
| Duplicate A and foreign C | Zero accepted rows and zero source-page reads. C’s originally committed correction text is identical to B’s later correction, with a distinct native ID `4dbd65a3-6f89-46d1-a79a-1598d37cd51d`. The shadow checked C’s room metadata only. |
| After care, old A original, A layout and B accessibility | Each historical operation returned `superseded` with `result` and `checkpoint` set to null. Each retained one historical publish event, and the excluded A source remained in the current policy. All three yielded zero rows and zero source-page reads. |
| B rebuilt accessibility, new authority | Supplemental witness after the governed rebuild. A singleton range attested the same surviving B source under the new authority. This shows that superseding the old receipt did not erase the eligible original. |
| B correction, new authority | Source `a03beb8b-1bba-4505-b5df-5435bab5adee`, `[12,65)`, says “Only the stage manager may open the rehearsal export.” The carried singleton range was skipped as already read under this authority. “The producer approved public sharing.” had no unique user span and stayed unknown. Redelivery produced zero rows and zero source-page reads. |

The main capture’s authority progressed from `0` to `care:b30d8ab18736f1678b72a7d706b5c28c7b7255478a611fa43233260e4308ae55`. Fixture chronology captures the actual Forget action before B’s corrective turn. Duplicate delivery itself is an authored input; actual foreign scope, authority invalidation and governed recovery are installed-path observations. [Expected and observed joins, spans and refusals](capture.json)

## Public contract and recommendation

Correction operation `memory-job:25b3468c-0896-49d2-8206-6d8478ea1b9d` committed under the new authority. Its result exposes `operationId`, `sourceRevision`, `configurationRevision`, `observed`, `reflected` and `snapshot`. The snapshot contains an observation text field and its native group markup, plus conversation/resource scope and authority. Neither the committed record nor that observation view carries an immutable ordered message-ID list per group. `sourceRevision` is the native stage digest, distinct from the product transcript digest. A digest cannot enumerate members.

The capture’s separate receipt audit reads the indexed store’s unfiltered `listTurns()` and filters the operation, actor and thread. It then fetches the exact maintenance turn’s completed `quellight.memory.maintain@1` invocation. Its canonical argument digest matches the observed operation, source digest, configuration and authority. All five receipts matched. The correction invocation is `a719a407-f37b-4827-969a-c229d2489951`. That fixture audit read 18 namespace turn records. The room shadow made no such census. The operation exposes no invocation ID for a bounded direct join.

**Use the existing scope and authority checks for bounded research.** For a general reader that needs exact membership inside a longer or reflected range, qualify a minimal committed provenance field containing the observation group ID and ordered eligible native message IDs. Reuse the operation’s existing owner/resource, thread, source, configuration and authority fields. Guard provenance at publication and mask it after supersession. If the next use requires a bounded join to the governed effect, include its invocation reference in the same publication witness. Quellight can continue applying room policy through its existing product scope. No receipt extension is implemented here.

## Read volume and limits

| Shadow phase | Named reads | JSON response bytes | PG wire sent / received bytes | Ranges examined |
| --- | ---: | ---: | ---: | ---: |
| Before care | 23 | 60,088 | 57,300 / 98,992 | 4 |
| Supplemental B rebuild | 6 | 16,011 | 16,638 / 30,332 | 1 |
| After correction | 22 | 54,157 | 43,746 / 78,130 | 2 |
| **Total** | **51** | **130,256** | **117,684 / 207,454** | **7** |

Five product source pages were read in total, one each for the four primary accepted operations and the supplemental rebuild. The other six deliveries read zero source pages. Named reads count the selected public calls and their serialized responses. Wire bytes include all traffic through the shadow-only loopback proxy, including underlying SQL and framing. The fixture writer, separate receipt audit and bootstrap are outside the shadow metrics. These figures describe a local fixture; they do not estimate hosted egress or response latency. All shadow inference calls, live provider requests, additional foreground prompt bytes and Send round trips were **zero**.

The first setup attempt used PostgreSQL’s default read-only transaction mode and hit an indexed metadata `FOR SHARE` requirement. The final fixture grants a single column update privilege for that read lock and denies actual updates via its fixture-only trigger. A write probe verified the denial and the SQL reader lacks transcript insertion and native-message update privileges. An intermediate harness counted an already queued rebuild as already completed. The final witness uses the real completed-event delta. The installed paths and product schemas were unchanged.

This fixture covers short, bounded ranges and a sequential authority change. Exact-string matching is conservative in the replay. The observed omission and unknown show why source linkage alone cannot support paraphrase, entitlement or general semantic accuracy.

## Independent reproduction

The reviewer reran the fixture on a fresh database and matched a newly minted B source ID and exact span under the new revision. The reviewer independently recomputed all five governed invocation digests. The direct installed read refused a B operation looked up through C with `VICT_MEMORY_OPERATION_CONFLICT`. It also confirmed that selected context omits the current input and cannot recover a stable native-to-product turn mapping for the correction. [Independent report](independent/README.md) · [Fresh capture audit](independent/fresh-audit.json) · [Direct public read](independent/public-read-check.json)

## Reproduce

Use the pinned installed app checkout, separate pinned design checkout, and a new disposable PostgreSQL database bound to `127.0.0.1`. The runner requires Node 22.23.5, loopback username `q4_fixture`, an explicit port, and a database name such as `q4_005_replay`. `q4_fixture` needs local provisioning rights for the isolated schema. On the pinned app run `npx --yes npm@11.21.2 ci` and `npm run verify:baseline` to recreate the installed archive closure. The runner creates the fixture schema and two limited logins in the disposable environment.

```text
node run.mjs APP_CHECKOUT DESIGN_CHECKOUT postgresql://q4_fixture@127.0.0.1:55443/q4_005_replay OUTPUT_DIRECTORY
node independent/check-capture.mjs OUTPUT_DIRECTORY/capture.json fixture.json
```

[Runner](run.mjs) · [Shadow reader](shadow.mjs) · [Independent reproduction](independent/README.md) · [Accepted Q4-004 report](https://github.com/radz2291/VICT-Quellight-02/blob/52b7741b333aa4edb40723e214d2b00836156140/evidence/q4-004/README.md)
