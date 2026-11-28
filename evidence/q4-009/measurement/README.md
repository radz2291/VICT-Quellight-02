# Q4-009 paired delivery measurement

The long workload freezes 104 synthetic Cedar Cut exchanges per arm. Both arms receive the same prompts, scripted replies, ordinary memory policy, Desk state and maintenance cadence. The runner waits two seconds before turn 26, advances authority through governed care and approves `r2` before turn 51, and performs a real Desk revision before turn 70. The candidate carries approved room revision `r1` through turn 50, then `r2` through turn 104. Dispatch occurs after every ten settled turns and once at the end. The runner schedules explicit native Reflect after turns 40 and 80. It confirms each publication and samples the following turn. This cadence differs from Q4-003’s dispatch after every long turn. Their timing and traffic are separate observations. [Frozen workload](workload.mjs)

Short cases cover first use, repeat, reopening, a fresh conversation in the same room, another room, a changed room revision, owner correction and source exclusion. The runner records the actual fixture actions and authority selections separately from the model-bound capture. Room-state markers appear in synthetic approved blocks and explicitly declared carry controls. The controls put a unique marker in a scripted reply to exercise later derived or carried context, while holding matched inputs and replies constant across arms. A missing current eligible revision has zero approved blocks and zero approved room-state bytes. A case can separately demand the absence of an excluded marker anywhere in the received model messages.

The exact local model-bound message array is sampled inside the installed deterministic model interface. `summarizePrompt` records every message’s role, UTF-8 serialized size and digest, plus total array size and digest. The approved Room State payload is decoded directly from the received text, measured separately and checked for the exact revision, position and occurrence count. The analysis checks that one revision retains identical block bytes across repeated readings. This records delivery and presence with no claim about the model’s reasoning or answer quality. [Capture](prompt.mjs)

| Measurement | Interpretation |
| --- | --- |
| Approved room-block bytes | Exact UTF-8 measure of the contiguous tracked block at the model interface, before provider serialization. |
| Paired total prompt delta | Candidate minus control for each matched request. It includes all differences present in the separately run arms, including any incidental metadata. |
| Common leading messages | Exact role, byte length and digest equality for complete serialized messages before the first difference. The byte count excludes array delimiters. |
| Common initial JSON bytes | Exact byte prefix of the serialized model-interface arrays when full synthetic copies of both neighboring prompts are captured. This can count shared authored instructions inside a changed message. |
| Duration and requests | The manifest supplies foreground model calls and monotonic timings. Admission, first local model delta, first observed application event and settlement are distinct. The analysis derives the time from first local model delta to settlement separately. An unavailable milestone has no sample. |
| PostgreSQL wire traffic | Optional byte counts in both directions from the loopback foreground meter. Transport includes framing and writes. An explicitly counted added room-selection read remains a separate metric from physical I/O and hosted egress. |
| Provider tokens and cache | Only usage tagged as actual provider telemetry enters observed distributions. Fixture usage is counted separately. Missing provider fields are unavailable. A matching prompt prefix does not establish a cache hit. |

Use the short cases and long probes at turns 1, 2, 10, 49–52, 75, 80–81, 100 and 104. The long prefix summary compares adjacent captures in each arm and separates the planned revision change from unchanged turns. The long completion check requires all turn indices, even when the sample table displays a subset. Report prior-run data only as context and state the actual achieved pair count. [Analyzer](summarize.mjs)

The sampled ordinary-context comparison excludes the first system message containing the approved block and Desk composition. For the remaining messages it preserves order, roles, marker text and substantive content while normalizing UUIDs and native observation-group IDs with first-appearance aliases, ISO timestamps and `mastra.createdAt` epoch fields. The parity result is limited to the saved full arrays. Raw prompt hashes, byte totals and prefix measurements still use the unnormalized captures. The control summary independently checks matched ordinary-memory settings and authored instruction hashes, and reports Desk/approval/schedule parity, background model call deltas and completed jobs separately.

