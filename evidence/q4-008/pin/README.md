# Q4-008 package transition qualification

This probe makes two synthetic Quellight conversations through the exact old installed app. The first is left queued. The second worker runs until the old native store commits a preparation, crosses an injected post-commit hold, and is terminated by the parent process. The probe observes natural claim expiry before dispatch using the candidate package. It exercises governed `memory.retry` under the original package for a blocked same-authority job, then checks the completed result again through the candidate.

The harness uses genuine app services, worker and dispatcher, durable SQL and VICT authorization. The only injected boundaries are the deterministic model and the worker hold. The old-pin probe creates no queue or native rows directly. Both installations are checked against the app SHA, lock and package bindings before the case. It makes zero external provider requests.

From a fresh disposable loopback database using Node 22.23.5 and the exact pinned installations, run the following command. The database name must start with `q4_008_`. Omit `--provision` only for a database this qualification has already provisioned. The probe always creates new actors and conversations.

```text
node --preserve-symlinks --experimental-import-meta-resolve pin/run.mjs BASELINE_APP CANDIDATE_APP postgresql://q4_fixture@127.0.0.1:55443/q4_008_pins OUTPUT --provision
```

The result records job, operation, source, configuration and authority revisions, PIDs, queue history, counted model calls, receipt histories and private checkpoint SHA-256. The candidate projection provides public membership evidence separately from the database witness. The JSON survives a failed assertion and identifies the last attempted operation.

## Result

| Old package state at switch | Observed candidate behavior | Confirmed disposition |
| --- | --- | --- |
| Queued, zero attempts and no native operation | Took the same product job and preserved its source, settings and authority revisions. The new native configuration made one Observe call and published `[a6b95c78-6094-4c46-a031-032e472b622e, 896b288f-6ba5-45a9-a620-1403b31e0478]` in the original order. | Queue-only work can start under the candidate when its current source and authority still match. |
| Prepared, same source and authority, old native configuration | The original worker exited by `SIGKILL` after the persisted checkpoint. Its claim expired naturally. The candidate claimed it, then blocked with `MEMORY_NATIVE_OPERATION_CONFLICT` before creating a native execution receipt or making a model call. The saved checkpoint digest stayed `8c16795bae70d94eb03c427481841e134ff7b22032173ae31b9aa4dfaeac49b9` and had zero publications. | Keep the old checkpoint bound to its exact package pin during transition. |
| Blocked by the new package, then governed owner Retry under old pin | The old worker reconciled the same preparation digest. It made zero model calls and published once with a new completed `quellight.memory.maintain` reconciliation receipt. Candidate inspection returned explicit `unavailable` for that legacy group. A duplicate candidate delivery made no new attempt, model call or publication. | Drain eligible old prepared work with the old package before changing the writer pin. |

The old prepared operation is `memory-job:c20eb53e-1b60-43c0-bdcc-01550ab6da4e`. It retained native configuration `ee406d674cf841f960593f7672aa280f1d4658330f9ae23fd0e72919efeda74a`. The candidate worker computed `61369ae773c6f18f45a40ec1bd061f02b053cb7926d7c006a66592bb87ac697e` from the same job settings revision. The prepared branch used one initial old Observe call and zero inference on candidate refusal, old reconciliation and duplicate wake. Its job history is `queued`, `running`, `retryable/HOST_INTERRUPTED`, `running`, `blocked/MEMORY_NATIVE_OPERATION_CONFLICT`, `retryable/OWNER_RETRY`, `running`, `completed`. [Full receipts and source revisions](old-pin.json)

Pause new work admissions during handoff and let the pinned old worker drain eligible prepared work. Switch to a single candidate writer after verifying old preparations are settled or explicitly disposed of. Carry forward only queue-only jobs whose source and authority remain eligible. The qualified Retry recovers an already-blocked case if the original installed worker is available. A replacement for an unrecoverable old checkpoint requires a separate, current-authority operation and its own qualification.

The first run reached the expected drain behavior, then the harness failed its final history ordering assertion because PostgreSQL sorted text-form IDs lexicographically. The corrected witness orders by numeric sequence and the full rerun passed, including duplicate delivery. The SSR probe also logged a local Vite WebSocket port collision while other isolated checks ran. Its server services and database checks completed with exit 0.
