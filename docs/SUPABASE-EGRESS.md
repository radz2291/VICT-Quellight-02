# Supabase egress from Quellight reply checks

**Status as of 22 November 2026:** The Phase 3 VICT Postgres adapter reads the full operational snapshot for individual lookups. Quellight can make several of those lookups while displaying one reply. This creates avoidable database traffic and can add wait time when requests compete for the same row.

## What we observed

| Observation | What it measures |
| --- | --- |
| 22.33 GB used against a 5 GB allowance | Egress shown in the Supabase organization dashboard across three projects. Quellight’s share is unknown. |
| 32,137 snapshot reads | Calls to the full-snapshot query observed in Quellight’s database during the investigation. |
| 1.56 MB | The snapshot size at inspection. The average size across those reads is unknown. |

The dashboard also showed a grace-period warning for the previous billing cycle. Quellight was created after that cycle ended. The query count and snapshot size explain how Quellight could contribute to the later usage spike. Actual bytes billed to Quellight require the project-level breakdown. [Supabase egress documentation](https://supabase.com/docs/guides/platform/manage-your-usage/egress)

## How one reply generates repeated reads

1. While a reply is running, the browser asks for updates after the last event it saw. [Browser reply observer](../src/routes/%2Bpage.svelte#L453-L471)
2. The server checks the actor and reads VICT stream events and the current turn status. The reply worker also checks for Stop approximately every 500 ms while the turn is active. [Reply updates](../src/lib/server/conversation/service.ts#L362-L379) · [Stop check](../src/lib/server/conversation/service.ts#L299-L307)
3. Quellight connects through `@victframework/store-postgres`. The pinned adapter reads the `snapshot` JSONB column from `quellight_ops_v1.operational` using `SELECT … FOR UPDATE`. It loads the whole namespace bundle before handling the individual request. The bundle includes turn state, tool invocation records and stream events. Chat history and Desk items have separate storage. [Store setup](../src/lib/server/db/index.ts#L1-L8) · [Pinned archive and checksum](../baseline.json#L97-L101)
4. Supabase sends the full bundle back on each read. The same row lock also makes concurrent snapshot operations wait for one another. That can delay when a reply update reaches the screen. Live timing has yet to establish how much of the observed slowness comes from this path. [PostgreSQL row-level locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)

To inspect the exact package code used by the app, open `package/dist/adapter.js` around line 204 and `package/dist/driver.js` around line 218 inside the [pinned Postgres archive](../packs/victframework-store-postgres-0.4.0-rc.1.tgz). The local Floorplan shows the same sequence under **Flows → Why one reply check pulls the whole snapshot**.

## What to verify before shipping a fix

Measure snapshot calls and bytes per turn, time to first visible text, and lock waits with a synthetic workload. Then qualify a VICT storage path that can read the active actor, turn, cancellation flag and recent stream events without transferring the whole bundle for each lookup. Check that cancellation, authorization, reconnect, retries and recorded effects still behave correctly. Compare the hosted measurements and confirm Quellight’s own egress in the Supabase project breakdown.
