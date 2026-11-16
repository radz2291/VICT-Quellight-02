# Phase 2 — Automatic, inspectable memory

Prepared 17 November 2026 using the VICT app-development skill. The owner subsequently authorized Phase 2 implementation with delegated agents, beginning with reusable VICT memory support and GLM tests. Phase 2A is in progress. Native memory, its hosted lifecycle and its GLM behavior have not yet passed that qualification.

## Outcome and decisions

After an ordinary conversation, Quellight should remember useful information automatically, use relevant context in a later conversation on phone or laptop, and let the owner inspect or correct that memory quietly. Opening **⋮ → Memory** should explain the selected conversation's memory and actual processing activity. No individual memory approval is required.

Accepted requirements are automatic learning, ready-made VICT UI, VICT/Mastra execution, hosted phone/laptop access, free services, the existing GLM-5.3-Flash provider, organized editable prompts, configurable room behavior and optional memory visibility. ARA remains the reference for useful companion behavior and user control.

The recommended implementation uses four cooperating parts. This is the architecture to qualify, not a claim that it has already outperformed ARA with GLM.

| Part | Responsibility in Quellight | Phase 2 status |
| --- | --- | --- |
| Message History | Preserve original messages and supply recent conversation context; retain source material for recall | Already active; qualify its interaction with OM and retrieval |
| Observational Memory | Maintain dated observations within each conversation and consolidate them as needed | Requires reusable VICT exposure and hosted proof |
| Working Memory | Maintain a small personal profile of stable preferences and facts, with attribution and corrections | Native support needs governed updates and cross-conversation concurrency proof |
| Source recall | Find relevant earlier conversations and inspect original messages when needed | Qualify native retrieval through VICT; enforce room selection in the product layer |

