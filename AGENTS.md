# Quellight development

## Product and people

Quellight is Radzi's calm companion for conversation, rooms, automatic memory and a collaborative Desk. It is a selective remake of ARA, intended for private hosted access from phone and laptop. ARA-style automatic memory and adaptation must not require approval of each memory.

Read the accepted [product direction](../docs/QUELLIGHT-PRODUCT-DIRECTION.md) and [implementation plan](../docs/QUELLIGHT-IMPLEMENTATION-PLAN.md). On 16 November 2026 the owner authorized Phase 1 implementation after Phase 0 passed, including a polished interface using ready-made VICT controls. The primary agent orchestrates delegated agents and integrates their work.

## Experience

Conversation is the primary task. Rooms organize conversations; the Desk supports shared work. Memory details remain secondary. Use Quellight in new product copy, retain truthful historical provenance. Only installed public ready-made VICT UI may provide controls: no Pi/Lit widgets, alternate UI kit, or hand-built replacement for a covered VICT interaction. Composition, application bindings and supported semantic styling belong to the app. Keep framework mechanics in engineering records unless a user needs them to complete a task.

Phase 1 implements owner sign-in, rooms, persistent conversation, streaming, Stop, reopening, copying and export. Read the [experience brief and public-control provenance](docs/PHASE-1-EXPERIENCE.md) and [owner guide](docs/USING-QUELLIGHT.md). Keep the transcript and reachable composer primary, with room navigation secondary; the phone uses VICT's public Drawer. The public Rhea field recipe supplies room, email and password fields. Empty, loading, unavailable and error states must describe actual behavior. Phase 2 automatic memory and Phase 3 collaborative Desk/room method are delivered. Deeper attunement remains later work; never simulate later capabilities.

The owner's UI review on 16 November calls for a quieter, minimal interface: reduce bulky headers and buttons, investigate the installed VICT UI's full composition and styling capabilities, and keep conversation visually primary. Review this refinement locally before any hosted update. The local review may use explicitly labelled sample content isolated from production; it must not invoke the real provider, authentication, or database. Preserve the canonical VICT document, ready controls, accessible names and usable phone touch targets.

The continuing local review on 17 November places **New conversation only in the sidebar**, including the phone's slide-out sidebar. Do not restore header or welcome-screen creation shortcuts. Scrollbars should be quiet, slim and consistent across conversation, navigation, drawers and the composer in both appearances.

The 26 November local design candidate makes the sidebar's New conversation action explicit, resumes the last conversation opened in each room on this device, and adds a phone shortcut to the room's Desk. Keep the Desk editor's Save and Preview reachable on short screens, and return keyboard focus to More after closing Memory. See the [local review and preview](docs/LOCAL-UI-PREVIEW.md#26-november-design-review).

The owner's second design pass calls for one quiet line in the header, one shared Back position for nested views, and scrollbars at the edge of their panes. The current local candidate gives Desk a card gallery and a dedicated editor. In the sidebar, add-room is an action next to the rooms heading and Desk belongs under Room tools. Keep the containing room visually distinct from the active destination. Use the [surface depth rules](docs/LOCAL-UI-PREVIEW.md#surface-depth) when composing new screens.

Memory must be inspectable through quiet optional access. The owner requested a **Memory** entry in each conversation's three-dot menu to see that thread's observations, actual memory activity, sources and context when desired. Include this in Phase 2 delivery and extend coverage as memory features arrive. Use ready VICT controls and recorded state. The [inspection design](docs/PROMPTS-AND-CONTEXT.md) covers scope, prompts, history and reconnect behavior. Automatic learning remains independent of opening the inspection view.

The revised [Phase 2 plan](docs/PHASE-2-PLAN.md) replaces wholesale ARA capture/digest porting with Mastra-native memory. On 17 November the owner authorized Phase 2 implementation with delegated agents. C12 reusable native memory has installed, independent and actual GLM qualification and is adopted in the delivered application. Product memory, versioned room/prompt overrides, quiet inspection and correction/forgetting passed the complete Phase 2 hosted milestone, including actual phone/desktop browser checks and unattended checkpoint recovery. Phase 3 adds Desk content and a separate learned method through the same public VICT boundaries.

The owner subsequently explicitly authorized autonomous completion of **all Phase 2A–2E**, with the owner checking only after completion. Continue with delegated implementation and independent verification without interim owner supervision. Review new UI locally through actual desktop/phone browser journeys and independent checks before hosted delivery; the earlier local-review requirement does not require stopping for owner feedback in this authorized run. Deliver and verify the complete milestone on the existing free hosted services, preserving credentials and existing data. Ask only if an indispensable external dependency cannot be resolved within the accepted scope.

