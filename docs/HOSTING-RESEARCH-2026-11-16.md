# Quellight hosting recommendation

Researched 16 November 2026 against current official provider documentation and the installed VICT capability investigation. This is a recommendation for qualification, not an accepted host change or deployment result. Two delegated researchers examined Vercel and alternative hosts; the orchestrator reconciled their findings with the app's actual public-package constraints.

## Recommendation

**Qualify an Oracle Always Free VM first for the current VICT design. Keep Vercel Hobby plus Supabase as the managed, event-driven alternative. Stop treating Render Free as the default.**

The priority order is: preserve the public VICT runtime and automatic memory behavior; obey free-only spending; support phone/laptop access; then minimize server administration. Under those priorities, a durable ordinary Node server is a closer match than serverless functions. If minimizing server administration becomes the highest priority, Vercel becomes preferable, with materially more public VICT integration work.

No reviewed option establishes all three of unchanged VICT, dependable continuous availability, and strict zero cost. The recommendation identifies the most promising qualification path, not a platform already proven to meet every requirement.

## Actual application constraints

The app uses canonical `vict.application@3`, ready-made VICT UI and a SvelteKit Node foundation. Its verified package identities are in `baseline.json`; the separate installed Mastra proof is documented in the [hosted capability report](../../docs/phase-0/hosted-capability.md). Its current supported profile is local-first, one actor/process, with file-backed Mastra and VICT operational SQLite stores and process-local coordination. A hosted database cannot simply be substituted by an app-local cast or raw Mastra bypass.

A VM with durable disk could retain those storage implementations, avoiding the PostgreSQL adapter rewrite proposed for ephemeral hosts. This is an engineering inference. It still requires a supported protected-hosted profile, server-side owner authorization, sanitized logs, controlled single-process deployment, restart recovery and backups. Existing local tests establish none of those cloud claims. Phone and laptop must authenticate as the same owner, with concurrent requests handled within the qualified runtime.

## Platform comparison

