# Reproduce the Q4-013 comparison

Use app source `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344`, design `9dbfd28175d86b28f9a52340aa4939b4ed11db81`, Node 22.23.5 and isolated local PostgreSQL 18.6. [Exact package and policy pins](results.json)

The installed app uses its existing fourteen VICT archives, lockfile and Mastra Memory 1.28.2. The speech fixture replaces one conversation catalog voice line with the selected eight-movement voice while retaining the rest of that role. Q4-009’s isolated approval seam supplies the room block. The pinned Q4-011 composition witnesses and Q4-008 installed consumer verification are inherited in the review tree.

## Exact learning inputs

The original user/assistant texts settle through the existing app service using scripted transport. One dump ends after the initial exchange and one after the correction. Each Observer arm restores a cut from the very same dump. The app’s normal resolved settings are the default. The conditioned arm previews the supported Observer append in memory for that background call. The installed app passes it to the existing native service and its governed write. Startup and product settings are shared for the foreground checks. The fixture directly invokes the installed native Observe operation with a pinned authority and operation ID. This isolates the prompt under test from scheduling and from changes to the ordinary foreground memory configuration.

The conditioned instruction includes 30,489 exact assembly bytes and a role wrapper. The resulting native system prompt has 30,716 added bytes, including the native custom-instructions separator. SDK equality removes those exact bytes and normalizes generated numeric Mastra content-part timestamps. Wire equality removes the exact addition and compares the rest of the outgoing JSON, including all user content and wire settings. These comparisons verify the first actual request. All four observed background operations used one request and published a native snapshot. The public evidence contains only digests, counters, synthetic excerpts, source labels and request shapes.

## Fresh-chat delivery

The original cut is restored anew for each arm. The reviewed values are tied to U1 and U2 through exact original spans and the current eligible source list. The fixture validates that each supported value came from the actual after observation. Its synthetic approval binds the correction’s source ID, owner, room and current authority. The other room shares the actor and ordinary app configuration. The write there is possible only under that room’s original Desk grants.

The actual provider input is observed at the existing GLM router; both roles use provider defaults. Model packets, complete reply text and bare invocation receipts are retained in the owner’s private scratch directory. Foreground paired first-input comparison removes the exact approved block, normalizes generated SDK capture timestamps and the checked thread-specific identifiers, and compares all other instructions, ordinary context, tools and settings. Post-first-request differences can arise from the model’s own replies and permitted tools. Background request cost is computed separately. The presence of draft guidance is assessed on the entire captured request sequence and the reply.

## Commands

The paths are placeholders. Use the same installed app and design, a loopback test cluster with the isolated `q4_fixture` login, and a fresh disposable database name beginning `q4_009_q4013`. `PRIVATE_OUT` must be outside the review tree. `VOICE_JSON` is the private Q4-011 assembly proof input with the `eight` field. `KEY_FILE` is a local credential file for the established Z.AI coding route. The commands read the credential in-process.

```text
node --preserve-symlinks --experimental-import-meta-resolve run.mjs rehearse APP DESIGN DSN VOICE_JSON REHEARSAL_OUT PG_BIN
node --preserve-symlinks --experimental-import-meta-resolve run.mjs observe APP DESIGN DSN VOICE_JSON PRIVATE_OUT PG_BIN KEY_FILE
node --preserve-symlinks --experimental-import-meta-resolve run.mjs replay APP DESIGN DSN VOICE_JSON PRIVATE_OUT PG_BIN _ decisions.json
node --preserve-symlinks --experimental-import-meta-resolve run.mjs deliver APP DESIGN DSN VOICE_JSON PRIVATE_OUT PG_BIN KEY_FILE decisions.json
node --preserve-symlinks --experimental-import-meta-resolve run.mjs incremental APP DESIGN DSN VOICE_JSON PRIVATE_OUT PG_BIN
node summarize.mjs PRIVATE_OUT decisions.json results.json
```

The tracked decision file records the reviewed live output excerpts from this run. A new live run can produce different phrasing. Review those actual observations against the frozen originals before updating the fixture approval. Use the deterministic replay command with an existing capture and the matching approvals to verify the installed delivery path without sending requests. The incremental replay re-feeds two captured live Observer reply texts through native persistence on one thread, with the correction arriving after the first publication.
