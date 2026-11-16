# Quellight hostname

The owner approved `quellight.com` for Quellight, using the apex as the primary address and `www.quellight.com` as a permanent redirect. This is app-owned hostname configuration; the reusable VICT extension contains no Quellight domain or branding.

## Current result

On 16 November 2026, both names were attached to the exact Quellight Vercel project `prj_tcqb8vUdK535B2uCppRSbVFZipMK`, in Hobby team `radziamin91-gmailcoms-projects`. The existing production deployment is `dpl_5nwgRcjdb7aT5hav2mdh8ip7NfAG`.

The apex serves the app. The supported project-domain fields set `www.quellight.com` to `redirect: quellight.com` and `redirectStatusCode: 308`. Both domain attachment responses returned `verified: true` with no ownership TXT challenge. Initial configuration checks reported both names as misconfigured while awaiting DNS; subsequent DNS, TLS and anonymous-access checks passed as recorded below.

The Vercel-side agent used the public `POST /v10/projects/{idOrName}/domains` endpoint after inspecting its current OpenAPI schema. Its redirect field takes a destination hostname. [Add-project-domain API](https://vercel.com/docs/rest-api/projects/add-a-domain-to-a-project)

## Exact DNS handoff

The authenticated, project-scoped configuration API returned these preferred rank-1 targets for this account:

| Type | Cloudflare name | Target | Proxy |
| --- | --- | --- | --- |
| A | `@` | `216.198.79.1` | DNS only |
| CNAME | `www` | `40425edb6e98f062.vercel-dns-017.com` | DNS only |

The alternative preferred A address is `64.29.17.1`; Vercel documents that one recommended IP is acceptable. These values came from the actual project-domain configuration response, not generic setup examples. No TXT ownership record was requested. [Domain-configuration API](https://vercel.com/docs/rest-api/domains/get-a-domain-s-configuration)

The root orchestrator saved those two Cloudflare records with DNS-only routing and TTL Auto, then reloaded the dashboard and verified all eight records: the two new records plus six unchanged originals. Independent public DNS queries resolved both exact targets. Authoritative nameservers remained `malavika.ns.cloudflare.com` and `yew.ns.cloudflare.com` before and after. [Cloudflare evidence](../evidence/browser/cloudflare-dns.jpg). The Vercel-side agent did not change Cloudflare records or nameservers.

## Verification

At 12:42 UTC, fresh HTTPS requests with normal certificate and hostname verification succeeded for both names. The apex certificate identifies `quellight.com`; the www certificate identifies `www.quellight.com`. Both expire in February 2027. No certificate-verification bypass was used.

Both anonymous GETs returned **302 to Vercel's `/sso-api`**, demonstrating that authentication protects the custom names. Vercel Authentication runs before the configured www redirect. Therefore this is not a claim that an anonymous request observed 308.

The **root orchestrator's authenticated browser check passed**: navigating to `https://www.quellight.com` ended at `https://quellight.com/`, showing the hydrated Quellight foundation, disabled Send and the expected ready-made VICT controls. [Owner browser evidence](../evidence/browser/quellight-domain.jpg). This confirms the owner redirect journey; its HTTP status was not separately captured in the browser, while the project-domain API confirms the configured 308.

Fresh project-scoped configuration checks then returned `misconfigured: false` for both names, `configuredBy: A` for the apex and `configuredBy: CNAME` for www. Both accepted the `http-01` certificate challenge. The www attachment still reports the requested apex redirect and status 308. Exact DNS answers, certificate fingerprints and sanitized HTTP results are retained in the machine record; no cookies or authentication nonce values were stored.

Project Vercel Authentication remains `all`; no protection, team preference or other project was changed. The app is still a foundation preview with sending disabled and no private conversation data. A working hostname does not make its product runtime ready.

The hostname is **connected and verified**. Machine-readable facts and attribution are in [domain.json](../deploy/domain.json). This step added no paid service and purchased no domain.
