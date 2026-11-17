-- Product scheduling and public-source provenance; native learned memory remains VICT/Mastra-owned.
ALTER TABLE quellight_product_v1.conversation_turns ADD COLUMN IF NOT EXISTS memory_configuration jsonb;
ALTER TABLE quellight_product_v1.conversation_turns ADD COLUMN IF NOT EXISTS memory_authority_revision text;
CREATE TABLE IF NOT EXISTS quellight_product_v1.memory_jobs (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('observe','reflect','purge')),
  job_key text NOT NULL CHECK(job_key ~ '^[a-f0-9]{64}$'),
  source_revision text NOT NULL,
  configuration_revision text NOT NULL,
  configuration jsonb NOT NULL CHECK(jsonb_typeof(configuration)='object'),
  authority_revision text NOT NULL,
  supersedes_job_id uuid REFERENCES quellight_product_v1.memory_jobs(id),
  state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','retryable','completed','superseded','blocked')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  wake_after timestamptz NOT NULL DEFAULT now(),
  claim_token uuid,
  claim_expires timestamptz,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(conversation_id,actor_id) REFERENCES quellight_product_v1.conversations(id,actor_id),
  UNIQUE(actor_id,job_key),
  CHECK((state='running' AND claim_token IS NOT NULL AND claim_expires IS NOT NULL)
     OR (state<>'running' AND claim_token IS NULL AND claim_expires IS NULL))
);
CREATE INDEX memory_jobs_due ON quellight_product_v1.memory_jobs(wake_after,created_at,id)
  WHERE state IN ('queued','retryable');
CREATE INDEX memory_jobs_abandoned ON quellight_product_v1.memory_jobs(claim_expires,id) WHERE state='running';
CREATE INDEX memory_jobs_conversation ON quellight_product_v1.memory_jobs(actor_id,conversation_id,created_at DESC,id);
CREATE TABLE IF NOT EXISTS quellight_product_v1.memory_job_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES quellight_product_v1.memory_jobs(id),
  state text NOT NULL CHECK(state IN ('queued','running','retryable','completed','superseded','blocked')),
  code text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX memory_job_events_job ON quellight_product_v1.memory_job_events(job_id,at,id);
CREATE TABLE IF NOT EXISTS quellight_product_v1.memory_imports (
  actor_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  schema_name text NOT NULL,
  source_revision text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,conversation_id,schema_name),
  FOREIGN KEY(conversation_id,actor_id) REFERENCES quellight_product_v1.conversations(id,actor_id)
);
ALTER TABLE quellight_product_v1.memory_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quellight_product_v1.memory_job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE quellight_product_v1.memory_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quellight_product_v1.memory_jobs,quellight_product_v1.memory_job_events,quellight_product_v1.memory_imports FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON quellight_product_v1.memory_jobs,quellight_product_v1.memory_imports TO ql_app_runtime;
GRANT SELECT,INSERT ON quellight_product_v1.memory_job_events TO ql_app_runtime;
GRANT USAGE,SELECT ON SEQUENCE quellight_product_v1.memory_job_events_id_seq TO ql_app_runtime;
CREATE POLICY memory_jobs_runtime ON quellight_product_v1.memory_jobs TO ql_app_runtime USING(true) WITH CHECK(true);
CREATE POLICY memory_job_events_runtime ON quellight_product_v1.memory_job_events TO ql_app_runtime USING(true) WITH CHECK(true);
CREATE POLICY memory_imports_runtime ON quellight_product_v1.memory_imports TO ql_app_runtime USING(true) WITH CHECK(true);
-- Every runtime write uses the caller's VICT fenced transaction; browser roles have no grants.
