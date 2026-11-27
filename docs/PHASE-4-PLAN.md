# Quellight Phase 4 delivery plan

**28 November 2026 · Owner review · Proposed work sequence**

The first product proof is a conversation. A person who describes software in terms of the experience they want opens a fresh chat in an established room. Quellight understands what the room has become, carries the right objective forward, contributes the engineering judgment the person needs, and produces something another engineer can implement. The person can change the objective or correct Quellight's reading of their role. The next relevant reply reflects the change.

Radzi is reviewing the documents at **4P.4**. The first work item to issue after agreement is a **4R baseline and capability investigation**. Production code, the identity choice, evaluation thresholds and deployment each have later evidence and decision points.

## Read before taking a work item

| Document | How the agent uses it |
| --- | --- |
| [Phase 4 specification](PHASE-4-SPECIFICATION.md) | Governs product behavior, boundaries, authority and acceptance. Pin its agreed commit in the ticket. |
| [Identity reference](IDENTITY-REFERENCE.md) | Locates the two source lineages, distinguishes authored voice from learned room guidance, and defines how candidate identities can be tried. |
| [Qualification protocol](PHASE-4-QUALIFICATION.md) | Defines the comparisons, fixtures, measurements and evidence needed to make a claim. |
| [App instructions](../AGENTS.md), [state](../STATE.md), [Phase 2 delivery](PHASE-2-DELIVERY.md) and [Phase 3 delivery](PHASE-3-DELIVERY.md) | Establish existing responsibilities for conversation, native memory, care, Desk and room method. Verify actual source and host independently when making a deployment claim. |

The design was reconciled against app `main` at `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344`. The pre-identity specification is preserved at `6e92148396418bbf015584d82f1c9841406a79b2` on the history of `docs/phase-4-attunement-spec`. At task start, record the actual product commit, the agreed specification commit, the lockfile and the exact installed VICT artifact closure. If the product has moved, describe the differences relevant to the task.

## Sequence and owner decisions

| Stage | Work and dependency | What the owner or next agent receives |
| --- | --- | --- |
| **4P.1–4P.3 · Completed design inputs** | The original discussion established the intended companion experience, a pre-identity technical baseline and the two reference lineages. | The original specification and the reference material remain traceable. These milestones describe completed design work. |
| **4P.4 · Reconciliation, in review** | Bring identity, room understanding, intent and attunement into the specification and companions. | Radzi can accept or amend the scope and authorize the first investigation. |
| **4R · Research and qualification** | Measure current behavior before changing it. Test candidate native features in the installed VICT path and compare alternatives in isolation. | A measured baseline, capability findings, recommended integration route, free-service feasibility and proposed budgets. Record which decisions the evidence supports. |
| **4I · Identity integration** | Use 4R's characterized context path to compare three voice conditions under matched tasks. Evaluate conditioning of learning separately. | Versioned candidate composition, behavior and resource results, owner experience judgment, and a recorded selection or reason to revise. |
| **4A · First room-learning slice** | Use the chosen integration path and a pinned identity. Build one end-to-end room learning loop with all three dimensions, care and inspection. | A fresh chat produces a usable new software specification. A targeted correction survives reopen, retry and a later update. Radzi can inspect and try the loop. |
| **4B · Situated agency** | Extend the verified slice to contrary evidence, changing requests and different divisions of responsibility. | Held-out cases show when Quellight independently resolves a gap, asks for a decision, challenges a premise or simply answers. |
| **4C · Outcome learning** | Link real quality evidence and feedback to revisions. Compare sampled evaluator judgments with verified outcomes. | An observed failure can revise an established interpretation, a success can reinforce a qualified one, and an unknown outcome remains unknown. |
| **4D · Longitudinal evolution** | Exercise consolidation, selective retrieval and reconsideration as room history and human expertise grow. | Results for 10, 100 and 1,000+ conversations over simulated 5–10-year histories, with source fidelity, resource cost and correction evidence. |
| **4E · Integrated qualification and release decision** | Re-run the agreed comparisons, cross-domain cases, previous-phase regressions and hosted journeys on a pinned candidate. | An independent verdict, reproducible evidence, remaining issues and a release recommendation. Radzi decides product acceptance and authorizes any production deployment. |

## First proposed Rolladice brief

**Establish the Phase 4 memory, cache and VICT capability baseline**

This proposed ticket can be issued once the documents are agreed.

**Problem and goal.** Current short-chat learning uses an observation threshold of one message token and a recent-history selection of up to 1,000 messages. The settings alone cannot tell us what the model receives, which work repeats, what the provider caches, or whether the installed VICT adapter exposes the candidate Mastra features. Produce enough evidence to choose the next experiment without disturbing the current app.

**Inputs and ownership.** The orchestrator supplies the agreed specification revision, a clean isolated consumer or checkout from the recorded app commit, and the approved synthetic test context. The assigned researcher owns the reproduction and measurements. Independent verification is attributed to a different reviewer. Start from [the lockfile](../package-lock.json), [VICT artifact identities](../baseline.json), [native composition](../src/lib/server/memory/native.ts), [native policy](../src/lib/server/memory/native-policy.json) and [foreground activation](../src/lib/server/conversation/activation.ts).

