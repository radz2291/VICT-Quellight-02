# Quellight hosted runtime qualification

This is the app-consumer acceptance slice for Phase 0. It composes the reusable VICT Vercel extension through its public installed packages. It is a synthetic, temporary, protected preview route; it does not make Quellight's production conversation, memory, owner sign-in, or scheduled work ready.

The app uses the six accepted ready-made UI/application archives. The orchestrator owns cloud operations. The proof builder owns `../../qualification/vercel-cloud/`, and the installed-consumer agent verified compatibility with the six new server archives.

## Observed on Vercel and Supabase

**Passed for the synthetic hosted runtime on 16 November 2026.** The first protected preview completed a Mastra turn and recorded one automatic write. It returned HTTP 503 uncertainty because the proof read the orchestration store for a sequential graph. The repair reads `execution.getRun` for both restoration and observation. The second preview returned the original run ID, activation, revision and result. The direct database receipt was identical before and after recovery, with one tool invocation and one memory record. Conflicting replay returned 409.

The second preview reopened the reply, denied another actor, rejected released and expired leases, and confirmed conversation deletion and its durable tombstone. A simulated provider failure produced the expected safe code. The actual logs contained none of the tested synthetic canary, payloads or credentials. Both source uploads matched all 40 expected files. The final preview and application lock pin every dependency checksum.

The restricted role opened both stores over Supavisor with certificate and hostname verification. Explicit SSL enforcement also enabled TLS between the pooler and PostgreSQL. Cleanup removed both test deployments, six preview variables, three proof schemas and both temporary roles. The production domain still points to its protected foundation deployment. [Exact results](../evidence/hosted-runtime-proof.json).

## Exact inputs

- Framework source: `1b11d4a5f4298310c7ab16e0808b8bfbed551ee5`, evidence-only head `0761e1865258b23e2f04652f4301736155be06c5`, isolated `261116-VICT-Vercel` checkout.
- Framework manifest SHA-256: `33b544b6be657144560fb6a471d5ad756c72406163524af711027a0ce1b8d99f`, `docs/hosted-vercel/evidence/packed-f4/manifest.json`.
- Runtime `bbb8fb37ad7a93dfd77e17af3a909a16cb8d7b57522bfb0ddd537d631353b881`; PostgreSQL store `74f4681ee0d86d487f7fd304ae88cf181aa6e6dff92a0f3bb01ad6dbe84129cb`; Mastra `ecf3f6bfce73457bbf25e9c0b81b64db9e532db386f5586e2e87d6ac0765eb01`; hosted `4aa6581aa7d26f067ddb3ec28dc8f7fd67bb34467e08132132972ed25c880de4`.
- All candidate archive versions are `0.4.0-rc.1`; the hashes and lockfile identify the actual artifacts. The source archives are unpublished.
- Standalone proof dependencies: contracts, UI (transitive SDK requirement), SDK, kernel, runtime, control, PostgreSQL store, Mastra, hosted. The upstream manifest's SQLite archive is retained as provenance but is not installed or imported by this consumer.
- Node 22.23.5, TypeScript 5.9.3, npm 11.21.2. The standalone `package-lock.json` is its own dependency resolution. The app's separate combined twelve-archive lock remains the deployment input.

Upstream gates 1–4 passed local PostgreSQL qualification and independent review. They did not qualify Supavisor or Vercel execution. Do not transfer those verdicts to this slice without its own observations.

## Boundary and behavior

`src/handler.ts` exports `createQuellightProofHandler(config, safeLogSink)`, a standard `(Request) => Promise<Response>` handler. The orchestrator may copy the three `src` modules into server-only code in an isolated app clone, then bind **POST `/api/_qualification/hosted-vict`**. Configure a Vercel **Node** function in Singapore (`sin1`) for **60 seconds**. The VICT budget is 45 seconds work, 10 seconds settlement, and 5 seconds response reserve. Request body limit is 256 bytes. No cron, `waitUntil`, background job, or external model is used.

The wrapper must return 404 unless proof mode is explicitly enabled and `VERCEL_ENV=preview`. The environment reader also rejects a Vercel production environment. Keep existing Vercel Authentication protection enabled. A separate, temporary, server-only proof bearer is mandatory even when the platform bypass token permits the operator through Vercel Authentication. Browser-origin requests are refused. No secret is placed in a URL or browser bundle.

Authentication maps to **one fixed synthetic actor**, `quellight-synthetic-owner-v1`. No body field can choose an actor, room, thread, prompt, SQL, schema, model, or memory rule. The actor is seeded by the operator with exact direct VICT scopes; a request resolves that durable record and calls `authenticatedActorContext`. It does not grant roles or seed missing actors.

