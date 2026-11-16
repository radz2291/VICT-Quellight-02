# Quellight Vercel readiness

Read-only preflight on 16 November 2026. The owner selected Vercel preparation and a separate reusable VICT extension, with free services only. This report supplies app hosting decisions; it does not claim that a project was created, deployed, authenticated, or connected to PostgreSQL.

## Verified account and local state

| Check | Observed result |
| --- | --- |
| Vercel CLI | 54.16.0; authenticated as `radziamin91-4691` |
| Available team | `radziamin91-gmailcoms-projects`, ID `team_Dlwr16zMV68paKlaMa29CDFQ` |
| Plan and authority | `billing.plan=hobby`, `billing.status=active`, no trial, current membership `OWNER` |
| Project inventory | All 26 projects fetched with pagination exhausted; no name containing Quellight |
| Team optional training consent | `dataSharingConsent.consent=granted`; unchanged |
| Quellight local link | No `app/.vercel/project.json` at preflight |
| Local credentials | App root contains only `.env.example`; inspected process environment has no Supabase, PostgreSQL, owner-subject or scheduler credential values |
| Separate Supabase project | `wekfufgllxfpmjtusnre`, Quellight, Singapore, `ACTIVE_HEALTHY`, PostgreSQL 17.12.0.000 |
| Supabase CLI | 2.107.0; not upgraded |

Account checks used authenticated GETs through the CLI. Only selected non-secret fields were emitted. No ARA configuration, passwords, tokens or data were copied. The credential check covers this app root and the calling process, not every credential store on the computer. Current shared usage, remaining quota and account-specific Schedules beta availability were not measured.

## Concrete free provisioning route

