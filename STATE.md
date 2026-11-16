# Quellight implementation state

Updated 17 November 2026. **Phase 1 remains deployed at quellight.com. The owner approved the quieter UI in the local preview and requested a Git commit.** Clean Linux Node/Vercel packaging and the live GLM conversation journey passed for the first release. The owner privately set a password and confirmed that Quellight opened. Phase 0 is complete for its earlier foundation and scoped hosted integration route.

## Local UI review

The owner requested smaller, quieter headers and controls, broader use of VICT's ready drawers/icons, sidebar-only conversation creation, and improved scroll styling. The candidate uses a single 56px header, 220px sidebar, ready icon controls and drawers, and public transcript/composer part styling. New conversation belongs only in the desktop sidebar or phone's Rooms drawer. No product/provider behavior changes are intended.

[The local preview](http://127.0.0.1:4320/) renders the real app with clearly labelled in-memory sample content. Run `npm run preview:ui` using the pinned toolchain. [Preview guide](docs/LOCAL-UI-PREVIEW.md).

The two additional ready UI packages passed a fresh [isolated installed consumer](../qualification/ui-patterns-20261117/README.md): exact archive/source matching, canonical compilation, Svelte/type checks, production build and fourteen desktop/phone browser checks including supplied/custom SVG, keyboard activation and drawer dismissal/focus return. Those are delegated capability results; integrated product layout and recovery checks are recorded separately in the [experience record](docs/PHASE-1-EXPERIENCE.md).

## Current product

The owner can sign in, use the seeded Home room, create/rename/archive rooms, create and reopen conversations, stream a reply, Stop a turn, copy text and export a conversation. Phone and laptop share server-owned rooms and sent history. Unsent drafts remain device-local and are cleared on sign-out. The main page, sign-in and setup pages are canonical `vict.application@3` UI documents rendered with installed public VICT controls. [Experience and component provenance](docs/PHASE-1-EXPERIENCE.md); [owner guide](docs/USING-QUELLIGHT.md).

Conversation runs through the public VICT/Mastra boundary using `zai-coding-plan/glm-5.3-flash` and the owner's saved `ZHIPU_API_KEY`. The app uses provider generation defaults and completion-or-cancellation turns: no app generation timeout, output cap or step cap. The actual Vercel turn-function ceiling is 300 seconds. A host interruption remains possible and is reported truthfully; it is not a user-configurable model limit.

Full conversation history is retained in storage. The model context uses the latest **1,000 messages**, the maximum accepted by the installed public VICT memory policy. This context window does not truncate stored history. Working memory and semantic recall are disabled in Phase 1. **ARA-style automatic memory/adaptation is Phase 2**, without per-memory approval; Desk follows later. No ARA data has been imported.

## Identity and infrastructure

- Supabase project `wekfufgllxfpmjtusnre` is the separate free Quellight project in the existing ARA organization, Singapore, PostgreSQL 17.12. The product migrations are active. The application connects with verified TLS through restricted role `ql_app_runtime`; migration/admin credentials are not deployed.
- The active schemas are `quellight_ops_v1`, `quellight_memory_v1` and `quellight_product_v1`. VICT operational state, Mastra conversation storage and product records keep separate ownership boundaries.
- The allowed owner is `radziamin91@gmail.com`, account UUID `d84e888e-4be3-414e-81b7-8bbc000423ee`. Home is seeded. Public sign-up is disabled. Server authorization verifies the owner and active session; it does not trust browser-supplied actor identity.
- Vercel project `quellight` remains on the active Hobby account, Node 22.x, Singapore. Supabase remains free. No paid service was added. Vercel Authentication protects Preview and immutable deployment URLs. The production domain uses Quellight owner sign-in, so a phone does not need a Vercel account.
- Preview `dpl_4X3LWLNVaRCANy97Lwoyi266CTd1` passed its real GLM journey. **Production `dpl_6YmU9LkJyhxma97oT4zXSfQroPat` is READY and promoted.** [Production verification](../qualification/phase1-ops/production.json).
- The owner-approved primary address **[quellight.com](https://quellight.com)** now serves Phase 1, with `www` redirecting to the apex. The public sign-in page returns 200, anonymous product access returns 401, and database readiness returns 200. [Domain evidence](docs/DOMAIN.md).
- The saved provider Secret's target metadata now covers Preview and Production. The key value was not read or copied. Project code-training sharing remains disabled. [Host configuration evidence](../qualification/phase1-ops/host-configuration.json).

## Current artifact identity

The app repository is `app/`; the parent workspace retains product decisions and isolated qualification consumers. The local UI candidate retains the twelve accepted VICT archives and adds the qualified `ui-patterns-svelte` and `ui-media-svelte` archives from foundation `6b420a3e`. [baseline.json](baseline.json) now records fourteen exact archive digests. No existing package was upgraded by this addition. Production still uses the prior twelve-archive release.

Phase 1 adds `@supabase/ssr@0.12.7`, `@supabase/supabase-js@2.119.0` and `@vercel/functions@3.11.3`, retaining `@mastra/core@1.64.0`. The already installed `@mastra/libsql@1.22.3` is directly pinned so the Node adapter preserves its native-loader externalization. PostgreSQL remains the product storage provider. Current `package-lock.json` SHA-256:

`92a11d0af44750c6be9318b5d6b1b0e6b4a4b84a63f73a8a63e021b8bd02bd54`

The deployed Phase 1 lock hash is `e265b4b1bedf009432ee353822ac90256456d7ef9d05f5b0127d08b80e1c09e7`.

The earlier Phase 0 combined lock hash was `4969ccda2adaae5768b4798f269a9022e55be3781571e2c015d9527a52051e71`; it is historical, not the current lock identity. Local qualification uses the separately installed Node 22.23.5. Its official archive SHA-256 was `4a191082e9706866830379d577d2cc8a50c776fcd9436a8d061b063ed0d9a0e3`. It does not replace the machine's Node 22.13.1.

## Phase 1 evidence

| Scope | Observed result |
| --- | --- |
| Application/config unit checks | 14 passed |
| Types/Svelte | Zero errors and warnings |
| Domain on real local PostgreSQL | 9 groups passed: governed bootstrap, replay, identity, authority, revisions/archive, simultaneous edits, uncertain settlement, session enforcement and role isolation |
| Conversation on real local PostgreSQL | 12 groups passed; independent review identified and repaired lifecycle races before the final regression |
| Browser UI with synthetic transport | Desktop 1440×1000 and phone 390×844 journeys passed; light/dark, draft retention, streaming/Stop, rooms and mobile navigation inspected |
| Browser recovery with synthetic transport | A committed start with a dropped response reused the original key on retry; terminal projection retained partial text and disabled Send until settlement |
| Simultaneous browser views with synthetic transport | Two independent desktop/phone contexts observed the same active turn, followed a new remote turn, settled to identical history without duplicates and retained separate drafts |
| Real hosted product/provider | 11 checks passed on the READY Phase 1 Preview, including an actual GLM response and saved/reopened transcript |
| Production browser continuity | Two independent desktop/phone browser contexts rendered the same saved GLM reply after redeployment; both text exports matched and neither had browser errors |
| Hosted session revocation | The test session was signed out; its stale cookie immediately received 401, and its local cookie file was removed |
| Final packaging/production | Clean Node and Vercel builds passed, actual Node HTTP and all three generated Vercel handlers passed, 4,424 output files inspected, production promoted |

[Domain evidence](../qualification/phase1-domain/evidence/latest.json), [conversation evidence index](../qualification/phase1-conversation/latest.json), and [browser builder record](docs/PHASE-1-EXPERIENCE.md) retain their separate scopes. The [live test record](../qualification/phase1-ops/live-test.json) ran from `2026-11-16T15:28:02.454Z` to `15:28:22.963Z` and passed: anonymous refusal, foreign-origin refusal, owner authentication, governed room/conversation creation, exact-key replay, conflicting-key refusal, live GLM completion, streamed text persistence, matching reopen, remote Stop settlement and archive history preservation. This is real hosted integration evidence, separate from synthetic browser fixtures and the owner's eventual review.

The UI preserves uncertain send keys through reconnect/reload, waits for durable transcript projection after a terminal turn, and transfers observation when another device starts a new active turn. Navigating away stops observation only; explicit Stop requests cancellation. [Production browser evidence](../qualification/phase1-ops/browser/result.json) used a verified owner session in two independent contexts; it does not claim two independent password logins. [Session revocation](../qualification/phase1-ops/session-revocation.json) passed. The private owner password has not been created by an agent, and a fresh one-time setup link has been handed to the owner.

## Historical Phase 0 record — 16 November 2026

The foundation stage intentionally had sending disabled, page-local drafts, no product records and readiness 503. Those descriptions apply only to its earlier deployments and tests. The protected foundation deployment was `dpl_5nwgRcjdb7aT5hav2mdh8ip7NfAG`; its 12-check suite and six-then-twelve archive stages are not the current Phase 1 product evidence.

- [Phase 0 app evidence](docs/PHASE-0-EVIDENCE.md), [machine record](evidence/phase-0.json), [Vercel foundation deployment](docs/VERCEL-DEPLOYMENT.md) and [independent hosting review](docs/VERCEL-INDEPENDENT-REVIEW.md).
- [Installed UI proof](../docs/phase-0/public-ui-proof.md), [hosted boundary proof](../docs/phase-0/hosted-capability.md) and [combined twelve-archive consumer](../docs/phase-0/vercel-extension-consumer.md).
- [Hosted synthetic runtime qualification](docs/HOSTED-RUNTIME-QUALIFICATION.md) and [declared-action proof](../qualification/phase0-action-boundary/README.md).
- [GLM adapter qualification](../qualification/zai-provider/ADAPTER-QUALIFICATION.md) and [live Preview provider record](evidence/zai-provider-live-preview.json). After the owner updated the key, the temporary provider test completed through VICT/Mastra with one synthetic automatic write and its authorization receipt; that test deployment was removed.

The reusable VICT extension is separate framework work. Quellight consumes its public persistence/coordination and owns product rules and composition. Earlier Oracle/Render assessments remain historical alternatives, not selected hosts. Docker execution remains unproven.

## Next handoff

Phase 2A started on 17 November after the owner explicitly authorized Phase 2 and delegated work. The root coordinates framework implementation in the isolated VICT-Vercel checkout, an installed consumer in `qualification/phase2-memory`, and free-host recovery research. Root owns integration and live GLM Preview qualification. Production stays on its existing release while this candidate is qualified. The earlier planning checkpoint below remains the baseline, not the current authority to start.

The prompt/plan foundation is committed as `1e6023b`. The owner explicitly reaffirmed that the new VICT memory extension must be reusable across apps; [its task boundary](../docs/tasks/VICT-MASTRA-MEMORY-EXTENSION.md) keeps room/model/prompt/UI policy in consumers. Framework maintenance candidate C6 at `316005c2d06e9ebe094a8ce55d299a32d590d758` passed all 11 isolated installed PostgreSQL groups. Tests cover native Observer/Working Memory/Reflector behavior, generic application namespaces, concurrent processes and honest uncertainty after interruption. [Exact evidence](../qualification/phase2-memory/evidence/0e7cbea1-cc9b-4e81-a904-26572fe836b3/summary.json). Independent review confirmed the configuration, model-shape and provider-error sanitization repairs and gave [scoped live-test approval](../qualification/phase2-memory/INDEPENDENT-CANDIDATE-6.md). This does not qualify complete Phase 2A or product adoption.

Protected Preview `dpl_8JP4Y2nwZnxEL8x9ePzf7V1pykdm` passed the initial five live synthetic checks with the existing GLM-5.3-Flash key kept in Vercel: saved sources, native observation, native reflection, persisted observations/Working Memory and original-message recall. Observer and Reflector requests took about 21 and 19 seconds respectively; actual VICT automatic-write receipts completed. No application generation limits were added. Access gates verified anonymous rejection, operator authentication and the actual 300-second Hobby function ceiling. Fresh deployment `dpl_BJSiAgqap3sL5LgjrFYdXs6qGBb7` read the saved memory and returned the same completed observation result; durable operation rows were unchanged. [Live report and exact evidence](../qualification/phase2-memory-live/LIVE-C6.md). Both temporary Previews and test-only schemas were removed, production stayed unchanged, and migration login/CREATE were disabled again. This is a small synthetic compatibility/persistence proof, not general memory-quality or interrupted-worker recovery acceptance.

A separate managed-chat-context candidate C8 at `80aba466806da066bd5494ee4fc38e2892061448` passed all 14 installed groups through actual public VICT control-service turns, including prior maintenance regressions. [Evidence](../qualification/phase2-memory/evidence/dfa8aa30-460e-4f84-86d3-44412571df42/summary.json); [independent scoped review](../qualification/phase2-memory/INDEPENDENT-CANDIDATE-8.md). It supplies selected memory additions once and records their actual selection, distinguishing them from the full model request and excluding private reasoning/provider metadata. C8 has not yet run with the live provider. Governed model-facing source retrieval, durable scheduled wakeup/reconciliation, correction/forgetting and Quellight memory/UI integration remain unfinished. Scheduled wakeup availability was verified read-only; unattended recovery is still unproven.

Independent product work committed as `03767c1` added the pure server-side `memory/configuration.ts` inheritance model: identical Home/new-room defaults, explicit inherit/override values, intentionally empty guidance, personal-preference and automatic-learning flags, current-room/same-owner recall choice, literal authored purpose and immutable content/provenance revisions. All six focused tests and standalone strict TypeScript passed; root reviewed the files. This is preparatory domain logic, not persisted settings, active memory behavior or finished controls.

The approved UI was committed locally as `01fd00f`. The owner's Phase 2 readiness request is now reflected in the reconciled [execution plan](docs/PHASE-2-PLAN.md). It targets Message History, thread OM, personal Working Memory and source recall. Five work packages cover reusable VICT proof, product memory, prompt/room configuration, quiet VICT inspection and hosted acceptance. The recommended default keeps project/source recall in the selected room with explicit broader recall. Live overrides and basic correction/forgetting now have an explicit Phase 2 scope; deeper adaptation remains Phase 4. This is plan readiness, not native memory qualification or implementation commencement.

[Prompts and context](docs/PROMPTS-AND-CONTEXT.md) records the owner's prompt requirements and current file-based catalog. The active conversation prompt has been extracted from execution code and its resolved content now contributes to activation identity. Native memory and live room overrides remain product work. Complete Phase 2A qualification before changing the app's package baseline: the app's current hosted guard still rejects OM writes, while the isolated extension uses an explicit new native-memory profile. The earlier uncommitted planning checkpoint was superseded by `1e6023b`.

The owner also requested quiet memory visibility from each conversation's option menu. This is recorded as a Phase 2 requirement, with a proposed ready VICT drawer for observations, source messages, actual lifecycle activity and expandable context/configuration details. Current memory and the memory supplied to a past reply require distinct recorded projections. The native memory integration and inspection UI remain to implement.

Delegated read-only review of the revised Phase 2 plan found no material omission or contradiction. It specifically checked the four memory roles, explicit GLM routing, free hosted recovery, short chats, room defaults, editable prompts and inspection. This is independent plan review only; it does not qualify runtime behavior. No application code, provider configuration or deployment changed during the readiness-plan update.

The local prompt extraction passed 17 application/config/prompt tests, zero Svelte errors or warnings, all 12 deterministic conversation groups on real temporary PostgreSQL, and the Node production build. Server/client packaging inspection confirmed the prompt is bundled only on the server. The build reports dependency annotation/circular-import and large-client-chunk warnings. Delegated independent review found no actionable issue and passed the three prompt checks plus standalone NodeNext compilation. These results establish local prompt packaging and conversation behavior. [Conversation evidence](../qualification/phase1-conversation/evidence/7cd8961e-e742-4e72-bf90-dd478eeadcd5/summary.json) used an offline model.

The owner completed private password setup and reported “Done — Quellight opened.” [Owner setup confirmation](../qualification/phase1-ops/owner-setup-completed.json), [packaging record](../qualification/phase1-ops/packaging.json), [exact release inputs](../qualification/phase1-ops/release-inputs.json), and [operator notes](../qualification/phase1-ops/README.md) preserve delivery evidence. Keep the free-service boundary, source-checkout preservation and separate builder/independent/live/owner evidence. Begin Phase 2 automatic memory only under the accepted product plan and subsequent phase authority.