| Platform | Evidence and constraint | Decision for Quellight |
| --- | --- | --- |
| Oracle Always Free VM | Current A1 allowance is 1,500 OCPU-hours and 9,000 GB-hours/month, equivalent to 2 OCPUs/12 GB; 200 GB total boot/block storage. Capacity can be unavailable, and idle compute can be reclaimed after a seven-day assessment. Card verification is required. [Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [FAQ](https://www.oracle.com/cloud/free/faq/) | First technical candidate: ordinary Node, persistent local files and OS scheduling. More maintenance and an availability risk; no claim of dependable free service. |
| Vercel Hobby | Functions support up to 300 seconds with Fluid Compute. Hobby is personal/non-commercial. Local durable storage is unavailable for Daemons. [Function limits](https://vercel.com/docs/functions/limitations), [Fair use](https://vercel.com/docs/limits/fair-use-guidelines), [Daemon limits](https://vercel.com/docs/daemons/limits) | Managed alternative if eligible: bounded requests and scheduled jobs, external durable state and new public VICT coordination/storage support. Not a drop-in host for the current server. |
| Render Free | Sleeps after 15 minutes idle, wakes in about a minute, loses local files on restart; 750 shared hours. Free persistent disks/background workers are unavailable. Payment-method accounts can incur bandwidth/build overages; outbound traffic can trigger suspension. [Free services](https://render.com/docs/free) | Foundation/demo candidate. Poor match for the current durable runtime and prompt background memory. Existing Blueprint remains unprovisioned. |
| Railway Free | Recurring $1/month usage credit exists beyond its trial. At listed rates, 0.5 GB sustained RAM alone is roughly $5/month, excluding CPU. [Plans](https://docs.railway.com/pricing/plans), [Trial](https://docs.railway.com/pricing/free-trial) | Native server/volume model is promising, but no measured evidence that this app fits the small credit. Not a credible free continuous-server recommendation. |
| Cloudflare Workers | `node:sqlite` is explicitly a non-functional compatibility stub. Durable Objects SQLite uses a different API; Workers Free also has tight CPU limits. [Node support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [Limits](https://developers.cloudflare.com/workers/platform/limits/), [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) | Could serve UI, but current backend requires a different public adapter and substantial qualification. Splitting hosts does not fix that. |
| Google Cloud Run | Ongoing free allowances require active billing; container files are ephemeral and instances can scale to zero. [Free tier](https://docs.cloud.google.com/free/docs/free-cloud-features), [Container contract](https://docs.cloud.google.com/run/docs/container-contract) | Viable Node container architecture in principle, but no complete zero-charge configuration qualified here. Not selected under strict free-only constraints. |
| Koyeb Free | 512 MB RAM/0.1 vCPU, no volumes or worker service, scales to zero after one idle hour; free regions are Frankfurt/Washington DC. Card verification involves a temporary $29 hold. [Instances](https://www.koyeb.com/docs/reference/instances), [Pricing FAQ](https://www.koyeb.com/docs/faqs/pricing) | Similar storage/sleep problems, less attractive location/resource fit. |
| Hugging Face Spaces | Current documentation requires PRO/Team to create new Docker/Gradio Spaces, subject to specific ZeroGPU exceptions. Static Spaces remain free. [Spaces overview](https://huggingface.co/docs/hub/spaces-overview) | Free static hosting does not provide this Node backend; CPU hardware advertised without hourly cost is not sufficient evidence of free account eligibility. |

## Proposed VM arrangement

Phone/laptop browser → HTTPS → authenticated Quellight SvelteKit server → public VICT/Mastra runtime → persistent disk for qualified VICT stores.

Retain the existing separate free Supabase project for application/auth capabilities where qualified; do not migrate all runtime state there solely because it exists. Each record type needs one authoritative owner. Do not synchronize competing SQLite/Postgres copies of conversation or effect state.

A supervised process runs the app. A durable due-work mechanism invokes the same governed VICT execution boundary for automatic memory after conversations and while browsers are closed. An OS timer can wake the dispatcher; it is not a second agent loop. Record actual results and recover missed work after restart. Do not replay an unknown protected effect as if it definitely failed. No per-memory approval is added for the specifically authorized quiet writes.

Use one Always Free-eligible VM and only eligible storage/network choices, within account-wide allowances. Keep the account free-only rather than upgrading billing to obtain capacity. Match VM sizing to measured load; do not create synthetic load to evade idle reclamation. The A1 ARM64 package installation remains untested despite native dependency declarations suggesting compatibility. Region availability, exact free HTTPS endpoint and actual phone/laptop latency must be checked before provisioning is considered a concrete plan.

## Vercel alternative, precisely scoped

Functions have a 300-second Hobby limit. Current monthly Function allowances include 4 active CPU-hours, 360 GB-hours and one million invocations; actual usage must be measured. [Function limits](https://vercel.com/docs/functions/limitations), [Hobby limits](https://vercel.com/docs/plans/hobby)

Schedules beta permits a 15-minute minimum interval with up to 15 minutes of jitter and 5,000 runs per team/billing period. One dispatcher every 15 minutes would use 2,976 runs in a 31-day month, before other runs. This supports periodic catch-up, not precise or immediate idle-time execution. Legacy Cron restrictions are different. [Schedules limits](https://vercel.com/docs/schedules/limits)

Daemons beta cannot provide a free continuous worker all month: Hobby allows 420 GB-hours and 5 active CPU-hours; minimum memory is 1 GiB, consuming the memory allowance after approximately 17.5 days even when idle. Default 2 GiB lasts about nine days. Daemons accept no inbound HTTP/TCP and have no persistent local storage. Do not confuse this with the separate generic Function quota or assume quotas are additive. [Daemon limits](https://vercel.com/docs/daemons/limits)

The alternative therefore uses request-triggered and scheduled bounded jobs, durable PostgreSQL state, leases/fencing and safe retry/catch-up. Automatic memory remains automatic, but background refinement can be delayed. It requires public VICT PostgreSQL conversation/operational stores and coordination extensions, Linux function packaging, streaming/cancellation tests and deployment overlap tests. Vercel services do not replace VICT authority. Hobby eligibility must be established before selecting it for work-related or commercial use.

## Qualification sequence

1. Check Oracle account eligibility, home-region free capacity, card requirement and complete zero-cost resource configuration. If unavailable, do not upgrade or silently substitute paid resources.
2. Prove the exact installed artifact closure on the intended Linux architecture. Exercise both real SQLite implementations, native dependencies and the production Node entry point.
3. Establish the public protected-hosted profile and single-owner/process policy. Test owner access from two sessions, denied access, log redaction, stop/retry and actual automatic writes.
4. Test process kill, VM reboot, deployment replacement, interrupted deletion and backup restoration. Persist due work and distinguish safe idempotent retries from unknown outcomes.
5. Test real HTTPS access and resumed conversation on phone/laptop, browser-closed memory work, measured resource use and recovery after host loss. Attribute live-provider checks separately; a no-new-cost provider profile is still unresolved.

The existing Supabase free plan can pause after a week of inactivity and supplies 500 MB database storage. Its presence does not remove capacity or recovery work. Free infrastructure also does not make model inference free. [Supabase pricing](https://supabase.com/pricing)

No host was provisioned, changed or deployed during this research. No application code or accepted UI scope changed. Phase 0 remains incomplete.
