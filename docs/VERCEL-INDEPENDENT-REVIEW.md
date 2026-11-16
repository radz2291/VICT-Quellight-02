# Independent Vercel foundation review

Reviewed on 16 November 2026 by the separately delegated `quellight_vercel_review` agent. **PASS for the foundation candidate and locally generated Vercel function.** This is not acceptance of a deployed personal companion, owner authentication, hosted PostgreSQL, automatic memory or live model execution.

## Exact scope

The app is still an uncommitted repository, so the verdict identifies source bytes rather than a Git SHA. The complete independently checked input manifest and results are in [vercel-independent-review.json](../evidence/vercel-independent-review.json). Principal hashes:

| Input | SHA-256 |
| --- | --- |
| `package.json` | `d179c8c4888e6813e025e0c68e64be74848f8974c3dcccb8419f92e1a111a5ae` |
| `package-lock.json` | `c19d455cd3559287d28bd45ce05e5f194a7b606c2e698f2deb03a2c7b81cefe1` |
| `svelte.config.js` | `342a623c44bab8d3a08f6f902e8e9d3607fb7ab69f3336c0bd2e90852762c876` |
| `config/runtime.mjs` | `f7657533aac7d1b74d3669cb3c6431bb78495fcf726d774fa8cbc526576b3ef0` |
| `src/hooks.server.ts` | `13761f552c3f605a06aff79d70c8bc125c87fed7da35cb4dbc7994494dd889db` |
| Generated Build Output API config | `6cd7462a2141233d6d80829eb26038ea435eb8adc9d3b7378bd0299a8222fa2e` |
| Generated function config | `87257011bad0b7292723d9bc3f2e77fe756585335cdff45294ee21b3a2678e57` |

The builder's isolated Ubuntu 24.04 artifact is at `/root/quellight-vercel-proof-20261116-1b2az8/app`, with its own Node 22.23.5. The reviewer independently imported and exercised that output after relocation. All 26 compared build/runtime/source files match the Windows candidate. The Linux copy omits only `.env.example`, `.gitignore` and `.vercelignore`; those are reviewed separately and are not compilation inputs. Both the exact source comparison and the unchanged prior UI source are recorded in the evidence.

## Independent checks

- Ran all 12 existing application/runtime tests with the portable Windows Node 22.23.5: 12 passed, none skipped or failed. The initial VICT UI module load took most of the 143.6-second run.
- Recomputed the six VICT archive digests and their lockfile bindings. No framework archive was replaced by the hosting change.
- Challenged eight additional runtime configurations, including numeric/hex loopback hosts, a trailing-dot localhost, an internal Vercel hostname, credentials/path in origins, local mode on Vercel and production mode. All reject. Three unsupported enable flags leave storage, execution and owner authentication false.
- Invoked the actual build script with three invalid selections: Node target under `VERCEL=1`, extra arguments and an unsupported target. All reject before entering a build. The Vercel path is explicit; the Node path remains available.
- Imported the relocated generated Fetch handler and checked health 200, readiness 503, `no-store` headers, all three false readiness capabilities, honest foundation SSR and disabled controls.
- Posted synthetic requests to absent chat, memory and scheduled-work routes: all return 404. A same-origin attempted send returns 405 because no action exists. This verifies that UI state is not the only protection against accidental product execution.
- Launched four separate generated-function cold starts with an HTTP origin, a credential-bearing Vercel hostname, an IP hostname and production mode: all reject during initialization.
- Inspected the actual Build Output API v3 output: one Node 22 function, Singapore, 30-second limit and relative route aliases. Scanned 182 file/alias entries; no environment file or supplied private build canary was found. The sorted output manifest digest is recorded in the machine evidence.
- Matched all nine pre-existing `src/` file hashes against the earlier Phase 0 evidence. Canonical UI composition, required VICT styles, `ControlScope`, transcript/composer and error controls remain unchanged. No non-VICT control was added.

## Findings and repairs

**Resolved input drift:** a Vercel CLI link appended `.vercel` and `.env*` to `.gitignore` after the builder's input manifest was recorded. Besides changing the hash, the final `.env*` overrode the existing `.env.example` exception. The reviewer reported this to the root and builder without editing implementation. The builder removed the redundant additions and refreshed the manifest. The original expected `.gitignore` hash (`9ffaeb9bdfbdcc487286c2d66f11dc6070a23b68dacb9d285577086e93267157`) is restored. This was evidence/ignore-policy drift, not a product-runtime failure.

**Preserved failed probe:** the first independent generated-handler probe incorrectly expected an empty body from the in-process Fetch `Response` for `HEAD /healthz`. The direct response contains 61 bytes. This call does not exercise HTTP transport normalization. The corrected local probe records the observation and checks status without claiming HTTP wire semantics; the remaining checks pass. The actual hosted HTTP verification should check HEAD behavior separately. No application change was requested for this observation.

**Windows limitation:** the builder's direct Windows adapter build reached compilation but failed to create required route symlinks (`EPERM`). Its incomplete output is not a passing artifact. The qualified generated output came from a clean Linux install/build. The reviewer exercised that real output rather than treating the Windows attempt as success.

## Evidence boundaries and next action

The builder independently reports clean Linux installation, typecheck, the successful Linux Vercel build, eight generated-handler probes, and the preserved Windows Node build/owned-process HTTP regression. Those builder results remain attributed to the builder; the checks above are this reviewer's work. The reviewer did not rebuild shared output, modify implementation, provision cloud resources, access secrets or call a model.

The source-upload filter excludes environment files, Git metadata, engineering docs/evidence/deployment records and local outputs while retaining the lock, six archives, baseline verifier and compilation inputs. Its intent and inputs were inspected; an actual CLI upload manifest and hosted build remain separate platform evidence.

Proceed with the protected, free Vercel foundation deployment and real HTTP checks. Verify anonymous protection, authenticated rendering, health/readiness, error handling and HEAD transport behavior on that deployment. Keep product readiness false. PostgreSQL/coordination qualification belongs to the separate reusable VICT extension; app owner mapping, free inference eligibility and phone/laptop personal-data journeys remain outstanding.
