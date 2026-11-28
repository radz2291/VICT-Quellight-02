# Reproduce the isolated live audition

The runner uses the accepted Q4-011 evidence tree, its private assembled voices and reveal key, app `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344` and design `9dbfd28175d86b28f9a52340aa4939b4ed11db81`. Use the original installed app closure, Node 22.23.5, normal SvelteKit sync and a disposable PostgreSQL 18.6 loopback cluster. Give `q4_fixture` authority over the scratch database and supply the directory of that cluster’s `pg_dump` and `pg_restore` commands. Choose a new name starting with `q4_009_`, which the inherited fixture validates. The runner creates, restores and drops that one scratch database. An existing database name causes it to stop.

The provider is the app’s Z.AI OpenAI-compatible Coding Plan route, `https://api.z.ai/api/coding/paas/v4`, with `glm-5.3-flash`. The runner reads the existing key inside the process from an owner-supplied local file. It accepts a raw key line or a `ZHIPU_API_KEY` assignment. Set private outputs outside Git. The installed app service uses the same Mastra router constructor and generation defaults for all cases. The runner checks the first SDK input before the request, observes HTTP status and numeric usage, and passes through the provider’s stream bytes. [Pinned model profile](https://github.com/radz2291/VICT-Quellight-02/blob/14b6ccaf6f409eac3e041dc3d9abd0bb9f875344/src/lib/server/conversation/activation.ts) · [Accepted Q4-011 method](../q4-011/README.md)

```text
node --preserve-symlinks --experimental-import-meta-resolve run.mjs live APP DESIGN LOOPBACK_DSN PRIOR_CAPTURE_DIR PRIOR_READER_DIR PRIVATE_RUN_DIR REDACTED_RUN_JSON PG_BIN LOCAL_KEY_FILE
node ../q4-011/reader.mjs render PRIVATE_READER_DIR ../q4-011/blind-order.json PRIVATE_RUN_DIR/replies.private.json
node check-readings.mjs REDACTED_RUN_JSON PRIVATE_RUN_DIR PRIOR_CAPTURE_DIR PRIVATE_READER_DIR SANITIZED_RESULTS_JSON PRIVATE_PREFLIGHT_DIR
node --preserve-symlinks --experimental-import-meta-resolve check-continuations.mjs APP FRESH_LOOPBACK_DSN PG_BIN PRIOR_CAPTURE_DIR PRIVATE_RUN_DIR SANITIZED_RESTORES_JSON
```

Place a private copy of the accepted reveal key in a new `PRIVATE_READER_DIR` to preserve the preparation sheet. The evidence audit for this execution uses the retained two-request preflight receipt and settled projection. The runner can exercise the same provider transport with synthetic SSE by choosing `mock` in a fresh output directory and omitting the key-file argument.

For an incomplete live run with an app-side case failure, use `resume` with the original paths and database name. It verifies the private receipts of all completed cases, restores the original seed, preserves the first failed receipt and repeats only an eligible incomplete case. An access or quota refusal requires review of that receipt before more requests.

## State isolation and matched inputs

The first live exchange performed a governed Desk append. Its durable projection had settled by the time the runner noticed it had read only one page of stream events. The runner now consumes successive cursors through terminal projection. The preflight’s settled reply and two provider requests are kept separately from the matched batch.

The seed comprises one carried Desk item, a saved response-guidance override, ordinary Working Memory and an eligible approval source. The runner restores the same custom PostgreSQL archive into a clean trial database for each of the 42 replies. It adds the same approved `r1` room block where applicable. The shared correction prefix goes through the installed conversation service with a deterministic reply. Each generated tool effect stays in its own trial. The three approved-room practical trials have separate retained continuation archives.

First-input comparison validates the operating text, ordinary messages, model profile and defaults, tool schemas and permissions, quiet write policy, Desk, and native authority. It uses the Q4-011 normalizations for SDK timestamps, verified per-thread headers and exact recall revisions. It checks the room block separately for presence, text, placement and source binding. A persisted VICT instructions revision is recomputed from each captured first system message.

## Continue one practical exchange

Use an opaque code shown for the room-approved practical case. The continuation command reads the owner’s message from standard input. It restores that code’s saved thread, calls the same app route and checkpoints the new state privately.

```text
node --preserve-symlinks --experimental-import-meta-resolve run.mjs continue APP DESIGN LOOPBACK_DSN PRIOR_CAPTURE_DIR PRIOR_READER_DIR PRIVATE_RUN_DIR REDACTED_RUN_JSON PG_BIN LOCAL_KEY_FILE BLIND_CODE
```

Record the owner’s impressions before opening the reveal key. Unscripted continuation has its own private receipt.
