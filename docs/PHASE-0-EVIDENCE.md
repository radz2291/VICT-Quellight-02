# Phase 0 foundation evidence

16 November 2026. This record preserves the initial six-archive local foundation qualification. Subsequent twelve-archive adoption, hosted proofs and current Phase 0 status are recorded in [STATE.md](../STATE.md).

## Actual app candidate

SvelteKit 2.70.4, adapter-node 5.5.8, Svelte 5.57.0 and Vite 6.4.6 consume six exact public VICT archives through the app's lockfile. The source origins and archive digests are in [baseline.json](../baseline.json). Final installation and checks used Windows x64, Node 22.23.5 and npm 10.9.9. The app has no Git commit yet; [phase-0.json](../evidence/phase-0.json) hashes the tested files.

The app builder reported and retained these results:

| Check | Result |
| --- | --- |
| Clean `npm ci` | Passed |
| `npm run check` | Zero errors and zero warnings |
| `npm test` | 10/10 passed |
| `npm run verify:baseline` | Six archive digests and lock bindings matched |
| `npm run build` | Passed with Vite 6.4.6 |
| `npm run test:http` | Owned production child: health 200, readiness 503, server-rendered foundation, VICT 404 recovery, cross-origin POST rejected |
| `npm start` | Actual production Node server started at `http://127.0.0.1:4317` |

The first build's Vite 6.4.3 audit finding was repaired with compatible patch 6.4.6 and a clean install plus affected checks. The final audit reported 16 low findings in the remaining dependency closure; these are not a zero-vulnerability certification. The product has no forms/actions/auth endpoints yet. Review applicability again before adding those capabilities.

The broad public UI catalog yields a 1,636.58 KB main client entry (441.57 KB gzip) and 167.63 KB CSS. This is a known mobile performance concern. Narrower public exports or measured splitting should be investigated without importing private package paths. Build success alone does not resolve performance.

## Independent review and repairs

The `public_ui_proof` agent did not author the app. It independently inspected public imports, canonical @3 declarations, required styles and ControlScope, then challenged the running production app in Chromium 153. It verified disabled sends even after typing/Enter, no network mutations, draft retention when switching appearance, 390-pixel layout without overflow, truthful draft reset on reload, and VICT 404 recovery. No page errors or blocking findings remained in this foundation scope. The [review input hashes and result](../../qualification/public-ui/evidence/independent-app-review.json) were stable before and after the check. The orchestrator also inspected the actual rendered page in the Codex browser and retained the preview tab.

The `hosted_capability` agent independently found two app issues:

1. **P2, repaired:** the HTTP checker could accept an older server on a fixed port. It now uses an ephemeral port, waits for the spawned child's exact listener message and verifies that child stays alive. Independent occupied-port fault injection caused `EADDRINUSE` rejection before any request reached an impostor server; the ordinary owned-process path also passed.
2. **P3, repaired:** hosted-origin validation accepted private numeric addresses. It now rejects IP literals and local/internal hostname forms. The reviewer reran five runtime tests and seven direct negative cases; a valid Render hostname remained accepted.

Rechecked SHA-256: `config/runtime.mjs` = `b6169399b637945247c0eadf252df4849be95a0d1c1caec16da7f54cace4a81f`; `scripts/check-http.mjs` = `9049a9dedda17a5000a26d3fcc20f48cc814efecaad0903d9fcb2054df35d408`; `tests/runtime.test.mjs` = `57e1e62a99d37a3af99858c86721cc5ae0c86d4b698a5de90933d545925b7e40`.

## Separate consumer and cloud evidence

- [Installed public UI consumer](../../docs/phase-0/public-ui-proof.md): 16 exact archives, 11 deterministic checks, production build and desktop/phone-width browser proof. Its dispatcher is synthetic, not durable product persistence.
- [Installed runtime consumer](../../docs/phase-0/hosted-capability.md): seven exact archives, eight passing tests, real offline Mastra/tool execution, exact quiet-write policy, ownership/approval negatives, process termination/recovery, retention and deletion fences. The model and domain effects are fixtures; no live provider call occurred.
- [Hosted setup](HOSTING.md): a separate free Supabase Quellight project was created, reports healthy and passed a read-only management TLS query. No product schema, application connection or ARA import exists. Render and Docker execution remain unverified.

These evidence categories must not be added together and labeled a hosted app verdict. There is no phone-accessible private Quellight URL, working conversation, durable product memory or owner acceptance yet.
