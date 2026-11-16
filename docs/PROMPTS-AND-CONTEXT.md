# Quellight prompts and context

Radzi's 17 November 2026 direction makes memory and context central to Quellight. Start supported memory roles with Mastra defaults, keep prompts organized and editable, and allow future tuning throughout the app. The proposed memory architecture combines stored Message History, conversation-scoped Observational Memory, a small personal Working Memory, and source-message recall. Semantic search and Knowledge remain options to evaluate. The architecture comparison is a design recommendation pending GLM qualification.

The current product runs Message History. Its conversation instructions now live in [conversation.json](../src/lib/server/prompts/conversation.json), registered by the server-only [prompt catalog](../src/lib/server/prompts/catalog.ts). Each template is an array of readable lines, with an ID, description and declared variable names. Edit those lines to change the app-owned prompt. `{{roomPurpose}}` receives the selected room's stored purpose as literal context. Variables are resolved once, so placeholder-like text in a room purpose is preserved.

The renderer rejects missing, extra, undeclared and unused variables, and empty instructions. It hashes the resolved text and ID. The conversation profile includes that prompt revision in its activation identity, and the existing VICT activation record retains the selected artifact IDs and revisions. The running turn uses its frozen instructions. A later prompt edit produces a different activation. Reverting the text and context restores the corresponding identity. Git retains source-file edit history; the future live version store must retain editable prompt source and configuration history as well.

This first catalog is bundled with the app. Applying a file edit to a hosted instance requires a new deployment. Live prompt editing, saved override versions and room configuration are assigned to [Phase 2C](PHASE-2-PLAN.md); memory inspection and basic care are Phase 2B/2D. These remain planned capabilities. The catalog currently contains the one active product prompt. Add new entries alongside their consuming feature.

The planned catalog covers these roles.

| Role | Initial source | Intended customization |
| --- | --- | --- |
| Conversation | Quellight's current prompt | Full app-owned template editing |
| Observer | Qualified Mastra default | Editable additional observation guidance |
| Reflector | Qualified Mastra default | Editable additional consolidation guidance |
| Recall | Qualified Mastra default | Editable additional retrieval guidance |
| Working Memory | Qualified Mastra template | Template or validated structured schema, plus update guidance |
| Room interpretation and attunement | Quellight behavior informed by ARA | Versioned app-owned instructions when implemented |
| Desk method | Quellight behavior informed by ARA | Versioned app-owned instructions when implemented |

Mastra's public `observation.instruction`, `reflection.instruction` and `retrieval.instructions` append to the built-in prompts. Working Memory accepts a template or a schema. Full replacement of native Observer/Reflector/recall base prompts would require an additional reusable integration capability and validation of the output formats those engines consume. The future editor must accurately identify its edit mode. [OM configuration](https://mastra.ai/reference/memory/observational-memory), [Working Memory](https://mastra.ai/docs/memory/working-memory).

For inherited prompts, retain the qualified package version, default snapshot or digest and any Quellight additions separately. The effective prompt view should show their composition. An upstream package update must preserve authored overrides and make changed defaults reviewable. Saved changes need comparison, activation and restore support. Keep learned Working Memory contents separate from its template so a template edit preserves accumulated information.

Room configuration is proposed as inheritance with explicit overrides.

| Level | Proposed responsibility |
| --- | --- |
| App defaults | Default memory behavior, prompt references, context selection and response guidance |
| Home | Inherits app defaults with its own purpose and optional overrides |
| Other rooms | Inherit app defaults with their own purpose and optional overrides |
| Conversation | Resolves its room's effective configuration and records the versions selected for the run |

Home follows the same configuration rules as every other room. Creating a room references the defaults instead of copying their text. Later default updates reach inherited fields. Explicit overrides survive those updates. Resetting a field removes that override and resumes inheritance while retaining conversations and memories. Use an explicit inherit state so an intentionally empty addition can be represented separately.

Proposed room controls include purpose, additional response guidance, memory participation and recall scope. The initial recommended default shares a small personal profile within the owner account, keeps observations per conversation and restricts automatic project/source recall to the selected room. Broader same-owner recall is an explicit room option. This recommendation is for qualification and does not assert a new room security boundary. Mastra exposes resource and thread scopes, so room membership and effective configuration are Quellight domain responsibilities. Person authorization remains enforced at the server boundary.

Resolve context in a documented order from app instructions, selected room guidance and stated purpose, applicable personal and room memory, conversation observations, retrieved source material and recent messages. Keep user-authored purpose, inferred room understanding and assistant suggestions attributable to their sources. Context selection policies and prompt text both need revision tracking. An operation pins its effective configuration at start, including catch-up work and retries.

The planned configuration editor uses ready VICT forms, disclosure and history controls, with an effective-value preview and restore action. Prompt customization affects future execution. An explicit rebuild or repair action handles changes to derived memory when needed. Automatic capture and adaptation continue without per-memory approval.

Radzi also requested quiet, optional visibility into memory on 17 November. Add **Memory** to the conversation's existing three-dot menu when the memory feature is delivered. It opens the selected conversation's inspection view. A ready VICT drawer is the proposed compact entry surface, with responsive width and expandable details. Keep the conversation's draft, scroll position and selected thread intact when opening and closing it. Show current observations first, with supporting detail available on demand.

| Inspectable area | What the owner can see |
| --- | --- |
| Observational Memory | Current active observations and their source messages, with previous versions and separately identified prepared observations awaiting activation |
| Activity | Recorded observation/reflection starts, completions, failures and pending work, with timestamps and live updates while the view is open |
| Working Memory | The applicable stored personal or room context and its scope, source and update history where recorded |
| Recall | Material actually retrieved for a selected reply, with links to its source conversation |
| Context | The recorded memory and instruction versions supplied to a selected reply, with current configuration available separately |
| Prompts and configuration | Effective app defaults, room overrides, template versions and customization mode |
| Other enabled memory features | Their saved results, source associations and available history, following the same inspection pattern |

Opening this view performs authenticated reads and subscriptions. Memory jobs follow their normal triggers. Keep inspection available without requiring an approval step. Correction, forgetting, restore and configuration editing are explicit actions with their own versioned results. The current conversation is the initial scope; related room and personal memory can be inspected through clearly labelled navigation.

Mastra documents memory status snapshots and observation, reflection, buffering and activation events, plus observation groups linked to original messages. The VICT integration must expose suitable owner-authorized projections and persist enough lifecycle evidence to restore the view after reconnect. A recorded model-input snapshot can establish what was supplied to a reply. A current-memory lookup alone establishes the present contents. The interface must preserve that distinction, display actual empty/loading/unavailable states and derive activity from recorded events. [OM events and retrieval](https://mastra.ai/reference/memory/observational-memory).

Build the view from installed public VICT menu, drawer, disclosure, list/text and feedback components. Existing dropdown and drawer patterns are already used by Quellight. Review the composed inspection experience locally on phone and desktop. Verify thread switching, source navigation, scope labels, pending-to-active transitions and reconnect against actual memory records. This visibility is part of the Phase 2 memory delivery, with additional sections joining as their underlying features become available.

Verification must cover changing preferences, useful short conversations, accurate attribution, room relevance, correction and forgetting across every memory representation, simultaneous phone/laptop use, and recovery after browser or host interruption. Use the existing GLM-5.3-Flash profile and free-service constraint. Native memory and room configuration still require runtime implementation and hosted evidence.