**Work**

1. Reproduce the qualified install. Inventory the exact public surfaces for native Observer/Reflector extraction, lifecycle hooks/events, State Signals and Scorers. Record the import or contract exercised, a minimal reproducer, and the first unsupported boundary. Distinguish upstream availability, the installed artifact, and availability through VICT.
2. Trace ordinary chat from admission through the actual model-facing context and settled turn into native maintenance. Identify the stable prefix, variable sections, model roles, data owner, existing provenance and where a committed evidence event could be observed. Redact private content and credentials. A configuration read by itself establishes only configuration.
3. Measure the current app on isolated synthetic short chats, including one consequential exchange, and a continuous 100+ turn chat. Separate cold start, successive warm turns, idle return and changes to memory or Desk. Keep the qualified GLM-5.3-Flash profile and provider defaults. Record actual usage and latency by role, request counts, native updates and database traffic. Identify unavailable fields and the limits of proxies.
4. Record the new information each candidate could supply and what still needs a focused experiment. Recommend the smallest next 4R work item and propose numerical budgets grounded in the measured baseline. If a measurement needs a capability beyond existing authorization or free capacity, finish independent probes and document the exact gap.

**Return and acceptance.** Identify all commits, archive hashes, fixtures, commands, environment, actual provider profile and measurement conditions. Return the capability matrix, inspectable evidence for one short and one long run, measurement tables, failed attempts and the recommendation. The reviewer should be able to reproduce an installed probe, associate an observed background operation with its source, and distinguish measured, estimated and unavailable values. Put the report, evidence link, tested SHA and limitations on the assigned ticket and move it to Review. This ticket's boundary is diagnostic. Changes to product behavior belong to a separately scoped implementation item.

## Remaining 4R work

Propose the following briefs after seeing the baseline. A single agent may group experiments when they share a fixture and artifact closure. The questions and evidence determine the grouping.

| Question | Experiment | Decision the result supports |
| --- | --- | --- |
| Can native processing supply enough evidence? | Compare text and structured extraction with a bounded background interpretation on identical synthetic traces. Include ordinary chat, one meaningful correction, a shallow greeting, contradictory feedback and an outcome verified by a person or artifact. Check recall of relevant evidence, unsupported inferences, source pointers, isolation of extractor failure and actual call cost. | Choose evidence acquisition and identify when separate synthesis is justified. |
| Can eligible work survive a lost worker? | Start from a committed source, replay notifications, interrupt before and after preparation, interleave corrections from another thread, then resume. Follow [worker](../src/lib/server/memory/worker.ts), [dispatcher](../src/lib/server/memory/dispatcher.ts) and [care actions](../src/lib/server/memory/care-actions.ts). | Choose the durable enqueue/recovery boundary and specify revision and source-authority checks. |
| How should a room revision reach the model? | Compare no added state, stable and changed prompt insertion, and any qualified signal/context mechanism. Exercise first use, unchanged turns, subsequent revision, reopened chat, compaction and source exclusion. Verify actual delivery, cache fields, traffic, foreground latency and identical eligible state. | Select exactly one delivery mechanism. Document fallback behavior where the installed path or provider lacks a feature. |
| Which comparisons can support owner decisions? | Dry-run fixtures and scoring on material excluded from the held-out evaluation. Verify blindness, same ordinary memory and compatible provider settings for both arms. Compare scorer output with independent review and objective artifact checks. | Agree workloads, metrics and thresholds before viewing held-out outcomes. Establish which quality judgments require the owner. |

If a reusable feature is missing, first describe the required public contract and the precise product behavior it would enable. Qualify any authorized framework change in a separate isolated installed consumer. Quellight owns the identity, prompts, room policy and interaction design. Record the selected route and its tradeoffs in the qualification evidence before 4A depends on it.

## 4I · Choose the voice in a real exchange

Compare the current application voice, the ancestor voice preserved as the original Quellight's frozen `legacy-soul.md`, and the original Quellight's eight-movement persona assembled as one voice. Pin all three revisions. Follow the [identity reference](IDENTITY-REFERENCE.md) for source, ordering, editing and provenance. Save the exact candidate identity and effective composition privately where appropriate. Preserve current product contracts for care, Desk, room scope and authorized actions in every condition.

Run the same synthetic conversations with the same provider, contextual facts, tool access and prompts apart from the intended identity variation. Include ordinary practical help, genuine disagreement, a vulnerable moment without a request for advice, a direct correction and an explicit decision. Examine what the actual answer does for the person. A technically correct run supplies a transcript and effective context. Radzi supplies the separate felt judgment of whether the voice is recognizably Quellight, sustained and appropriate to that moment.