## How agents work

The root agent coordinates bounded ownership and integrates work. Read current instructions and linked evidence. Routine implementation, tests and repairs are authorized. Preserve manual changes and other agents' files. Independent review must be attributed separately from builder checks. Ask only for a consequential missing dependency or decision after making the result concrete. **Use free services only.** Do not upgrade a plan or incur new nonzero service/model charges. The owner selected the existing ARA Supabase organization for a separate Quellight project; ARA's live project remains a reference, not this app's database.

## Repository and integration

This `app` directory is the implementation root, initialized as a Git repository on `main`. The parent workspace retains research and qualification consumers. ARA, VICT and TORI checkouts are read-only references; never clean, reset, switch or install into them.

- Implemented hosts: local SvelteKit/Node and Vercel Node functions. Local qualification uses pinned Node 22.23.5; system Node 22.13.1 is older. Vercel is pinned to major 22 and controls its patch rollout. Use the explicit build route for the intended host.
- Application boundary: VICT Application Layer, `vict.application@3` and canonical UI documents after installed proof. Render readiness checks structural compilation and UI diagnostics, because incomplete drafts may compile successfully with readiness errors.
- Required agent execution: `@victframework/mastra` through VICT authorization and runtime; no second raw Mastra or Pi loop.
- For GLM-5.3-Flash, preserve provider generation defaults and completion-or-cancellation turns. The owner rejects artificial app generation timeouts, output limits and step caps. The actual Vercel turn/maintenance-function ceiling is 300 seconds; document it as a host constraint, not an app policy. Full history is stored. Phase 2 uses one managed context selector for observations, applicable personal memory and unobserved/recent messages, with `lastMessages:1000`; do not add a second raw-history injection. Stored history and selected model context are different facts.
- Baseline reference: [exact sources](../docs/VICT-BASELINES.md), [capability map](../docs/reference/QUELLIGHT-CAPABILITY-MAP.md). A common version is not an artifact identity. Use the qualified archive closure, record hashes and the app's own lockfile.
- Newly needed public capabilities require isolated installed proof before dependent product behavior. A local artifact result is not hosted acceptance.
- Product records, Mastra conversation storage and VICT operational stores retain separate owners. Enforce actor authorization below UI. No browser secrets or direct product writes bypassing declared actions.
- Production data uses restricted TLS role `ql_app_runtime` and separate `quellight_product_v1`, legacy `quellight_memory_v1` and `quellight_ops_v1` schemas. Phase 2's private `quellight_memory_v2` recoverable schema and product migrations are now provisioned; the old schema is preserved. Public sign-up is disabled. Releases authorize only their configured owner and verify the active session. The isolated Phase 2 Preview uses a synthetic fixture owner; the production owner remains unchanged. Future multi-user access is not enabled by this release.
- Retain an uncertain start's original idempotency key until that exact POST is acknowledged. Do not clear it because another active turn exists. Keep observing terminal turns until transcript projection is settled; preserve partial text and transfer observation to any newly active turn. Closing a page must never be treated as Stop.
- Quiet automatic writes require trusted server policy selecting exact permitted capability revisions; this is not blanket approval for arbitrary effects.
- Memory and context are core product capabilities. Keep app-owned model prompts in the server-only `src/lib/server/prompts` catalog, with content-derived revisions pinned into activations. Start newly adopted Mastra memory roles with qualified upstream defaults and provide explicit customization modes. Preserve authored overrides when defaults change. Read [prompts and context](docs/PROMPTS-AND-CONTEXT.md) for the current catalog, native prompt boundaries and proposed app/room inheritance.

## Current continuity

On 17 November 2026 the owner approved the **Phase 3 collaborative Desk and learned working method**. Delegated backend/UI work, root integration and independent verification completed the [execution plan](docs/PHASE-3-PLAN.md) on existing free services. Local desktop/phone inspection preceded hosted delivery. Desk collaboration means revision-checked saved text/Markdown, not simultaneous cursors. Deeper attunement remains Phase 4 and was not implemented.

