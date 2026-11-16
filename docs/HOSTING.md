# Quellight hosting

Radzi selected hosted phone/laptop access with **free services only**. Quellight uses the active Vercel Hobby account and its separate free Supabase project. ARA's live application, database and credentials remain separate. No paid host, worker, database or model service was added.

As of 16 November 2026, Phase 1 is live at **quellight.com** on production deployment `dpl_6YmU9LkJyhxma97oT4zXSfQroPat`. Its clean Linux Node/Vercel packaging passed; the earlier Preview passed the real owner/GLM conversation journey. The owner privately set a password and confirmed that the production app opened. [Production verification](../../qualification/phase1-ops/production.json).

## Active application and account

| Item | Current value |
| --- | --- |
| Vercel project | `quellight` / `prj_tcqb8vUdK535B2uCppRSbVFZipMK` |
| Service plan | Active Hobby |
| Runtime | Node 22.x, Singapore (`sin1`) |
| Phase 1 Preview | `dpl_4X3LWLNVaRCANy97Lwoyi266CTd1`, READY |
| Preview address | [Open the Phase 1 Preview](https://quellight-izclsjg8c-radziamin91-gmailcoms-projects.vercel.app) |
| Approved production address | [quellight.com](https://quellight.com), with `www` redirecting to the apex |
| Platform alias | [quellight.vercel.app](https://quellight.vercel.app) |
| Allowed app owner | `radziamin91@gmail.com` |
| Owner subject | `d84e888e-4be3-414e-81b7-8bbc000423ee` |
| Initial room | Home, provisioned through the governed bootstrap |

Vercel Authentication protects Preview and immutable deployment URLs. The custom production domain uses Quellight owner sign-in without requiring a Vercel account. Quellight enforces the owner session below the UI. Public Supabase sign-up is disabled. The password setup link uses a one-time token hash in the browser fragment; the page removes the fragment after reading it into memory. Passwords are chosen privately by the owner. Session cookies are HTTPOnly; no password or bearer token is placed in localStorage.

The project's **Improve models with this project's data** setting was disabled and verified before initial source upload. Team settings were unchanged. Existing DNS records and nameservers were preserved when `quellight.com` was configured. [Domain proof](DOMAIN.md) and [historical privacy preflight](VERCEL-HOST-READINESS.md) retain those scoped facts.

## Database and privileges

The separate Supabase **Quellight** project was created in the existing **ARA** organization for the quoted $0 monthly cost. Project reference: `wekfufgllxfpmjtusnre`; Singapore (`ap-southeast-1`); PostgreSQL 17.12. [Open the project](https://supabase.com/dashboard/project/wekfufgllxfpmjtusnre). The current migrations and owner bootstrap are active.

The application uses Supavisor transaction pooling, verified TLS and restricted database role `ql_app_runtime`. Its pool opens with one connection per store instance and migrations disabled. Administrative provisioning/migration credentials and the Supabase service role are not uploaded to Vercel. The browser has no direct product-table authority.

| Private schema | Owner of its records |
| --- | --- |
| `quellight_ops_v1` | VICT actors, runtime identities, effects, turns and coordination |
| `quellight_memory_v1` | Mastra conversation history through the public hosted adapter |
| `quellight_product_v1` | Rooms, conversation/thread mappings and public response projection |

Actor ownership is enforced in server queries and governed actions. A narrow session helper checks the authoritative Supabase session; the runtime cannot read raw auth sessions. Product updates use declared contracts, revision checks and idempotency. Archive preserves history and refuses new sends to the archived room.

[Runtime setup record](../../qualification/phase1-ops/runtime-database.json), [domain qualification](../../qualification/phase1-domain/README.md) and [conversation qualification](../../qualification/phase1-conversation/README.md) distinguish hosted provisioning from deterministic local tests. The historical provisioning statement that `public` had zero tables described the initial empty project; it does not imply the current application schemas are empty.

## Configuration and provider

`QUELLIGHT_MODE=personal` enables the implemented owner product. `foundation` remains an explicit empty preview mode for earlier qualification. Hosted startup validates an exact HTTPS origin; Vercel's trusted `VERCEL=1` and `VERCEL_URL` select hosted configuration when no explicit `ORIGIN` is supplied. Local `.env.example` settings must not be copied wholesale into Vercel.

The personal runtime requires these server variables:

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`
- `QUELLIGHT_OWNER_SUBJECT`, `QUELLIGHT_OWNER_EMAIL`
- `QUELLIGHT_DATABASE_URL`, `QUELLIGHT_DATABASE_CA`
- `QUELLIGHT_MODE=personal`, `QUELLIGHT_DEPLOYMENT=hosted`
- `ZHIPU_API_KEY`

The temporary provider remains exactly `zai-coding-plan/glm-5.3-flash` at Z.AI's Coding Plan endpoint, through the public VICT/Mastra integration. The owner saved the Secret in Vercel. Its existing Preview entry was also targeted to Production by metadata; the value was not read or copied. [Host configuration record](../../qualification/phase1-ops/host-configuration.json).

Generation settings remain the provider defaults. Turns use completion-or-cancellation policy, with no app generation timeout, output cap or step cap. The turn route requests Vercel's **300-second actual host ceiling**, uses the public host deadline and `waitUntil`, and keeps running when a browser closes. Other routes retain the adapter's 30-second default. These hosting ceilings still apply; they cannot be removed by changing a browser setting.

The complete conversation is stored and exportable. Model context uses the latest **1,000 messages**, the installed public VICT memory policy's maximum. Working memory and semantic recall are disabled for Phase 1. Automatic long-term memory/adaptation and its durable scheduling are Phase 2; Desk is later work.

## Recovery and readiness

The start request records durable intent before returning. Identical idempotent replay returns the same turn; conflicting reuse is refused. A conversation lease prevents overlapping model work for the same thread. Public text fragments and their published cursor are durable, so reopening can replay a response already in progress. Remote Stop persists cancellation for the executing worker. A vanished worker is reconciled as interrupted rather than silently run again.

VICT terminal status and product transcript projection settle separately. The UI retains the partial response and continues observing until projection is complete. It preserves an uncertain start's key through reconnect/reload and transfers observation if a second device starts a new turn. No browser close or navigation action requests cancellation.

`/healthz` reports process liveness. In personal mode, `/readyz` checks the active owner actor and required product/Mastra tables, returning 200 only when those checks pass. It does not make a provider call or guarantee every future request will succeed. Foundation mode retains readiness 503.

## Verification and current delivery boundary

The [live Phase 1 test](../../qualification/phase1-ops/live-test.json) passed 11 checks on the READY Preview: anonymous/foreign-origin refusal, owner authentication, governed room/conversation creation, exact replay and conflict refusal, actual GLM completion, streamed response persistence, matching reopen, remote Stop and preserved archived history. The runtime used the restricted hosted role and verified TLS.

Separate checks passed 14 application/config tests, zero Svelte/type errors or warnings, 12 conversation PostgreSQL groups and 9 domain PostgreSQL groups. The independent conversation review found lifecycle races; repairs passed the recorded regression. The [UI builder record](PHASE-1-EXPERIENCE.md) covers synthetic desktop/phone rendering and recovery. [Final packaging](../../qualification/phase1-ops/packaging.json) passed actual Node HTTP and all three Vercel handler probes. Production is promoted. The owner completed private setup and reported opening the app; broader owner experience review remains distinct from that confirmation.

## Earlier stages and alternatives

The initial deployment was an intentionally limited foundation: disabled sending, readiness 503 and no owner records. [Foundation Vercel evidence](VERCEL-DEPLOYMENT.md), [Phase 0 evidence](PHASE-0-EVIDENCE.md) and [synthetic hosted qualification](HOSTED-RUNTIME-QUALIFICATION.md) remain historical records with their exact sources and hashes. They are superseded for current product behavior by the Phase 1 evidence above.

The reusable [VICT Vercel extension](../../docs/tasks/VICT-VERCEL-EXTENSION.md) passed independent local review and exact installed-consumer qualification. It provides public persistence/coordination and a reusable host profile; Quellight owns product policy, authentication, rooms, memory rules and Desk composition.

The earlier Oracle recommendation and [Render Free Blueprint](../deploy/render.free.yaml) were not selected. No Render service was created. Their assessment remains in [hosting research](HOSTING-RESEARCH-2026-11-16.md); it is not the active deployment recipe. Local Node remains supported for qualification; Docker execution has not been demonstrated.
