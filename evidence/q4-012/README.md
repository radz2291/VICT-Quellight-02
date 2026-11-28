# Q4-012 · Quellight live voice audition

The audition uses the current Quellight voice, the frozen legacy voice and the eight-movement voice pinned in Q4-011. All seven fictional cases use the original installed Quellight route with `quellight.glm-flash@1`, Z.AI GLM-5.3-Flash, app generation defaults and completion-or-cancellation behavior. The source archives, model inputs, replies, checkpoints and reveal key live in the owner’s private local workspace. [Q4-011 source pins](../q4-011/capture.json) · [Reproduction and continuation](method.md)

## Results

| Measure | Observed result |
| --- | ---: |
| Settled final replies | 42 of 42 |
| Matched first-input trios | 14 of 14 |
| Matched non-room input comparisons across passes | 7 of 7 |
| Requests for the finished comparisons | 55 |
| Additional model steps in the finished comparisons | 13 across 10 replies |
| Total development requests, including preflight and the failed attempt | 58 |
| Reported input tokens on the 55 comparison requests | 340,198 |
| Reported output tokens on the 55 comparison requests | 73,858 |

All 58 requests received HTTP 200. Usage in the finished comparisons was available for all 55 requests, totaling 414,056 tokens. Z.AI also reported 30,912 cached-input tokens and 64,475 reasoning tokens within those totals. The separate cancelled attempt reported 7,679 tokens. The two preflight requests have no retained usage counts. The evidence lists model-selected tool results and the provider settings digest. [Sanitized results and token accounting](results.json)

## How the comparison stayed matched

Each final reply began in a separate PostgreSQL copy of one application seed. That preserved the room, Desk item and revision, ordinary Working Memory, grant policy and current native authority while containing model-selected tool effects. The approved pass used the same scoped room block for every voice. The correction case used the same fixed precursor exchange. The comparator checked actual first model inputs before sending requests and recomputed each persisted VICT instructions revision. It normalized the same three fresh-thread fields as Q4-011. [Installed runner](run.mjs) · [Comparison audit](check-readings.mjs)

The preflight established that the route worked and that a live model can change the Desk. It made two successful requests and produced a settled reply. The runner’s initial single read had missed the later stream pages. The matched run consumes the stream cursor to full projection and restores the seed for every trial. The preflight is outside the matched tally. [State isolation and reproduction](method.md)

One approved-context reserved-choice attempt received HTTP 200 and token usage, then the app settled it as cancelled with `CONVERSATION_UNAVAILABLE`. The underlying cause remains unresolved. The bounded retry used the same seed and matched first input and produced the replacement reply in the owner packet. The other 37 completed replies were preserved during restart. [Attempt and replacement evidence](results.json)

## Owner reading

The review packet retains Q4-011’s sealed order. It presents the empty-room cases before the same cases with approved room context. All three approved-room practical archives reopened through the installed app service, with the original settled reply and eligible room approval present. Radzi can choose an opaque code and continue that saved conversation in his own words. His first impressions and speaking-identity choice are pending. The fixed-speaking-voice learning-policy comparison remains follow-up work. [Frozen cases](../q4-011/scenarios.json) · [Sealed reading order](../q4-011/blind-order.json) · [Continuation restore checks](continuations.json)