OM complements stored history. Its context compression does not itself establish short-conversation learning or cross-conversation recall. Native thread scope and retrieval are the starting point. [Mastra OM overview](https://mastra.ai/docs/memory/observational-memory).

Vector semantic search is a later optional enhancement if it adds measurable value and has a qualified free embedding route. Knowledge and experimental memory systems are outside this phase. Do not silently add a paid provider or run a duplicate ARA capture/digest pipeline alongside the new system.

## What is ready and what needs proof

- Phase 1 provides authenticated rooms, persistent conversation, governed GLM execution and hosted storage. Its evidence remains scoped to those features.
- The approved quiet UI is committed locally as `01fd00f`. Production still serves the earlier Phase 1 UI. New memory UI follows local owner review before hosting.
- The conversation prompt is already in a server-only catalog with content-derived activation revisions. Prompt extraction passed local tests and remains uncommitted at this planning checkpoint.
- Installed VICT memory policy exposes history and limited Working Memory settings, with semantic recall disabled. Its hosted PostgreSQL guard explicitly rejects OM writes. The installed baseline is not ready to enable the target architecture by changing a flag.
- Native memory writes, resource-level concurrency, source/context evidence, recovery and a free browser-independent wakeup mechanism remain implementation dependencies. Prove them in the first work package.

Current source findings are recorded in the [capability map](../../docs/reference/QUELLIGHT-CAPABILITY-MAP.md). Newer upstream documentation does not establish availability in the pinned packages.

## Work packages and ownership

The primary agent orchestrates the work and integrates one qualified candidate. Delegate reusable framework work separately from Quellight behavior, with independent review of the actual installed candidate. Existing reference checkouts remain unchanged.

### 2A — Qualify reusable VICT memory support

The framework agent prepares the public memory extension in an isolated, appropriately instructed framework workspace. Its contracts must serve other applications and contain no Quellight room names, prompts or product policy.

The owner explicitly reaffirmed this reusable scope during implementation. Include a generic application consumer proving configurable model, actor/resource/thread mapping and isolated namespaces without any Quellight import. The framework owns general memory contracts and lifecycle; Quellight owns its room semantics, selected prompts, learning policy and UI.

Expose the chosen native memory configuration, explicit model routing, supported prompt customization, authorized inspection and lifecycle integration. Qualify durable memory writes against VICT authority and receipts, including writes native tools/processors perform internally. Do not rely on the existing synthetic quiet-write proof as evidence for these new paths.

Prove actor isolation, thread ownership, resource-level update coordination across simultaneous conversations, idempotent replay and stale-job fencing. Establish how prepared observations become active, how work survives a function exit and how failed or uncertain work is reconciled. A process-local promise or mutex is insufficient for hosted recovery.

Select and exercise a free wakeup mechanism using the existing infrastructure or another explicitly free supported option. Record its actual cadence and host restrictions. First prefer completing useful short-chat learning within the governed turn lifecycle; qualify durable idle/catch-up work for anything still pending. Browser navigation is a hint, never the only trigger. Background settlement and unattended wakeup are separate proofs.

Pin compatible package artifacts and hashes, test an isolated installed consumer and then run a small live GLM memory exercise through VICT. Explicitly route every model-backed memory role to the existing GLM-5.3-Flash profile. Preserve provider generation defaults and completion-or-cancellation behavior. Host ceilings and memory compression thresholds must not become invented generation cutoffs.

**Exit evidence:** actual OM, Working Memory and source-recall behavior through the public adapter; authorized writes and refusal cases; cross-process recovery; named free wakeup route; exact candidate baseline; live GLM parsing and source-recall results. A failed quality or hosting check produces a concrete revision to the approach, not an unannounced fallback.

### 2B — Implement Quellight memory and context

The product agent maps authenticated owner → resource, conversation → thread, and room → Quellight-owned grouping/configuration. Keep the original transcript, learned memory, authored configuration and operational evidence distinct. Preserve original source IDs, timestamps, scope and version references.

Implement automatic observation, profile updates and recall with one documented context assembly path. Record which memory, retrieved sources and instruction versions were supplied to each reply. Current-memory reads cannot reconstruct historical inputs reliably. Persist enough selected context to inspect that reply without storing private model reasoning, secrets or unnecessary duplicate history.

Cover useful short chats, changed preferences, uncertain inferences, trivial exchanges and later source retrieval. Select one authoritative writer for each Working Memory field so observer extraction and agent tools cannot race to overwrite it. Record evaluated, pending, completed and failed work truthfully. Retry from persisted source/configuration revisions and retain the last good memory after failure.

Provide basic correction and forgetting for the memory introduced here. A correction records newer user authority. Forgetting suppresses applicable material from every enabled memory representation, recall and stale queued work, including later re-derivation from retained sources. Clearly distinguish it from transcript deletion or room archive. Phase 4 extends memory care to its later adaptation features.

**Exit evidence:** a useful short and a long conversation both support a later conversation without approval; unchanged work does not duplicate memory; corrections and forgetting remain effective after retry/rebuild and from another device.

### 2C — Add versioned prompts and room configuration

Use the [prompts and context design](PROMPTS-AND-CONTEXT.md). Start adopted native roles from qualified Mastra defaults, retaining their package identity and default snapshot/digest separately from Quellight additions. Keep app-owned prompts in the shared server catalog; introduce versioned stored overrides for settings that can change without deployment. Each operation pins its effective configuration, including background work.

Native Observer/Reflector/recall customization uses additional instructions; Working Memory accepts a template or schema. An editor must state its actual edit mode. Full replacement of native base prompts would require a further supported extension and parser validation. [Mastra OM configuration](https://mastra.ai/reference/memory/observational-memory).

Home and every created room inherit app defaults. Purpose and explicit room overrides remain local to that room. Default changes propagate only to inherited fields; reset removes an override while preserving data. Separate user-stated purpose from learned interpretation. A template edit preserves learned memory and does not silently regenerate it.

The recommended initial scope is personal preferences shared within the owner account, conversation observations kept per thread, and automatic project/source recall restricted to the selected room. Broader same-owner recall is an explicit room option. This is a product default proposed for qualification, preserving ARA's room relevance; it is not a new security boundary or an already accepted claim that every room shares its context. Room-specific context is Quellight composition, not a second native resource profile.

**Exit evidence:** Home/new-room inheritance, explicit empty overrides, default updates, preview/save/restore, unchanged learned content, pinned in-flight jobs, and no accidental widening of recall scope.

### 2D — Compose quiet memory access using VICT

The UI agent uses the installed VICT menu, drawer, disclosure, text/list, form and feedback controls. The first view under **⋮ → Memory** shows the current thread's observations. Supporting detail opens on demand.

- Show current and previous observations, original sources and prepared observations awaiting activation.
- Show recorded Observer/Reflector activity, pending work and failures, updating while the view is open and recovering after reconnect.
- Show applicable Working Memory with clear personal/room/thread labels.
- Show the actual retrieved material and recorded context for a selected reply, separately from current memory.
- Show effective prompts, customization mode, app defaults and room overrides, with quiet configuration and correction actions.

Opening the view only reads/subscribes. It does not initiate observation or approve a memory. Preserve the conversation draft, scroll and selected thread. Use the same quiet typography, density and navigation behavior on phone and desktop. New conversation remains available only in the sidebar/mobile drawer.

**Exit evidence:** local owner review, public-control provenance, keyboard/phone use, long/empty/error states, source navigation, actual lifecycle transitions and restored inspection after reconnect. Label fixtures as sample content until bound to actual memory records.

### 2E — Integrate and verify the hosted milestone

The independent reviewer checks the integrated artifacts and behavior, separately from builder evidence. Run focused deterministic tests, database/concurrency tests, local UI journeys and a small realistic GLM evaluation before the hosted journey. Compare representative ARA behavior against the candidate using the same supplied scenarios; do not infer GLM superiority from benchmarks on other models.

| Acceptance journey | Required result |
| --- | --- |
| Useful short chat | A preference survives into a new conversation even below normal OM compression thresholds |
| Long chat | Active observations and recent messages preserve relevant detail; original messages remain available |
| Changed preference | New explicit preference supersedes the old one without rewriting unrelated facts |
| Source attribution | A remembered claim links to the correct person, conversation and messages |
| Rooms | Home and new rooms inherit correctly; project context follows the selected recall scope |
| Inspection | Saved observations, actual activity and reply context agree with server evidence |
| Correction/forgetting | Corrected or suppressed material stays controlled through recall, retry and rebuild |
| Two devices | Concurrent conversations retain both valid updates and reopen consistently |
| Browser/host interruption | Pending work resumes without browser presence or duplicate settled writes |
| Provider failure | Last good memory survives; pending/failed state is truthful and recoverable |
| Configuration change | Future runs adopt saved revisions; active/retried work retains its pinned meaning |

Record latency and existing subscription usage for all memory roles. Do not spend on a new embedding/model service to make a test pass. Hosting constraints must be reported as actual constraints. Phase 2 is complete only when the integrated hosted phone/laptop journey passes; a local demonstration or approved plan is intermediate evidence.

## Following phases

Phase 3 adds the collaborative Desk and its learned working method. Bind reflection to trustworthy product events under the new memory lifecycle rather than relying on an ARA capture callback that may no longer exist. Phase 4 adds deeper attunement and evolving room understanding where they provide behavior beyond the new memory engine. General digests should be added only for a distinct useful outcome. Migration, broader recovery and final release follow the main roadmap.

No ARA data is imported in Phase 2 qualification. Framework changes and isolated provider/hosted qualification belong to the authorized Phase 2 work; production rollout follows local UI review and the actual release authority.
