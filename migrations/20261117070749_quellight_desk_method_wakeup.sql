-- Extend the existing free private wakeup to Desk method jobs. No destination or cadence change.
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
  IF NOT EXISTS (SELECT 1 FROM quellight_product_v1.memory_jobs WHERE
      (state IN ('queued','retryable') AND wake_after<=now()) OR (state='running' AND claim_expires<=now()))
    AND NOT EXISTS (SELECT 1 FROM quellight_product_v1.desk_method_jobs WHERE
      (state IN ('queued','retryable') AND wake_after<=now()) OR (state='running' AND claim_expires<=now()))
    AND NOT EXISTS (SELECT 1 FROM quellight_product_v1.memory_care_commands WHERE state IN ('pending','retryable')
      AND wake_after<=now() AND (claim_expires IS NULL OR claim_expires<=now())) THEN
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
