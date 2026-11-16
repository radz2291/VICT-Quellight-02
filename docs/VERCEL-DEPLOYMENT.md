# Vercel foundation deployment

Deployed and exercised on 16 November 2026. This is an honest, protected **foundation preview**, not the usable personal companion. Conversation, app-owner identity, database persistence, automatic memory and model execution remain unavailable.

## Exact deployed candidate

- Project: `quellight`, `prj_tcqb8vUdK535B2uCppRSbVFZipMK`, under the verified active Hobby team; no trial or plan change.
- Deployment: `dpl_5nwgRcjdb7aT5hav2mdh8ip7NfAG`, status `READY`, reported target `production` (Vercel assigned the first deployment to production).
- Stable platform URL: <https://quellight.vercel.app>.
- Immutable URL: <https://quellight-2926yxsw1-radziamin91-gmailcoms-projects.vercel.app>.
- Node 22.x, function region Singapore (`sin1`), 30-second foundation limit, Fluid Compute. The hosted Node patch version was not independently measured.
- Actual cloud build used the locked 300-package installation, six verified VICT archives, `@sveltejs/adapter-vercel@6.3.5`, and `npm run build:vercel`. Vercel's remote builder reported CLI 65.15.0 and completed in 49 seconds. The invoking local CLI was 54.16.0.
- [Independent source/artifact review](VERCEL-INDEPENDENT-REVIEW.md) passed before upload. The [29 uploaded source files](../evidence/vercel-upload-verified.json) all match local SHA-1 content identities returned by Vercel's source-file API. The upload excludes environment files, engineering records, tests and local outputs. API deployment `public` is false.
- Exact application/package inputs remain in [the candidate manifest](../evidence/vercel-candidate-inputs.json), [builder evidence](../evidence/vercel-build.json) and [independent evidence](../evidence/vercel-independent-review.json). No VICT archive was replaced for this deployment.

## Access and privacy

All deployments require Vercel Authentication, including production domains. The project-only **Improve models with this project's data** choice was disabled, saved and verified unchecked after reload before source upload. Team preferences and other projects were not changed. [Saved UI evidence](../evidence/browser/vercel-project-privacy.jpg).

The initial settings render briefly showed an incorrect pre-hydration disabled-team message. It was rejected when the API disagreed; the fully loaded checked project control was then changed and verified. This failure is retained so future checks do not rely on the initial placeholder state.

CLI linking generated an ignored local OIDC value; the CLI also generated its standard project-scoped deployment-protection bypass credential for authenticated diagnostic requests. Values were never printed or copied into application source. Anonymous access remains blocked. Vercel access is an outer preview gate, not a substitute for a verified Quellight owner mapped into VICT authorization.

## Live observations

| Check | Actual result |
| --- | --- |
| Anonymous `/`, `/healthz`, `/readyz` on stable and immutable URLs | All six requests redirected to authentication (302); no foundation content exposed |
| Authenticated `GET /healthz` | 200, `status=ok`, `mode=foundation` |
| Authenticated `GET /readyz` | 503, `FOUNDATION_ONLY`; storage, agent execution and app-owner authentication all false |
| Authenticated `HEAD /healthz` over real HTTP | 200, zero downloaded body bytes; resolves the local Fetch-level HEAD observation |
| Authenticated `/missing-page` | 404 with the ready-made VICT recovery page |
| Foreign-origin form POST | 403 |
| Owner browser on hosted URL | Actual VICT foundation renders after existing Vercel sign-in |
| Desktop viewport | 1366 × 900; document/scroll width both 1366 |
| Phone-width viewport | 390 × 844; scroll width 390, no horizontal overflow |
| Hydrated controls | Synthetic page-local draft accepts text; Send stays disabled; appearance switch changes and restores; draft cleared afterwards |

[Desktop capture](../evidence/browser/vercel-desktop.jpg) and [phone-width capture](../evidence/browser/vercel-phone.jpg) are from the real deployed page. They are browser viewport checks, not a claim that a physical phone was tested. The live browser tab was retained as a deliverable.

The CLI's `curl` command initially forwarded a trailing global `--scope` flag to curl and failed before a request. Using the already-linked project context resolved that tool invocation. This is separate from the successful HTTP observations.

## Continuation

The owner-approved **[quellight.com](https://quellight.com)** is connected, with `www` redirecting there. DNS, TLS, anonymous protection and the signed-in browser redirect/render were verified. Exact wiring is tracked separately in [DOMAIN.md](DOMAIN.md) and [the domain record](../deploy/domain.json). Existing Cloudflare tunnel and Worker subdomains were preserved. [Custom-domain browser capture](../evidence/browser/quellight-domain.jpg).

The [separate reusable VICT extension](../../docs/tasks/VICT-VERCEL-EXTENSION.md) is implementing and testing public PostgreSQL storage, coordination/fencing and a bounded host profile. Its contracts serve other apps too. Quellight's domain rules remain in the app. Do not enable a live runtime through environment flags or treat this deployment as Phase 0 completion. Free inference eligibility, owner mapping, hosted lifecycle/restore and automatic browser-closed work still require their actual proofs.