**Phase 3 is live at [quellight.com](https://quellight.com)**. Production `dpl_BFakfdrHUwTgzEPzhQxnbPim8eN8` is READY; [STATE.md](STATE.md), [delivery](docs/PHASE-3-DELIVERY.md), [owner guide](docs/USING-QUELLIGHT.md) and [portable evidence](evidence/phase-3.json) own current facts. Final source `135db957013265da774b7d2b4ebbeb261a18a2b7aef2fb34142940ccf0bfe3c5`, app lock `8b821ffabf5d8f184f69862deb9cab7495a63a37a51641e6e074ba342de3d4dc`, fourteen unchanged verified VICT archives. The baseline's Phase 2 local-candidate label records artifact adoption, not current deployment status.

Core A (`a26bbfd37e69113bef38dc7e09be096734ecc3d374a6765974d6fbfebe6c3cca`, commit `64035cd7d318079cb75db82d5f4fe633c4435ec6`) passed hosted API21, browser40 and receipt7 checks using synthetic accounts. An actual method checkpoint survived Vercel's 300-second timeout and automatic cron published it once without regenerating. A new GLM chat used it. Final B changes exactly one light muted-text token; all other build inputs match A. B has separate actual remote packaging and browser24/contrast12 evidence; no GLM rerun is claimed on B. Production verification confirms readiness, real-owner configuration and unchanged owner rooms/conversations/turns without owner login/password changes. Both synthetic Auth accounts/sessions and six temporary Previews were removed; temporary scheduler objects were dropped and the private production one-minute native/method/care scheduler verified. Audit/product history remains.

Phase 3 proofs include installedUI14, localUI73, Desk domain11, conversation15, method worker12, independent bridge8, interleaving6, owner isolation5 and actual native care3; app29 and Svelte0/0 remain separately scoped. Release helper115 checks passed. Final local Linux rebuild was blocked by disk exhaustion; core A has a Windows Node build/HTTP proof, while A and B each have actual remote Vercel pinned install/build, fourteen archives,47 aliases and17 HTTP probes. Restored build cache is disclosed. C12 native memory proofs remain separately scoped. Original reference repositories are unchanged. Owner acceptance has not yet been recorded.

VHOST-028 adds unattended recovery for expired foreground turns to the existing signed scheduler. See the [recovery and rollback guide](docs/FOREGROUND-TURN-RECOVERY.md) for the database-first application order, owner scope and safe handback. This candidate has a separate review and release decision.

## Verified commands

Run from this app root with Node 22.23.5 and npm 11.21.2. The workspace has a verified portable runtime at `../.tools/node-v22.23.5-win-x64`. Use a per-command PATH and `npx --yes npm@11.21.2 ci` for the exact install.

| Operation | Command | Current evidence |
| --- | --- | --- |
| Exact install | `npx --yes npm@11.21.2 ci` | The mixed archive graph passed isolated installation and checksum checks |
| Types and Svelte | `npm run check` | Zero errors/warnings |
| Application/config tests | `npm test` | 29 passed in Phase 3 qualification |
| Archive bindings | `npm run verify:baseline` | Fourteen local candidate digests and lock bindings passed |
| Local Node build | `npm run build:node` | Phase 3 core A Windows Node build/HTTP passed; final Linux rebuild blocked by disk exhaustion |
| Vercel build | `npm run build:vercel` | Phase 3 A/B actual hosted pinned install/build passed; restored cache disclosed. Windows lacks required symlink privilege |
| Generated Vercel handler | `npm run test:vercel` | Three groups passed historically in Phase 2. Phase 3 remote evidence separately checks47 aliases and17 HTTP probes |
| Actual Node HTTP checks | `npm run test:http` | Current auth pages, memory/owner API and wake refusals, origin and startup guards passed |
| Product preview | `npm start` | Starts the chosen built host; use current personal-mode configuration for real product features |
| Local UI review | `npm run preview:ui` | Real app with isolated sample transport at 127.0.0.1:4320; no live services. See [preview guide](docs/LOCAL-UI-PREVIEW.md) |
| Browser fixture journey | `node scripts/check-phase1-ui.mjs` | Desktop/phone normal and dropped-response runs passed; see the experience brief for isolated Playwright setup |
| Simultaneous browser views | `node scripts/check-phase1-two-devices.mjs` | Two independent contexts passed shared observation, remote-turn handoff and separate drafts with synthetic transport |
| Phase 2 browser journey | `node scripts/check-phase2-ui.mjs` | Independent 60-check desktop/phone journey; 32 additional appearance/keyboard checks in the qualification record |

`src/lib/product/definition.ts` owns canonical UI/application source, with domain contracts shared by UI and server. `src/lib/server` owns auth, domain actions, database composition and governed conversation. `src/routes` provides pages and authenticated transports; `config/runtime.mjs` validates startup intent, also enforced by the server hook. Domain and conversation qualifications passed 9 and 12 real PostgreSQL groups respectively; the independent conversation review's lifecycle repairs were included in regression. Local tests, synthetic browser checks, live Preview checks and owner review remain separate evidence. `deploy` retains provisioning facts and earlier candidates. Docker execution remains unproven. The original [Phase 0 evidence](docs/PHASE-0-EVIDENCE.md) retains its historical exact inputs.
