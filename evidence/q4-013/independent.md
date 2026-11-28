# Q4-013 independent correction and scope audit

The corrected guidance reached the model in both fresh same-room turns. All other-room requests omitted it. One same-room reply assigned Mira's role to the user despite receiving the correct guidance, so this establishes delivery and scope with a remaining reply-grounding issue.

## Source and learning

I recorded the expected claims and uncertainty from the frozen case before reading model outputs. The case SHA-256 is `ef7a0fb5a19bcae012f204bedcabe121937c9f978dc3c64f286383640851e034`. The private source-only review SHA-256 is `f12e811efb9cd1ff3e18ada66dfb6f9e58d3d3a3fdc09965225a92896ed1a54b`.

| Claim | Source-only expectation | Independent observation |
| --- | --- | --- |
| Review and approval | U1 gives Mira a final look before circulation. U2 limits her role to wording and gives final approval to the speaking user for this packet. | Both before runs recorded the unsupported approval assignment suggested by the assistant as active in observations and working memory. Both after runs recorded the corrected roles. Earlier mentions served as correction history. |
| Draft identifier | U1 gives Cedar-47 on the draft cover. The correction leaves that fact in place. | Both arms retained the exact serial before and after correction. |
| Friday attendance | Both user originals leave vendor attendance undecided. | Both arms kept the decision open. Both estimated a calendar date absent from the frozen originals. The fixture approval omitted the estimate. |

I recomputed the evidence-page and request comparisons from four live native Observer captures. Within each cut the SDK inputs differed only by the exact conditioned append and numeric capture-time metadata. The actual outbound provider payloads differed only by that append. It contained the complete 30,489-byte selected speaking assembly once. Both arms used the same pinned Z.AI GLM-5.3-Flash profile. Each completed a single governed Observe publication. I recomputed all four native request digests and all four governed invocation argument digests from the scoped operation records. The paired after runs analyzed a fresh four-original cut with an empty native observation state at entry. The separate offline incremental persistence control reported the earlier error remaining in native observations alongside the correction at the same authority. I verified that its two input hashes match the exact live default-arm replies.

The two policy pins are `3e3fa7a54503d2f774c2f0bcb9d57978d8fe2966d186f857c6a5449c58acae68` for native-default and `3ffff14d03de6bcfe11a5661465ff9033a70bcba011b801923f8c1e02c7c8d04` for identity-conditioned Observe. Each conditioned request added 30,926 serialized provider-body bytes and 6,682 provider-reported prompt tokens. Prompt usage was 4,443 versus 11,125 before correction and 4,493 versus 11,175 after it. This one case supports keeping native-default Observe for 4A, with explicit claim and uncertainty validation before room approval.

## Fresh installed turns

The fixture approval projected three vetted fields from the after observations. I verified the supporting phrases against the eligible U1 and U2 originals and the corresponding persisted observations. The two arms approved the same block. The selected speaking assembly SHA-256 was `23adc723ab5a8d25dcc1371e2a70df248c4f6db1eb9c141df58f5c2ca8b77254`. I verified it once in the first system message of every SDK and provider request. Initial wire requests matched byte for byte between arms in each scope. All four same-room requests carried one approved block before Desk, and all five other-room requests carried no approved block, packet serial or Mira reference. I independently recomputed the four persisted instruction revisions and activation hashes from the captured inputs and manifests.

| Learning arm | Fresh room | Provider requests | Completed Desk write |
| --- | --- | ---: | --- |
| Native-default | Same | 2 | Append to the existing checklist |
| Native-default | Other | 3 | Create a generic checklist in that room |
| Conditioned | Same | 2 | Append to the existing checklist |
| Conditioned | Other | 2 | None |

The Desk receipt and wire argument audit places each completed write in its admitted room. Both append arguments preserved Mira’s wording check, the owner’s approval, the serial and the open decision. The other-room create contained neither the packet serial nor Mira. All four turns finished with vendor attendance unconfirmed, and no vendor confirmation invocation appears in their receipt lists.

The native-default same-room reply gave the correct third-person roles but its follow-up treated the addressee and owner ambiguously. The conditioned same-room reply called the user the wording reviewer and surfaced an internal fixture marker. The two arms sent identical initial inputs within each scope, so these reply and tool-path differences provide no causal estimate of Observer conditioning. The next room-delivery qualification should bind the speaking user explicitly to the approval role and check that internal revision metadata stays out of replies.

## Reproduce the private audit

Run Node 22.23.5 from this evidence directory. The command reads the private assembled-voice input and private captures. It emits digests, counts and selected numeric usage fields, and makes no model or database requests. Answer semantics were reviewed against the frozen source independently of the mechanical checks.

```sh
node independent-audit.mjs case.json decisions.json "$PRIVATE_ASSEMBLED_VOICES" "$PRIVATE_CAPTURE_DIR" delivery
```