All proof actions acquire one durable request scope. `createRuntime` uses `stores.forLease(lease)` and a declared exact permission. Every action has a persistent graph run, activation, and command-effect receipt. Matching repeats observe the original result; conflicting reuse is refused. Unsettled command receipts or running/outcome-unknown tool invocations block later actions. A lost settlement is never treated as permission to repeat a write.

The `turn` action restores the exact operator-seeded agent activation, uses `composeMastraTurnExecutor` and the real PostgreSQL-backed Mastra adapter with the deterministic offline model, and publishes through the durable VICT stream hub. Its one synthetic domain write runs through VICT's capability bridge and an exact server policy for `quellight.proof.memory.capture` revision `1`. The invocation must record `effect=write`, `approvalRequired=false`, and `host-policy-write-without-separate-approval`, with no approval record. This demonstrates the accepted automatic-write approach; it is not Quellight's final memory policy.

The synthetic domain callback writes only through `coordination.withFence` on the supplied transaction client. Mastra's memory writes use its own hosted thread coordinator and fenced storage profile. The request closes the agent, memory borrowers, then the operational pool. Requests use `migrate:false` and `migration:'verify'` exclusively.

| Action | Required observation |
| --- | --- |
| `turn` | Governed offline turn completes, one exact automatic write records its true effect and policy, reply is durably readable |
| `inspect` | A new request reopens the reply; a different synthetic actor cannot export it |
| `fences` | Released lease cannot enter callback; stale release cannot invalidate a successor; a closed Mastra store rejects work; real sanitized error logger exercised |
| `failure` | Offline model throws a canary; VICT records a failed turn without the canary or a tool invocation |
| `delete` | Public governed memory deletion removes the synthetic conversation under a sticky tombstone |
| `inspect-deleted` | A new request cannot acquire a work lease for the deleted conversation |

The proof stores fixed synthetic strings only. Full runtime retention is permitted here because the inputs/results contain no personal data. Copying that retention policy into product execution would require a separate decision. Raw prompts, provider exceptions, SQL, passwords, or HTTP objects are never diagnostic log input. The canary is intentionally sent to the real sanitized logger and failing offline model; the operator must also inspect actual Vercel logs.

## Database ownership and preparation

Only Quellight project `wekfufgllxfpmjtusnre` is in scope. Root observed the shared Singapore pooler `aws-1-ap-southeast-1.pooler.supabase.com`: session port 5432 for the migration owner, transaction port 6543 for functions. No ARA database is involved.

| Domain | Schema | Owner and purpose |
| --- | --- | --- |
| VICT operations | `quellight_probe_ops_v1` | Migration role owns metadata, snapshots, leases and effect receipts; namespace fixed to `quellight-hosted-proof-v1` |
| Mastra conversation | `quellight_probe_memory_v1` | Migration role owns the exact factory schema, binding marker and scope triggers |
| Synthetic app data | `quellight_probe_domain_v1` | One `automatic_memory` table with fixed actor/value constraints, one row per operator-selected proof ID |

`sql/bootstrap.sql` is an operator template with SCRAM-verifier placeholders. Parent-generated private material creates `ql_proof_migrator` and `ql_proof_runtime`, with no elevated role attributes. The parent additionally bounds their expiry and connection limits. Do not reset the shared `postgres` password or expose a management/service-role key. Temporary CREATE on the database belongs only to the migration role. **Do not pre-create the memory schema:** the factory validates the binding marker of any existing schema before it migrates, so an empty pre-created schema correctly fails.

The parent executes `scripts/migrate.mjs` once, explicitly setting the migration-intent environment value below. The command runs the two public factories, creates the synthetic domain table, and seeds the actor and exact activation through public operational ports. A partial failure must be inspected by the operator; the command is not a general-purpose repair tool.

After successful migration/seed, the parent applies `sql/seal.sql`. Runtime receives schema USAGE, metadata SELECT, operational SELECT/INSERT/UPDATE, supported memory/observability table DML, domain SELECT/INSERT, and the scope-trigger function privilege. It cannot own schemas, create their objects, mutate schema markers, delete operational receipts, or use observational-memory tables. RLS in these unexposed private schemas adds role/namespace defense. The runtime is a trusted server role; its SQL policies are not Supabase Auth account isolation. VICT actor checks and transactional memory scope guards remain essential.