The current public [OpenAPI schema](https://openapi.vercel.sh) provides `POST /v11/projects` and `PATCH /v9/projects/{idOrName}`. Creation inherits the explicitly selected team's plan; it has no project-level Hobby upgrade setting. Verify that the selected team is still active Hobby immediately before creation. Do not enable a trial, paid integration, paid password protection, enhanced build machine or add-on.

Create only the new project under that scope, with the following reviewed body. `build:vercel` must agree with the app builder's final script before applying it. No source upload or secret values are needed to create the project.

```json
{
  "name": "quellight",
  "framework": "sveltekit",
  "publicSource": false,
  "installCommand": "npm ci",
  "buildCommand": "npm run build:vercel",
  "ssoProtection": { "deploymentType": "all" },
  "resourceConfig": {
    "fluid": true,
    "functionDefaultRegions": ["sin1"],
    "functionDefaultTimeout": 30
  }
}
```

Use the CLI's authenticated structured-file route, `vercel api /v11/projects --method POST --scope radziamin91-gmailcoms-projects --input <reviewed-json-file>`. Capture the created project ID and re-read its configuration. The public creation request does not expose `nodeVersion`; patch only the new project with `{ "nodeVersion": "22.x" }` through `/v9/projects/{idOrName}`. Vercel controls the Node patch version, so verify the actual build/runtime version separately from the locally qualified 22.23.5.

Current protection documentation, updated **15 September 2026**, explicitly supports **All Deployments with Vercel Authentication on all plans without a paid add-on**. Some search snippets still describe an older paid restriction; the directly opened current page governs this proposal. Keep `ssoProtection.deploymentType=all`, then challenge an unauthenticated request and inspect the owner's authenticated preview. Password Protection is a different, paid feature. [Deployment Protection](https://vercel.com/docs/deployment-protection#all-deployments), [API configuration](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication#how-to-manage-vercel-authentication-with-the-api)

Before source upload, set a **project-level optional model-training opt-out**. The current team is opted in; do not change that shared preference or other projects. Official instructions say owners can opt out individual projects in **Project Settings**, using the **Opt-In / Opt-Out** choice. Team settings call the section **Data Preferences**. The public project create/update OpenAPI schema does not expose a consent field or documented consent endpoint, so use the authenticated project settings UI and confirm the saved result. Do not guess an undocumented mutation. [Official data-preference instructions](https://vercel.com/changelog/updates-to-terms-of-service-march-2026)

For a project created with the proposed name/scope, the expected settings entry is [Quellight settings](https://vercel.com/radziamin91-gmailcoms-projects/quellight/settings); this URL and the exact project control have **not yet been observed**, because no project existed during preflight. Prefer the created project's returned dashboard URL, navigate to Settings, locate the documented data-sharing control and record its saved state before deployment. The free opt-out applies prospectively and needs no plan upgrade.

Vercel Authentication protects the foundation preview, but is not the app's VICT actor mapping. Keep product readiness false until owner authorization and the runtime are qualified. No scheduler is needed for a foundation-only preview.

## Free bounds and app scheduling

Hobby is intended for personal, non-commercial use. Quellight's current private personal scope fits that stated intention; a reusable VICT extension must not promise that every downstream commercial application qualifies for Hobby. Hobby cannot buy additional usage without changing plans. Remain on Hobby and accept quota suspension rather than upgrade. [Vercel pricing](https://vercel.com/pricing)

Functions on Fluid Compute have a 300-second Hobby ceiling, 2 GB memory and one vCPU; streamed responses are included in that duration. Use a shorter app deadline that leaves time for settlement. Monthly included Function usage is 4 CPU-hours, 360 GB-hours and one million invocations, shared with existing team activity. [Function limits](https://vercel.com/docs/functions/limitations), [Hobby allowances](https://vercel.com/docs/plans/hobby)

Schedules beta permits a 15-minute minimum interval, a 15-minute jitter window and 5,000 runs per team per period. A single `*/15 * * * *` dispatcher uses at most 2,976 nominal runs in a 31-day month, before manual runs and other projects. It supports eventual automatic refinement, not exact-time delivery. Existing team usage must be checked before activation. [Schedules limits](https://vercel.com/docs/schedules/limits)

The Quellight-owned proposal is one POST path such as `/api/jobs/dispatch`, declared through `schedules`, not legacy `crons`. The route checks the platform-supplied `Authorization: Bearer <CRON_SECRET>` before work. Path targets are public routes; schedule headers alone are not authorization. Persist due times and claims; deduplicate by durable job identity, bound each batch, settle actual results and catch up later. Function-target errors are not automatically retried, and deliveries can duplicate or catch up together. These facts require durable recovery below app scheduling. [Scheduled run handling](https://vercel.com/docs/schedules/handle-runs), [Configuration](https://vercel.com/docs/schedules/configuration)

The live `vercel.json` schema contains `schedules`, but CLI 54.16.0 did not expose a `schedules` command (`--help` fell back to deploy help). Do not use a bare unknown command. Validate build configuration and hosted beta availability before declaring a schedule active. Do not add artificial keepalives, Daemons or a paid queue to bypass free limits.

## PostgreSQL and owner wiring

Supabase recommends its shared transaction pooler for serverless traffic. Use a small pool, initially one connection per warm instance, disable named prepared statements, and avoid session state, session advisory locks, LISTEN/NOTIFY and query pipelining across transactions. The VICT extension must implement durable transactional claims/fencing; merely holding a session lock cannot qualify that path. Use certificate and hostname verification, since `sslmode=require` alone only encrypts. Migrations and backup/restore need a distinct direct or qualified session connection, not the short-lived transaction connection. [Connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres)

Proposed environment mapping below is **not implemented configuration**. The framework factory's final public types may refine names and roles. Product, operational and Mastra domains remain distinct; their three private schemas/roles in one database require explicit public-backend qualification.

| Name | Scope and purpose |
| --- | --- |
| `QUELLIGHT_MODE=foundation` | Current honest runtime mode until the release passes its gates |
| `QUELLIGHT_DEPLOYMENT=hosted` | Hosted configuration validation |
| `ORIGIN` | Exact approved HTTPS origin; preview and production use their own validated values |
| `PUBLIC_SUPABASE_URL` | Non-secret Quellight project API origin for app authentication |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable client key; never substitute an administrative secret |
| `QUELLIGHT_OWNER_SUB` | Server-only allowlisted verified Auth subject, mapped to the VICT actor |
| `QUELLIGHT_DATABASE_URL` | Server-only least-privilege product connection |
| `VICT_DATABASE_URL` | Server-only operational-store connection through the public adapter |
| `MASTRA_DATABASE_URL` | Server-only conversation-store connection through VICT's public Mastra factory |
| `QUELLIGHT_DATABASE_CA` | Server-only certificate/config input where the qualified driver needs it |
| `CRON_SECRET` | Server-only random scheduler authorization secret; add only when the route is implemented |
| `QUELLIGHT_MIGRATION_DATABASE_URL` | Separate trusted migration/restore environment; not normal function configuration |

The app needs verified Supabase identity on every protected server operation, an explicit allowed subject, a fresh server-side VICT context and no shared caching of personalized/session-refresh responses. Use validated claims or `getUser` as appropriate, not unverified `getSession().user` or user-editable metadata. Only ready-made VICT controls may render the sign-in flow. [SSR auth and caching](https://supabase.com/docs/guides/auth/server-side/creating-a-client)

Choose an owner bootstrap that avoids adding paid mail/SMS services. A configured social OAuth provider or owner account with password recovery planning is a candidate. Do not assume default Supabase email is a production delivery service: it is restricted to organization member addresses and currently two messages per hour. No sign-in provider, owner subject or callback allowlist was configured by this preflight. [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp)

Supabase Free has a 500 MB database, pauses after one inactive week and does not include automatic backups. Keep retention bounded and prove a free encrypted export/restore route. Do not activate paid IPv4, PITR or branching add-ons. [Supabase Free details](https://supabase.com/pricing)

## Work boundaries and remaining proof

The reusable VICT extension owns qualified external storage, neutral coordination/fencing, request lifetime and cancellation, sanitized logs, deterministic receipts and generic recovery contracts. It must work for other applications too. Quellight alone owns branding, owner allowlisting, rooms/Desk, memory priority and schedule cadence. No Quellight feature semantics should be embedded in the framework.

The next concrete sequence is: create the protected Hobby project; apply and verify project data opt-out; deploy the reviewed foundation build; challenge anonymous access and observe the owner preview; qualify the extension's installed packages against real PostgreSQL; wire private credentials and owner identity; prove recovery and browser-closed automatic work. Keep the existing no-data foundation separate from the usable private companion claim.

No nonzero provider/model profile has been authorized. Hosting being free does not establish no-cost inference. A verified eligible provider route, live execution, backup/restore and phone/laptop owner journeys remain outstanding. No mutation, deployment, DDL, password change, source upload or model call was performed in this preflight.

## Follow-up: project privacy UI hydration

Later on 16 November 2026, the orchestrator created the separate Hobby project `prj_tcqb8vUdK535B2uCppRSbVFZipMK` with All Deployments Vercel Authentication and Node 22. The earlier account inventory and companion JSON intentionally remain the **pre-creation snapshot**, not current provisioning state.

The first authenticated project-settings view briefly reported **Disabled globally at Team level** and showed no project toggle. This conflicted with the unchanged team API observation, `dataSharingConsent.consent=granted`. The orchestrator then obtained a fresh accessibility snapshot after delayed browser hydration: the transient message disappeared, and a checked **Improve models with this project's data** control appeared. Therefore the initial message is **not evidence of a team opt-out or effective project protection**. No finding establishes that the API consent field is legacy or unrelated.

The orchestrator is applying the Quellight-only checkbox change and will record the saved and reloaded result in the actual provisioning evidence. This follow-up does not independently certify that save. The shared team's preferences remain outside this change. Further API investigation stopped; no undocumented endpoint, cookie extraction or account mutation was attempted by the readiness agent.
