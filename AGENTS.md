# Quellight development

## Product and people

Quellight is Radzi's calm companion for conversation, rooms, automatic memory and a collaborative Desk. It is a selective remake of ARA, intended for private hosted access from phone and laptop. ARA-style automatic memory and adaptation must not require approval of each memory.

Read the accepted [product direction](../docs/QUELLIGHT-PRODUCT-DIRECTION.md) and [implementation plan](../docs/QUELLIGHT-IMPLEMENTATION-PLAN.md). On 16 November 2026 the owner authorized Phase 1 implementation after Phase 0 passed, including a polished interface using ready-made VICT controls. The primary agent orchestrates delegated agents and integrates their work.

## Experience

Conversation is the primary task. Rooms organize conversations; the Desk supports shared work. Memory details remain secondary. Use Quellight in new product copy, retain truthful historical provenance. Only installed public ready-made VICT UI may provide controls: no Pi/Lit widgets, alternate UI kit, or hand-built replacement for a covered VICT interaction. Composition, application bindings and supported semantic styling belong to the app. Keep framework mechanics in engineering records unless a user needs them to complete a task.

Phase 1 implements owner sign-in, rooms, persistent conversation, streaming, Stop, reopening, copying and export. Read the [experience brief and public-control provenance](docs/PHASE-1-EXPERIENCE.md) and [owner guide](docs/USING-QUELLIGHT.md). Keep the transcript and reachable composer primary, with room navigation secondary; the phone uses VICT's public Dialog. The public Rhea field recipe supplies room, email and password fields. Empty, loading, unavailable and error states must describe actual behavior. Automatic memory/adaptation is Phase 2 and Desk follows later; never simulate those capabilities.

## How agents work

The root agent coordinates bounded ownership and integrates work. Read current instructions and linked evidence. Routine implementation, tests and repairs are authorized. Preserve manual changes and other agents' files. Independent review must be attributed separately from builder checks. Ask only for a consequential missing dependency or decision after making the result concrete. **Use free services only.** Do not upgrade a plan or incur new nonzero service/model charges. The owner selected the existing ARA Supabase organization for a separate Quellight project; ARA's live project remains a reference, not this app's database.

## Repository and integration

This `app` directory is the implementation root, initialized as a Git repository on `main`. The parent workspace retains research and qualification consumers. ARA, VICT and TORI checkouts are read-only references; never clean, reset, switch or install into them.

- Implemented hosts: local SvelteKit/Node and Vercel Node functions. Local qualification uses pinned Node 22.23.5; system Node 22.13.1 is older. Vercel is pinned to major 22 and controls its patch rollout. Use the explicit build route for the intended host.
- Application boundary: VICT Application Layer, `vict.application@3` and canonical UI documents after installed proof. Render readiness checks structural compilation and UI diagnostics, because incomplete drafts may compile successfully with readiness errors.
- Required agent execution: `@victframework/mastra` through VICT authorization and runtime; no second raw Mastra or Pi loop.
- For GLM-5.3-Flash, preserve provider generation defaults and completion-or-cancellation turns. The owner rejects artificial app generation timeouts, output limits and step caps. The actual Vercel turn-function ceiling is 300 seconds; document it as a host constraint, not an app policy. Full history is stored; the model receives the latest 1,000 messages, the installed public VICT policy's maximum. Stored history and model context are different facts.
- Baseline reference: [exact sources](../docs/VICT-BASELINES.md), [capability map](../docs/reference/QUELLIGHT-CAPABILITY-MAP.md). A common version is not an artifact identity. Use the qualified archive closure, record hashes and the app's own lockfile.
- Newly needed public capabilities require isolated installed proof before dependent product behavior. A local artifact result is not hosted acceptance.
- Product records, Mastra conversation storage and VICT operational stores retain separate owners. Enforce actor authorization below UI. No browser secrets or direct product writes bypassing declared actions.
- Production data uses restricted TLS role `ql_app_runtime` and separate `quellight_product_v1`, `quellight_memory_v1` and `quellight_ops_v1` schemas. Public sign-up is disabled. The current release authorizes only the configured owner and verifies their active session; future multi-user access is not enabled by this release.
- Retain an uncertain start's original idempotency key until that exact POST is acknowledged. Do not clear it because another active turn exists. Keep observing terminal turns until transcript projection is settled; preserve partial text and transfer observation to any newly active turn. Closing a page must never be treated as Stop.
- Quiet automatic writes require trusted server policy selecting exact permitted capability revisions; this is not blanket approval for arbitrary effects.