Then hold the speaking voice fixed and compare any proposed change to how learning interprets evidence. Check that the same statement can be interpreted with care and uncertainty while room/owner authority and source eligibility still hold. Record which conditioning was adopted for speaking and for learning, why, how to identify the effective revisions, and what would trigger reconsideration. An inconclusive audition leaves 4I open for another comparison. If Radzi explicitly selects the current voice provisionally, 4A may use that choice while the final identity remains open. The 4A comparison uses the same pinned identity in both arms.

## 4A · Build the smallest meaningful room-learning loop

**One experience, three views of the same collaboration.** In training conversations, a synthetic founder uses the room to develop product ideas into implementable designs, has an immediate objective for the current project, and repeatedly values independent engineering judgment while reserving product choices. The learning layer can describe the room's emerging use, the direction currently being held, and how Quellight should complement this person. An explicit request for today's agenda is local to the request unless evidence supports a broader change. No successful Desk creation is needed for the room to learn.

| Work package | Completion evidence |
| --- | --- |
| **Acquire and publish** | Eligible ordinary chat teaches the room. Show source references, uncertainty, prior revision, relevant dimension and reason for change. Trivial input leaves the state alone. Concurrent synthesis cannot overwrite later authority. Demonstrate recovery of a prepared operation and a truthful failure outcome. |
| **Deliver and use** | The actual foreground activation of a new and a reopened chat in the same room selects an eligible revision and delivers it once. Another room does not receive it. On a novel task, the companion produces a reviewable specification with dependencies, failure behavior and verification relevant to that task. Compare with a matched native-memory control under the qualification protocol. |
| **Inspect and correct** | On desktop and phone, the owner's normal conversation flow reaches current understanding, intent, relational posture, source, change and selected reply context. The owner can correct any one dimension and see the corrected state on the next admissible turn. Exercise source forgetting and eligible restoration, then show what was excluded and what still applies. Preserve the conversation draft and focus. |
| **Verify independently** | The reviewer reproduces a fresh-chat example and a correction with a stale update pending, checks source exclusion and isolation, inspects the actual delivered revision, and compares blind product outputs and resource costs. Show Radzi the actual conversation and artifact along with the report. |

The full first slice includes normal output, care and recovery even when agents divide the work. A prototype with hand-entered room state can help debug an interface. The 4A learning demonstration must originate in eligible conversation evidence and pass through the real governed learning and admission path.

## 4B–4E · Expand from the proven slice

- **4B, situated agency.** Give the same room a request for one direct answer, an ambiguous product decision and a request that conflicts with a learned default. Check whether Quellight answers plainly, contributes expertise or surfaces a consequential choice as appropriate. On a task where the user requests discussion only, evaluate the response and the absence of unauthorized effects.
- **4C, learning from outcomes.** Link an artifact to a verified review result that contradicts an earlier positive conversational impression. Replay a duplicate result and include an outcome with insufficient attribution. Require a source-grounded change where warranted, a stable revision for duplicate evidence, and an honest unknown for the unverified case.
- **4D, long-lived rooms.** Introduce growth in a person's capabilities, changing room purpose, a stale assumption, partial source forgetting, and a model/identity version change. Measure foreground context size, read/egress growth, storage and reconstruction from eligible sources across each workload. Identify where the existing free host reaches a practical limit. Record simulated time distinctly from observed operating time.
- **4E, integrated qualification.** Extend blind comparisons to point-in-time trading research and evidence-calibrated health inquiry using synthetic cases. Independently check prior phase behavior, care races, reopening, hosted worker interruption, and quiet inspection on phone and desktop. A release recommendation identifies the exact candidate, reproducibility, regressions, data compatibility and rollback/handback steps. Separate the date of qualification, owner acceptance and actual deployment receipt.

## Agent ownership and closeout

The orchestrator pins the agreed revision and uses the project's actual Rolladice numbering when creating a ticket. Give each assignee a problem, goal, bounded authority, dependencies, acceptance cases and required return. Routine choices within a ticket belong to its assignee. A change to the product contract, data authority, release scope, paid infrastructure or final identity choice goes back to the named decision owner. Agents can repair a failed probe or continue independent checks within the issued scope and should preserve their evidence of what failed.

At closeout the assignee updates the ticket directly with its branch and commit, exact artifacts or fixtures, work completed, test conditions, failures, limitations and the decision requested. Independent review cites which results were actually reproduced. The orchestrator reconciles accepted decisions into the governing documents before assigning a dependent change.

**First message for the research agent, after authorization**

> Take the assigned Phase 4 baseline research ticket for `radz2291/VICT-Quellight-02`. Read the four Phase 4 documents at the ticket's pinned revision and the app's current instructions. Reproduce the installed closure, measure existing short- and long-chat behavior on synthetic fixtures, and establish which native capabilities are reachable through VICT. Use the current free setup and provider defaults. Return a reproducible capability matrix, the observed usage and latency, and one recommendation for the next experiment. Update the ticket with evidence, limitations and the tested commit, then move it to Review.
