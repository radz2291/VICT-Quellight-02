# Q4-010 blind scoring calibration

The pilot tested six blind pairs with two independent AI-assisted reviewers and 64 executable checks of the authored policy appendices. Both reviewers and the objective checker rejected the persuasive proof-review handoff that kept the opened proof in its audit log and attached the annotation to the newer live proof. The audit recorded `proof-07` correctly while the declared save resolved to `proof-08`. The frozen contract required `proof-07`. [Frozen case and probe](cases.json) · [Blinded artifacts](packet.json) · [Objective runs](scores/objective.json)

The practice corpus deliberately includes improvements, regressions and inconclusive pairs. It calibrates the scoring method on synthetic authored handoffs. A real model comparison still needs equivalent runtime admission, a no-charge provider path, fresh held-out tasks, and Radzi’s decisions on the material targets. [Arm equivalence and held-out plan](comparison-design.md)

## Results after reveal

Scores are the mean of the two independent four-dimension totals. An explicit requirement, authority or correction failure disqualifies the artifact. When both artifacts pass, a difference of two points out of eight is the development margin. Both reviewers reached the same verdict for all six pairs.

| Case | Guidance off | Guidance on | Paired verdict |
| --- | ---: | ---: | --- |
| D01 · Proof annotation | 4.5/8, wrong proof | 8/8, passes | On by hard gate |
| D02 · Restoration notebook | 8/8, passes | 0/8, withdrawn approval releases | Off by hard gate |
| D03 · Gallery label queue | 8/8, passes | 8/8, passes | Exact tie |
| D04 · Workshop intake | 4.5/8, passes | 7/8, passes | On by 2.5 points |
| D05 · Refill counter | 7/8, passes | 4/8, passes | Off by 3 points |
| D06 · Exhibit loan register | 2.5/8, excluded source used | 0.5/8, stale export grant reused | Neither eligible |

The verdict tally is two on, two off, one tie and one pair with neither output eligible. The lowest score was D02 on, which proposed releasing a snapshot on withdrawn approval. The two low D06 totals illustrate why gate failures stay separate from preference. These outcomes are properties of the authored calibration set. [Score details](results.json) · [Arm mapping](reveal.json)

The deterministic checker and both reviewers matched the exact failed gate IDs for all 12 artifacts. Four of the 64 probe executions failed, covering wrong proof binding, withdrawn release approval, a forgotten source resurfacing and historical export consent. The other eight artifacts passed the hard checks. D04 and D05 had identical policy appendices within each pair. Reviewers still distinguished the necessary owner decisions, avoidable questions and practical engineering detail in the prose. For example, workshop intake needed one retention choice. Its weaker handoff also delegated sort, default tag and display density. The guided refill handoff sent order, ID format and already authorized drafting back to the owner. These are authored intervention counts, with no observed additional turns or rework.

The two independent AI reviewers matched on **44 of 48** dimension ratings. Three one-point differences concerned how much partial credit to give when an artifact covered one failure mode and perpetuated another. The fourth concerned how much credit to give for asking the one necessary retention question alongside three routine decisions. No difference changed a pair verdict. For the scored run, make those partial-credit rules explicit before freezing new cases. Keep the objective policy checks as a fast gate, with evidence-backed independent review for prose coherence, judgment and supervision. Six deliberately constructed pairs leave human calibration, real task coverage and repeat variability open. [Reviewer A](scores/reviewer-a.json) · [Reviewer B](scores/reviewer-b.json)

## Blinding and rerun

The six-case manifest, rubric and objective checker were committed at `505d0bfc32aebdc0b1d46f0dfb25473248ba5538`. A seeded permutation randomized case order and the opaque artifact positions, with three on artifacts in each position. The blind packet commitment was recorded at `d88b0c571511eb96459e21108c81bb5250bbe0bd`. Reviewers were given only the case manifest, rubric and blind packet, in independent fresh sessions. Neither reported an explicit arm cue. Reviewer A reported that three pairs shared identical policy appendices and that their prose differed in tests and owner questions. The objective result and both reviews were committed at `01daf4e49b0931db672beaad192edfd78c2eea0f`. The seed and arm assignments were recorded after that score seal. [Packet commitment](packet-seal.json) · [Score seal](score-seal.json)

Run with Node 22.23.5 from this evidence directory. The commands print the objective execution, verified commitment and decoded summary. For a new blind review share only the three frozen reviewer inputs. Keep the objective output, other reviewers’ scores and reveal file with the custodian until the score seal.

```text
node objective.mjs cases.json packet.json
node blind.mjs verify cases.json packet.json packet-seal.json reveal.json
node aggregate.mjs cases.json packet.json scores/objective.json scores/reviewer-a.json scores/reviewer-b.json reveal.json
```

## Owner decisions and 4R exit

The budget proposal sets a two-point material margin, zero hard-gate violations, zero extra foreground model calls and at most one scoped approval read. It proposes up to 512 added model-interface prompt bytes on eligible requests and a separate 512-byte ceiling on the serialized lookup result. The observed maxima were 364 and 441 bytes, respectively, in the 115 Q4-009 pairs. The local whole-turn latency results changed direction in the independent reverse-order short run. The long candidate also had one additional superseded Observe attempt, with its cause unresolved. Provider tokens, cache, hosted latency, egress and live cost remain unmeasured. The measurement table records the scope, sample size, rationale and owner decision for each target. [Budget decision table](budgets.md)

Take forward authority-checked original source membership, governed publication recovery and one current approved instruction block before Desk. Begin 4I preparation by pinning the current voice as the control and assembling the frozen legacy and eight-movement voices for a matched owner audition. Hold voice fixed when comparing learning policy. Radzi’s felt judgment determines identity. The scored 4A holdout follows an agreed budget, case mix, repeats and fresh evaluator checks. [4R route and smallest 4I handoff](route-and-handoff.md)