Seal revokes migration CREATE and disables its login. Root observed that Supabase's PostgreSQL management role has ADMIN but not SET membership on the newly created migration role; when applying seal with that operator, temporarily enable SET membership inside the transaction, `SET LOCAL ROLE ql_proof_migrator` only for owned object privileges/policies, `RESET ROLE` for role/database changes, and restore the prior SET membership before commit. Do not broaden runtime membership.

Inherited stock PUBLIC/TEMP privileges are reported separately. This slice does not silently revoke global defaults used by Supabase services or claim to sandbox the runtime database-wide. The proof schemas must stay outside the Data API exposed-schema list, with no `anon` or `authenticated` grants. The parent runs security/performance advisors after changes.

## Server environment

No variable below may use a public/browser prefix.

| Variable | Validation |
| --- | --- |
| `QUELLIGHT_PROOF_ENABLED` | Exact `true`; wrapper otherwise returns 404 |
| `QUELLIGHT_PROOF_ID` | Fresh operator-selected 32 lowercase hex characters; fixed for one scenario sequence |
| `QUELLIGHT_PROOF_TOKEN` | Random 43–128-character base64url bearer; never a user session |
| `QUELLIGHT_PROOF_EXPIRES_AT` | ISO date in the future, at most 72 hours away when configured; requests also enforce expiry |
| `QUELLIGHT_PROOF_DATABASE_URL` | Runtime user `ql_proof_runtime.<project-ref>`, exact pooler hostname, port 6543, database `/postgres`; no query/hash |
| `QUELLIGHT_PROOF_CA_PEM` | Explicit verified vendor CA PEM, at most 32 KiB; TLS verification never disabled |
| `QUELLIGHT_PROOF_MIGRATION_URL` | Operator process only; same project/host, migration user, session port 5432; never uploaded |
| `QUELLIGHT_PROOF_MIGRATION_INTENT` | Operator process only: `initialize-synthetic-only` |
| `QUELLIGHT_PROOF_URL` | HTTP probe only: exact preview URL plus `/api/_qualification/hosted-vict` |
| `QUELLIGHT_PROOF_CLI_DEPLOYMENT_ID` | HTTP probe only: verified, ready Quellight preview deployment ID. The operator uses the signed-in Vercel CLI and passes the proof bearer by an ephemeral local header file. |
| `QUELLIGHT_PROOF_PRIOR_REPORT` | `--phase finish` only: local path to the nonsecret JSON report from `--phase start` on a different immutable preview |
| `QUELLIGHT_PROOF_DURABLE_RECEIPT`, `QUELLIGHT_PROOF_PRIOR_HOST` | `--phase recover` only: the directly observed synthetic execution result and hostname of the prior preview that produced it |
| `QUELLIGHT_PROOF_LOCAL_TEST` | Optional literal `true` for loopback tests; forbidden in any Vercel environment |

The pool maximum is 1 per request-owned pool; the factory uses unnamed parameterized queries, transaction-local settings, and no session advisory locks. URL SSL query parameters and `NODE_TLS_REJECT_UNAUTHORIZED=0` are rejected. The driver verifies the certificate and hostname. Trusting a CA is separate from observing encrypted pooler-to-PostgreSQL transport; `probe-database.mjs` checks both. Root reported enabling SSL enforcement after initially observing plaintext pooler-to-PostgreSQL transport, then verifying both pooler ports with the official vendor root certificate. Keep the parent evidence as the authority for that cloud change.

## Running and evaluating the slice

From `qualification/vercel-cloud`, using the portable Node and npm 11 paths:

1. `npm run prepare:artifacts` verifies the frozen manifest and every archive before copying locally. `npm ci --ignore-scripts --no-audit --no-fund` installs the exact standalone lock. An interrupted install is not usable; a resumed `npm install` can leave missing transitive files. Check real imports and declarations after a clean install.
2. `npm run build` and `npm test` exercise the real installed declarations, exact activation/compatibility, closed configuration, authentication-before-storage, body bounds, actor injection, browser-origin refusal and expiry. These tests intentionally do not call Supabase.
3. Parent prepares trusted TLS/roles and runs `npm run migrate:proof`, then seal/advisors. Parent runs `npm run probe:database` with the restricted runtime role. A success requires verified TLS/hostname, TLS on the upstream hop, no elevated privileges or schema ownership/creation, immutable markers, no unsupported-memory writes, and successful public verify-only factories.
4. Parent builds an isolated app preview with the qualified combined archives, copies only the three runtime source modules, binds the preview-only route, and uploads runtime credentials only. No `.env`, SQL, migration runner, credential file, proof evidence, or source checkout is part of the upload.
5. `npm run probe:http` checks unauthorized and actor-injection denial, executes the six actions in order, checks exact replay and conflicting replay, and emits a JSON report containing only synthetic facts. For cross-deployment evidence, run `npm run probe:http -- --phase start` against the first immutable preview and save its JSON report. Deploy the same qualified source to a second immutable preview, set `QUELLIGHT_PROOF_PRIOR_REPORT` to that saved report, and run `npm run probe:http -- --phase finish`. Finish requires a different deployment hostname and exact equality with the first deployment's durable turn result, then tests reopening, fencing, failed-model sanitization and deletion. A new HTTP request reopens storage each time. Re-running with the same proof ID returns original durable action results; use a fresh proof ID for a genuinely new scenario sequence.
6. Inspect actual deployment logs for the canary, synthetic payload strings, DSN/password material, raw exception/SQL, and credentials. A fixed failure receipt must remain visible. Keep the redacted report and deployment identity; do not retain raw credential-bearing logs.