## Current continuity

Phase 1 is implemented and deployed at quellight.com. Clean Node/Vercel packaging and the live owner/GLM journey passed; the owner privately set a password and confirmed that Quellight opened. Phase 0 is complete for its historical foundation and scoped hosted integration route. Read [STATE.md](STATE.md) for the latest handoff, [baseline.json](baseline.json) for the twelve pinned archive identities, and [hosting setup](docs/HOSTING.md) for infrastructure. The current Phase 1 lock SHA-256 is `e265b4b1bedf009432ee353822ac90256456d7ef9d05f5b0127d08b80e1c09e7`; earlier hashes remain attributed to their stage. The existing `@mastra/libsql@1.22.3` is directly pinned for correct Node native-loader externalization; product storage remains PostgreSQL. Isolated qualification work lives under `../qualification/`.

The approved production address is **[quellight.com](https://quellight.com)**, with `www` redirecting there. Production `dpl_6YmU9LkJyhxma97oT4zXSfQroPat` is READY and promoted; [production evidence](../qualification/phase1-ops/production.json). The [11-check real hosted journey](../qualification/phase1-ops/live-test.json) ran on the prior Phase 1 Preview. Vercel Authentication protects Preview and immutable deployment URLs; the custom production domain uses Quellight owner sign-in. The owner is `radziamin91@gmail.com` and Home is seeded. [Verified domain setup](docs/DOMAIN.md).

The [reusable VICT extension](../docs/tasks/VICT-VERCEL-EXTENSION.md) passed independent local review. This app pins six server archives alongside the original six UI/application archives. Its [installed consumer evaluation](../docs/phase-0/vercel-extension-consumer.md) verifies the combined set. The earlier [hosted synthetic qualification](docs/HOSTED-RUNTIME-QUALIFICATION.md) remains Phase 0 evidence; Phase 1 now uses actual owner sessions and product storage in the separate free Quellight Supabase project. Quellight owns product memory rules, rooms, Desk, authentication policy and branding. Keep readiness tied to enabled product capabilities.

## Verified commands

Run from this app root with Node 22.23.5 and npm 11.21.2. The workspace has a verified portable runtime at `../.tools/node-v22.23.5-win-x64`. Use a per-command PATH and `npx --yes npm@11.21.2 ci` for the exact install.

| Operation | Command | Current evidence |
| --- | --- | --- |
| Exact install | `npx --yes npm@11.21.2 ci` | The mixed archive graph passed isolated installation and checksum checks |
| Types and Svelte | `npm run check` | Zero errors/warnings |
| Application/config tests | `npm test` | Phase 1: 14 passed |
| Archive bindings | `npm run verify:baseline` | Twelve digests and lock bindings passed |
| Local Node build | `npm run build:node` | Phase 1 clean Linux build passed with direct native-loader dependency pin |
| Vercel build | `npm run build:vercel` | Final clean Linux and actual cloud builds passed. Windows lacks required symlink privilege |
| Generated Vercel handler | `npm run test:vercel` | All three handlers passed; 4,424 files and 26 route aliases inspected |
| Actual Node HTTP checks | `npm run test:http` | Phase 1 auth pages, owner API refusal, origin and startup guards passed |
| Product preview | `npm start` | Starts the chosen built host; use current personal-mode configuration for real product features |
| Browser fixture journey | `node scripts/check-phase1-ui.mjs` | Desktop/phone normal and dropped-response runs passed; see the experience brief for isolated Playwright setup |
| Simultaneous browser views | `node scripts/check-phase1-two-devices.mjs` | Two independent contexts passed shared observation, remote-turn handoff and separate drafts with synthetic transport |

`src/lib/product/definition.ts` owns canonical UI/application source, with domain contracts shared by UI and server. `src/lib/server` owns auth, domain actions, database composition and governed conversation. `src/routes` provides pages and authenticated transports; `config/runtime.mjs` validates startup intent, also enforced by the server hook. Domain and conversation qualifications passed 9 and 12 real PostgreSQL groups respectively; the independent conversation review's lifecycle repairs were included in regression. Local tests, synthetic browser checks, live Preview checks and owner review remain separate evidence. `deploy` retains provisioning facts and earlier candidates. Docker execution remains unproven. The original [Phase 0 evidence](docs/PHASE-0-EVIDENCE.md) retains its historical exact inputs.
