-- Free hosted delivery using the existing Supabase project. No model work runs in SQL.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

CREATE TABLE quellight_product_v1.memory_delivery_configuration (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  origin text NOT NULL CHECK(origin = 'https://quellight.com' OR origin ~ '^https://quellight-[a-z0-9-]+\.vercel\.app$'),
  delivery_timeout_ms integer NOT NULL DEFAULT 10000 CHECK(delivery_timeout_ms BETWEEN 1000 AND 60000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE quellight_product_v1.memory_deliveries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id bigint NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quellight_product_v1.memory_delivery_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE quellight_product_v1.memory_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quellight_product_v1.memory_delivery_configuration,quellight_product_v1.memory_deliveries FROM PUBLIC,anon,authenticated,ql_app_runtime;
-- The scheduler runs as postgres. No browser/application role may read credentials,
-- choose the destination, change cadence, or invoke this private function.
CREATE FUNCTION quellight_product_v1.wake_memory_worker() RETURNS bigint
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
INSERT INTO quellight_product_v1.memory_delivery_configuration(singleton,enabled,origin) VALUES(true,false,'https://quellight.com');
SELECT cron.schedule('quellight-memory-wake','* * * * *','SELECT quellight_product_v1.wake_memory_worker()');
-- Delivery timeout only covers receiving HTTP 202, never Observer/Reflector generation.
-- net requests are transport hints; logged memory_jobs and native journals own recovery.