Parent must retain actual cloud evidence and independent review separately from the builder's local result. The cloud proof must not be reported as passing on the basis of this runbook or a successful frontend build. Actual Vercel termination, prolonged outages, backup/restore, production owner-session revocation, real-provider access, stream reconnection and unattended due-work scheduling remain separate qualification gates. The upstream local failure/backup evidence can inform those gates without substituting for actual host evidence.

## Cleanup and next product integration

### Phase 0 deployment envelope

The Phase 0 route is a protected Vercel Node function using external PostgreSQL for durable VICT operations and Mastra conversations. One synthetic owner and exact host-authorized write policy were exercised. Overlapping requests use durable leases and fencing. The actual two-deployment recovery recovered a settled turn and its original write receipt.

The following dispositions scope the remaining hosted gaps under implementation-plan item 5.

| Behavior | Evidence and delivery disposition |
| --- | --- |
| Authorization and automatic writes | Hosted actor isolation, exact capability authorization and a single automatically approved write passed. Real owner sessions and revocation belong to Phase 1. |
| Restart and stream recovery | Local installed tests cover process termination and saved stream state. Hosted redeployment recovered settled results. Browser reconnect and observation of a live interrupted conversation remain Phase 1 acceptance. |
| Retention, export and deletion | Installed consumer tests cover lifecycle operations and local recovery. Hosted deletion and tombstone checks passed. Product export, retention policy and backup restoration remain Phases 1 and 5 according to the affected records. |
| Scheduling | Durable coordination is qualified. A deployed schedule and due-work dispatcher are still required in Phase 2. They must recover work from persisted state and demonstrate completion after the browser closes. No running scheduler is claimed by this foundation. |
| Inference lifetime | The live GLM qualification selects the actual Hobby function maximum of 300 seconds. Use the public completion-or-cancellation turn policy and provider generation defaults. The earlier synthetic fixture's short work budget describes that fixture alone. |

This scope qualifies the storage and deployment route for subsequent product implementation. Product readiness continues to follow the enabled features and their own acceptance evidence.

Disable the preview route, remove its runtime secrets, and wait for bounded invocations and leases to end before removing schemas. Inspect the three exact schema owners and active proof users. Parent-owned `sql/cleanup.sql` drops only the three named synthetic schemas and two named proof roles; it must not be generalized to ARA, public, product or framework schemas. Durable proof receipts are removed only by this explicit final operator cleanup. Retain nonsecret evidence outside the deployed app.

Once the proof and combined package evaluation pass, app integration needs the same public ports, verified transport, migration/runtime separation, bounded host configuration and actor enforcement. Product conversation/rooms/automatic memory/Desk schemas, real owner authentication, exact product write-policy revisions, useful prompts, free provider access, retention/backups and due-work triggers are later application work. No raw Mastra executor, local file store, readiness flag or client-supplied grant replaces those requirements.

The builder passed **6/6** installed boundary tests on 16 November 2026. The added regression compares the sequential execution store with the orchestration store and reopens a completed record without running its write again. The earlier five tests covered configuration and request boundaries plus exact activation restoration. An interrupted package install left missing files. The clean install restored them, and the separate combined consumer checked registry archive bytes and repinned missing lock checksums.

Current primary references: [Supabase connection pooling](https://supabase.com/docs/guides/database/connecting-to-postgres), [SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement), [database roles](https://supabase.com/docs/guides/database/postgres/roles), [current changelog](https://supabase.com/changelog), [Vercel function limits](https://vercel.com/docs/functions/limitations). The changelog was checked on 16 November 2026; its CLI v3 default/confirmation change means migration commands should be discovered from the installed CLI, not guessed. This proof runner uses the public VICT factories rather than a CLI schema mutation.
