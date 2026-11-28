# Q4-005 independent verification

I reran the final installed fixture in a separate disposable PostgreSQL database and audited both the builder's and the fresh capture. The fresh run used Node 22.23.5, PostgreSQL 18.6 and the pinned application at `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344`. The runner verified all 14 VICT archives, the canonical lock SHA-256 `31b606ed8bdffa497bd4621f87877900ed3767f2f0ee0a5681f384e75d75e225`, and design SHA `9dbfd28175d86b28f9a52340aa4939b4ed11db81`. The frozen source fixture came from `b588e6ffcd1b648fb42bd20bd8e6909db4db9ed5`. [Fresh audit](fresh-audit.json) [Builder capture audit](verified-audit.json)

| Question | Observed result |
| --- | --- |
| Can the current room recover the new original source? | Yes. B recovered the native user message `c8093bb2-d22c-483d-8584-4c217a192b7a` at span `[12,65)` under the new authority. It belonged to the current B group's bounded two-message range. |
| Can same-text foreign source be borrowed? | No. C's different native ID `63210d91-bdd6-4fe8-9825-9806dff6bae1` was refused on room scope before any source page read. A direct read of the B operation through C also failed with `VICT_MEMORY_OPERATION_CONFLICT`. |
| Do old publications become current evidence? | No. Old A1, A2 and B1 returned `superseded`, preserved one publication event each, and supplied no current result, checkpoint or accepted evidence. The independently observed original exclusion was the previous A user ID. |
| Does care remove unrelated eligible evidence? | B1's old receipt was stale. Its unchanged user message remained eligible and was recovered through a newly published singleton range. That same range was treated as previous when the B correction snapshot included it again. |
| What did publication omit or fail to support? | The page-number requirement was present in the original and absent from the layout observation. The scripted public-sharing approval had no matching user span and remained unknown. Duplicate delivery yielded zero accepted rows. |

I independently recomputed the canonical argument digests for five completed governed invocations and matched each to its observed operation, configuration, authority, actor and maintenance turn. The fixture adds a separate audit to find random invocation IDs across 18 namespace turn records. It is outside the scoped reader volume and its bytes were unmetered. The direct public read also showed that selected context omits the B correction's current input, so it cannot furnish that native-to-product turn mapping. [Direct public read](public-read-check.json) [Contract audit](contract-audit.md)

The fresh run measured 51 named reads in 11 attempts, 130,256 bytes of named JSON results, and 117,682 sent plus 207,486 received bytes at the loopback PostgreSQL proxy. These count different layers. The fixture generated 5 foreground and 8 observer calls through its deterministic model seam. The shadow added zero calls, Send requests or foreground prompt bytes. Live provider usage was zero.

## Reproduction

From the evidence root with Node 22.23.5, the exact installed app and design checkouts, and a fresh disposable local `q4_005_review` database on the fixture cluster:

```text
node run.mjs <installed-app> <design> postgresql://q4_fixture@127.0.0.1:<port>/q4_005_review <scratch>
node independent/check-capture.mjs <scratch>/capture.json fixture.json
node independent/check-public-reads.mjs <installed-app> <scratch>/capture.json postgresql://ql_q5_fixture_reader@127.0.0.1:<port>/q4_005_review <read-scratch>
```

Runner SHA-256 was `3fb56086792f1ce90b8c885d9a9c31780f1f6c27c1f4e460adda8a39a73f8636`. Shadow SHA-256 was `e13210173d867b6c33ba574560213eaf0a0b4b8d969a25ccdd3820dfc199a0ae`. The app checkout stayed clean. The findings concern literal spans in the observed singleton and paired native ranges, supported by disposable fixtures. They leave general group membership, bounded receipt lookup, arbitrary paraphrase, and live Observer performance open.
