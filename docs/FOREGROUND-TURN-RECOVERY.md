# Foreground turn recovery

The existing one-minute Supabase cron can wake a lone queued or running conversation after its indexed lease expires, even when Memory, Desk and Care have no work. The signed worker finds eligible turns for its configured owner before limiting a batch to sixteen. Settlement uses the existing conversation lease acquisition and fenced write. It preserves committed text in sequence and honors a recorded Stop intent.

Both selectors use the private invoker view defined by the [migration](../migrations/20261126121901_quellight_foreground_turn_wakeup.sql). Live leases, deleted scopes and mismatched actors are excluded. A missing or released scope remains eligible so the fenced reconciler can handle an incomplete admission. The selectors reuse the existing partial index over active turns. Streamed fragments can continue updating the product row without maintaining an index on its activity timestamp.

The delivery configuration's optional `owner_actor_id` narrows all four due-work checks to the same owner subject that the deployment uses. A null value keeps the previous delivery scope. When configuring an isolated test, use the verified synthetic owner in both the Preview and the database. The database still uses the existing Vault secret names, pg_net payload, delivery receipt and cron cadence. The database operator owns destination and enablement.

## Apply or roll back

1. Verify the exact source and archives with `node scripts/verify-baseline.mjs --installed`. Verify the target deployment owner, database schema version, installed indexed namespace and writer epoch. Inspect the current private wake function, configuration and job before a change.
2. Apply the migration in one transaction as the authorized database operator. The new application uses its view on scheduled delivery, so apply the database change before routing wakes to the new app. The previous application can run while the new view is installed. Check the view and role permissions, then point the existing signed delivery at the qualified application.
3. For rollback, pause dispatch and drain in-flight work. Switch the application back to the known-good source while preserving indexed data and the writer fence. Restore prior delivery configuration, then run the [rollback SQL](../deploy/rollback/quellight-foreground-turn-wakeup.sql) in one transaction. Verify the original function, grants, cadence and applicable maintenance dispatch before reopening. The rollback removes the view and optional owner field. It retains transcript, event, queue and delivery history.

The 2026-11-26 repair keeps the configured 300-second host lease and the existing cadence. The lease and next scheduled tick are distinct intervals. A signed HTTP 202 acknowledges receipt. Check the terminal product row and ordered fragments to establish recovery.