The JSON input is `{ pins, rows }`, with optional `markers`, `expectedLong`, `expectedPlacement` and scenario `evidence` at the top level. Each row has `caseId`, `arm` (`control` or `room-block`), `scenario` (`short` or `long`), `prompt` from `summarizePrompt`, and any recorded `foreground` measurements. `index` orders the long sequence. `expectedRevision`, `selectedRevision`, and `inputSha256` can document fixture intent, pre-model selection and matched input identity. `requiredCarry` names a marker expected beyond the first system message, `allowedCarry` permits listed optional markers there, and `confirmedAbsent` rejects listed markers anywhere. An earlier declared echo permits its marker only in the same thread and arm while the same revision remains current. `providerUsage`, when present, must declare `source` as `provider` or `fixture` to enter usage counts. Independent reviewers can rehash any saved synthetic array and compare its recorded digest and occurrence locations.

```text
node measurement/summarize.mjs CAPTURE_MANIFEST.json MEASUREMENT_SUMMARY.json
```

The analyzer smoke check covered the paired 104-turn input shape and eight short cases using generated unit data. It accepted a declared carry control, rejected undeclared and forbidden carry, and kept fixture token values separate from provider-cache evidence. Actual installed runs and database measurements are recorded in the qualification capture.

## Direct selector timing

After the primary run finishes and while the same disposable database is available, use the exact read-only selector probe. It extracts the query from the captured overlay, verifies its source digest, and uses the already recorded bind arguments for the successful first short case and the empty post-exclusion case. One persistent loopback connection alternates query order across 20 measured pairs after warming both paths. This measures round trips for the small SQL read by itself. It cannot attribute the sequential full foreground difference to that query or reproduce hosted behavior.

```text
node measurement/selector-timing.mjs APP LOOPBACK_FIXTURE_DSN PASSED_CAPTURE.json SELECTOR_TIMING.json
```

## Observed result

The installed run matched all 11 short and 104 long cases. Every matched pair had the same recorded ordinary-memory settings revision and authored-instruction hash. The sampled ordinary context agreed in all 11 short and 13 long captures after the stated normalization. Both arms had the same Desk revisions, approved payload hashes and maintenance schedule. [Measured summary](summary.json)

| Observed candidate minus control | Short pairs | Long pairs |
| --- | ---: | ---: |
| Model-facing JSON size, paired median | +350 B | +360 B |
| Foreground model calls per turn | 0 added | 0 added |
| Room approval selection reads per turn | +1 | +1 |
| Exact selection result JSON per turn | 2–441 B | 427–437 B |
| PostgreSQL request bytes, paired median | +677 B | +7,277 B |
| PostgreSQL response bytes, paired median | +997 B | +4,372 B |
| Foreground settlement, paired median | +236.14 ms | +4,035.79 ms |
| Foreground settlement, paired P95 | +468.82 ms | +6,012.02 ms |

The long block was 328 B in revision `r1` and 338 B in `r2`, with paired total JSON increases of 350 B and 360 B in the corresponding turns. The approved block met the first-system placement and one-occurrence checks. Across the 50→51 room revision change the control shared one whole leading message and 2,558 exact initial JSON bytes. The candidate shared zero whole leading messages and 2,237 exact initial bytes, preserving an authored prefix inside the changed message. The Desk edit at 69→70 changed the first whole message in both arms. Explicit Reflect after turn 80 left one whole leading message stable in both arms. Provider cache and token fields were unavailable.

Both long arms completed 13 Observe, 2 Reflect and 1 purge job. Actual model calls were 13 Observe and 2 Reflect in the control, compared with 14 Observe and 2 Reflect in the candidate. The additional attempted Observe after turn 80 was superseded with `MEMORY_SOURCE_SUPERSEDED`. The sampled delivered ordinary context at turns 81, 100 and 104 agreed after normalization. The cause of the attempted operation difference remains unverified. Both short arms used 4 Observe and 1 Reflect call.

Long-run median settlement was 2,480.13 ms in the control and 6,635.96 ms in the candidate. Time after the first local model delta also increased, from 756.70 ms to 2,061.18 ms. The separately timed query had warmed P50/P95 of 0.659/1.134 ms for the historical fixture hit and 0.618/1.000 ms for the current-authority empty result, 20 samples each. The sequential foreground arms show a real local timing difference, with multiple overlapping sources of variation. The direct query results and the timing after first delta do not support attributing the full difference to the selector. No release latency budget or provider cache finding follows from these runs. [Read-only timing samples](selector-timing.json)
