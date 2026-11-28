# Q4-007 installed Quellight qualification

The check uses the frozen Q4-006 fictional Harbor fixture on the app’s unchanged source. Quellight’s conversation service settles five ordinary synthetic turns. Its dispatcher runs four native Observe and two native Reflect requests through the installed VICT Mastra package. A scoped read-only consumer opens each committed, historical or rebuilt operation through `MastraMemoryService.operation`. The consumer accepts group members only from the typed public field and rechecks authority before returning the list. The independently captured model-delivery facts are comparison evidence outside the consumer.

## Installed result

The table uses fixture tags as aliases for the original message IDs. `U` identifies a user original and `A` an assistant original. The capture records the exact UUIDs and their order. [Exact IDs and receipt comparisons](summary.json) · [Full capture](capture.json)

| Publication | Expected ordered originals | Installed result |
| --- | --- | --- |
| Opening Observe | U1, A1, U2, A2, U3, A3 | Same six IDs |
| Middle Observe | U4, A4 | Same two IDs |
| Closing Observe | U5, A5 | Same two IDs |
| Reflect retaining the opening and closing groups | U1, A1, U2, A2, U3, A3, U5, A5 | Same eight IDs. The baseline endpoint interval had ten, including U4 and A4. |
| Original Observe and Reflect after Forget | Superseded, no current members | Both expose no result or checkpoint |
| Rebuilt Observe and Reflect | U1, U3, U4, U5 | Same four IDs for each operation |
| Reopened Reflect | U1, U3, U4, U5 | Same four IDs. The committed database result contains the same list. |
| Legacy completed fixture and real ordinal-only Reflect | Explicit unavailable | Both return unavailable with no member list |
| Prepared fixture with a private member list | No public member payload | Checkpoint preview remains, with membership withheld |

Across six completed comparison publications, the normalized observation text matched the baseline. The two matched core runs each made five Chat, four Observe and two Reflect model calls. The member reader added zero model calls, Send round trips or live provider calls. The ordinal-only negative used one separate deterministic Reflect call outside the matched runs.

| Membership-reader measurement over eight cases | Baseline | Candidate |
| --- | ---: | ---: |
| Named API reads | 44 | 38 |
| Serialized JSON across named results, bytes | 130,408 | 118,863 |
| Loopback PostgreSQL bytes sent on the shadow connection | 112,411 | 64,477 |
| Loopback PostgreSQL bytes received on the shadow connection | 234,311 | 169,846 |

The typed field added 2,863 serialized bytes across the eight candidate receipts, including 485 for the outer Reflect receipt. Each of six completed reads could skip the old endpoint reader's source-page call. These savings apply to membership lookup. A claim reader may still need the original message text. During mutation, the adapter performs at most one extra scoped prior-membership SQL lookup when a staged operation starts with current observation text. The shadow-connection meter excludes mutation queries. [Implementation and package identities](implementation.md)

An independent run used a fresh fixture database and reproduced the same membership, unavailable states, unchanged text and model counts. A separate validator recomputed the baseline interval from ordered originals and checked all current and inherited candidate groups. It also verified the contents of the two installed archives and the public TypeScript contract. [Independent verification](independent/README.md)

## Inputs and reproduction

- App behavior pinned to `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344`. Design `9dbfd28175d86b28f9a52340aa4939b4ed11db81`. Frozen fixture `5166198b4a39a59701455aa1532deb3243c34059`, SHA-256 `d038fa9710703434ef123243a76f5efe6e4e7edf749574ee7f26dc207b289fee`. [Q4-006 evidence and baseline command](https://github.com/radz2291/VICT-Quellight-02/blob/7e3f6203e0e722610df85b42fea135889f37a916/evidence/q4-006/README.md)
- Fresh baseline rerun on Node 22.23.5 and loopback PostgreSQL 18.6 verified the eight frozen read cases. Its `capture.json` digest is `63e8bf378ded8bf8d23014805827d84b1d1971a6a3fc4518e7c85c3be9a49ffb`. A new baseline capture can also be generated from the pinned runner using the exact old npm lock. The candidate test checks app behavior source, both package archive bindings, the installed VICT adapter, the patched Mastra ESM bundle and the retained CJS bundle. [Baseline capture](baseline/capture.json)
- Use a new empty synthetic loopback database named `q4_007_<lowercase-suffix>` with test administrator `q4_fixture`. The probe installs the normal schemas and separate fixture writer and shadow reader. The shadow reader cannot insert product turns, update native messages or use its indexed namespace lock grant to make actual changes. `BASELINE_CAPTURE` is the passed capture from the frozen Q4-006 runner. The installed candidate’s manifest and lock identify its exact npm tars.

```text
cd CANDIDATE_APP
node --preserve-symlinks node_modules/@sveltejs/kit/svelte-kit.js sync
cd EVIDENCE
node --preserve-symlinks --experimental-import-meta-resolve run.mjs CANDIDATE_APP DESIGN postgresql://q4_fixture@127.0.0.1:55443/q4_007_replay OUTPUT BASELINE_CAPTURE
node summarize.mjs OUTPUT/capture.json
```

## Assertions and measurement

The eight matched reads cover three Observe groups, the first Reflect, both superseded original receipts after governed Forget, one rebuilt Observe and one rebuilt Reflect. Before Forget the first reflected group includes only the two copied outer parents. The original endpoints still span both omitted middle messages. After Forget the native result uses the four kept user IDs, and the old Observe and Reflect expose no current result or membership fields. The comparison checks normalized rendered observation text against the exact baseline, allowing minted original/group IDs and timestamps to vary.

After the eight matched reads, reopening a fresh VICT application store verifies the same persisted membership. A separate read of the synthetic database checks the committed source field in the same recovery row as the published observation. The legacy and prepared fixture records are separate and explicitly fixture-authored. The legacy control removes the new field from the same shape a completed older row used. The prepared control stores a nonempty private member list and checks that the public operation exposes none of it. A separate real Reflect request returns an ordinal-only output with no copied parent line and verifies it receives explicit unavailable membership even though native text still shows the old endpoints.

The Q4-006 and Q4-007 core writer paths must use identical model invocation counts. The extra deliberately ambiguous Reflect control is outside this comparison. The reader tracks separate existing API invocations and JSON byte lengths, plus a proxy meter for loopback PostgreSQL transport. The membership-only byte delta removes that field from the same response and recomputes its serialization. PostgreSQL wire counts include startup, framing and all underlying reads on the shadow connection. Provisioning, receipt audit, writes and external provider or hosted egress are outside that meter.
