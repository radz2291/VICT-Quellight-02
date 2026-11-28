# Frozen development scoring protocol

Use this packet to calibrate review of short software handoffs. Each pair receives one task and the same source facts. Score the two artifacts independently in their published presentation order. The comparison key stays with the fixture custodian until the independent reviews and objective checks are recorded. The artifacts are authored practice responses with an executable policy appendix. The source facts and expected probe results are part of the development packet. No practice case enters the later held-out set.

## Four dimensions

Apply the per-case anchors in `cases.json`. Score each dimension from 0 to 2. Score 2 for the stated anchor with specific artifact evidence, 1 for partial coverage or a plausible repairable omission, and 0 for absence, a material contradiction or a behavior the artifact cannot support. Record a concrete fact or artifact location for each rating. Judge what an engineer can build from the handoff with its existing decisions. Writing polish alone carries no score.

| Dimension | What to inspect |
| --- | --- |
| `handoff` | Data, flow, retry or fallback and checks available to build the task. Material gaps requiring engineering invention reduce this score. |
| `gaps` | Whether the answer notices and resolves a consequential failure mode with a checkable prevention or test. |
| `interventions` | Whether it handles reversible details and asks only the owner decisions that remain necessary. A needed focused question can earn full credit. |
| `owner` | Whether it follows the latest owner decisions, preserves reserved actions and separates source eligibility from permission. |

## Hard checks and verdicts

Every listed `required`, `authority` and `correction` check is a hard gate. Cite the failed check ID and contradicting artifact when a response breaks it. An appendix wins no credit for a promise contradicted by the prose. The deterministic scorer executes the declared rules with the frozen input vectors. Its unit is the policy specification in the artifact. It qualifies those declared behaviors and leaves the human-facing rubric to independent review.

- If only one response passes the hard gates, it wins the pair regardless of numerical scores.
- If both fail any hard gate, the pair has no eligible winner.
- If both pass, add the four scores. A difference of at least two points names a material preference for this dry run. Smaller differences are practical ties. Record exact score ties separately.
- Keep each independent score sheet and its blind verdict. Aggregate only after scoring ends. A confirmed objective defect or a confirmed scope violation disqualifies a response. The final aggregate uses the mean of two independent totals for eligible outputs. A disputed manual gate stays visible with its source evidence and the disposition. The dry-run margin remains a proposal for Radzi to set before 4A.

## Blinding and sealing

Each case has one opaque ID per artifact and two randomized presentation positions. The fixture custodian uses a seeded HMAC permutation and assigns three guidance-on artifacts to each position across the six cases. Record a SHA-256 commitment to the seed, frozen case bytes and exact blind packet bytes before scoring. Give reviewers the frozen cases and versioned packet. Keep the seed, arm labels, expected perturbations, draft authorship notes and the other reviewer's scores out of their inputs. Ask reviewers to report any identifying cues they notice.

Each reviewer writes one JSON file containing `reviewer`, `packetSha256`, `cues`, and `ratings`. A rating contains `caseId`, `artifactId`, `scores`, `evidence`, and `failedGates`. Give `scores` and `evidence` the four keys in the table above. A failed gate records `id` and `reason`. The reviewers work independently of each other and of the deterministic objective result. Seal score and objective-result bytes before the custodian releases the key. Decode with the original seed and verify the commitment. Report disagreements by dimension and gate, exact and practical ties, gate overrides, and the small-sample uncertainty.

## Later comparison

The held-out custodian creates a fresh, materially different set after the practice protocol is frozen. Keep tasks, private evaluator answers and undisclosed scenario vectors outside prompts, learning histories and tuning. The tested system can receive its assigned held-out task only during its evaluation turn. Generate matched outputs with a pinned identity, ordinary memory, tools, permissions, Desk, model and generation settings. The control uses the ordinary instructions. The candidate includes the one current approved room block before Desk. Scope the verdict to work-product quality, observed intervention cost and authorization. Radzi sets material targets and makes the identity decision separately.
