-- Select pending product turns without a live conversation lease. The worker
-- still has to acquire the indexed fence before settling any turn.
-- Reuse the existing partial conversation_turn_active index.
CREATE VIEW quellight_product_v1.recoverable_conversation_turns
WITH (security_invoker = true) AS
SELECT t.actor_id, t.conversation_id, t.updated_at
FROM quellight_product_v1.conversation_turns t
LEFT JOIN quellight_ops_v1.coordination lease
  ON lease.namespace = 'quellight-v1'
  AND lease.scope_id = 'quellight:conversation:' || t.conversation_id::text
WHERE t.execution_state IN ('queued','running')
  AND (
    lease.scope_id IS NULL
    OR (
      lease.actor_id = t.actor_id::text AND NOT lease.deleted
      AND (lease.owner_id IS NULL OR lease.expires_at <= statement_timestamp())
    )
  );
REVOKE ALL ON quellight_product_v1.recoverable_conversation_turns FROM PUBLIC,anon,authenticated;
GRANT SELECT ON quellight_product_v1.recoverable_conversation_turns TO ql_app_runtime;

-- A configured scope matches the signed worker's owner. NULL retains the
-- existing delivery scope and requires no configuration update on adoption.
ALTER TABLE quellight_product_v1.memory_delivery_configuration ADD COLUMN owner_actor_id uuid;

CREATE OR REPLACE FUNCTION quellight_product_v1.wake_memory_worker() RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  configuration quellight_product_v1.memory_delivery_configuration;
  machine_secret text;
  bypass_secret text;
  headers jsonb;
  request_id bigint;
BEGIN
  SELECT * INTO configuration FROM quellight_product_v1.memory_delivery_configuration WHERE singleton AND enabled;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM quellight_product_v1.memory_jobs j WHERE
      ((j.state IN ('queued','retryable') AND j.wake_after<=now()) OR (j.state='running' AND j.claim_expires<=now()))
      AND (configuration.owner_actor_id IS NULL OR j.actor_id=configuration.owner_actor_id))
    AND NOT EXISTS (SELECT 1 FROM quellight_product_v1.desk_method_jobs j WHERE
      ((j.state IN ('queued','retryable') AND j.wake_after<=now()) OR (j.state='running' AND j.claim_expires<=now()))
      AND (configuration.owner_actor_id IS NULL OR j.actor_id=configuration.owner_actor_id))
    AND NOT EXISTS (SELECT 1 FROM quellight_product_v1.memory_care_commands c WHERE c.state IN ('pending','retryable')
      AND c.wake_after<=now() AND (c.claim_expires IS NULL OR c.claim_expires<=now())
      AND (configuration.owner_actor_id IS NULL OR c.actor_id=configuration.owner_actor_id))
    AND NOT EXISTS (SELECT 1 FROM quellight_product_v1.recoverable_conversation_turns t
      WHERE configuration.owner_actor_id IS NULL OR t.actor_id=configuration.owner_actor_id) THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO machine_secret FROM vault.decrypted_secrets WHERE name='quellight_memory_dispatch';
  IF machine_secret IS NULL OR length(machine_secret)<32 THEN RETURN NULL; END IF;
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || machine_secret);
  IF configuration.origin <> 'https://quellight.com' THEN
    SELECT decrypted_secret INTO bypass_secret FROM vault.decrypted_secrets WHERE name='quellight_memory_preview_bypass';
    IF bypass_secret IS NULL THEN RETURN NULL; END IF;
    headers := headers || jsonb_build_object('x-vercel-protection-bypass',bypass_secret);
  END IF;
  request_id := net.http_post(url:=configuration.origin || '/api/internal/memory/wake',body:='{}'::jsonb,
    headers:=headers,timeout_milliseconds:=configuration.delivery_timeout_ms);
  INSERT INTO quellight_product_v1.memory_deliveries(request_id) VALUES(request_id);
  RETURN request_id;
END;
$$;
REVOKE ALL ON FUNCTION quellight_product_v1.wake_memory_worker() FROM PUBLIC,anon,authenticated,ql_app_runtime;
GRANT EXECUTE ON FUNCTION quellight_product_v1.wake_memory_worker() TO postgres;
