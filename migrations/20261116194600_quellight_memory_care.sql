-- Owner-authored memory commands are durable across browser and worker loss.
-- Native learned content and source authority remain in VICT/Mastra's private schema.
CREATE TABLE quellight_product_v1.memory_care_commands (
  actor_id uuid NOT NULL,
  command_key text NOT NULL,
  conversation_id uuid NOT NULL,
  action_id text NOT NULL CHECK(action_id IN ('memory.correct','memory.forget','memory.resume','memory.retry')),
  argument_digest text NOT NULL CHECK(argument_digest ~ '^[a-f0-9]{64}$'),
  input jsonb NOT NULL CHECK(jsonb_typeof(input)='object'),
  effective jsonb NOT NULL CHECK(jsonb_typeof(effective)='object'),
  authority_input jsonb,
  native_operation_id text,
  expected_authority_revision text NOT NULL,
  intended_authority_revision text NOT NULL,
  state text NOT NULL CHECK(state IN ('pending','retryable','applied','blocked')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  claim_token text,
  claim_expires timestamptz,
  wake_after timestamptz NOT NULL DEFAULT now(),
  failure_code text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,command_key),
  FOREIGN KEY(conversation_id,actor_id) REFERENCES quellight_product_v1.conversations(id,actor_id),
  CHECK((claim_token IS NULL)=(claim_expires IS NULL)),
  CHECK((state='applied' AND result IS NOT NULL) OR state<>'applied')
);
CREATE UNIQUE INDEX memory_care_one_unfinished_owner ON quellight_product_v1.memory_care_commands(actor_id)
  WHERE state IN ('pending','retryable','blocked');
CREATE INDEX memory_care_due ON quellight_product_v1.memory_care_commands(wake_after,created_at)
  WHERE state IN ('pending','retryable');
CREATE INDEX memory_care_conversation ON quellight_product_v1.memory_care_commands(actor_id,conversation_id,created_at DESC);
CREATE TABLE quellight_product_v1.memory_care_attempts (
  attempt_id text PRIMARY KEY,
  actor_id uuid NOT NULL,
  command_key text NOT NULL,
  state text NOT NULL CHECK(state IN ('started','completed','failed')),
  failure_code text,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  settled_at timestamptz,
  FOREIGN KEY(actor_id,command_key) REFERENCES quellight_product_v1.memory_care_commands(actor_id,command_key)
);
ALTER TABLE quellight_product_v1.memory_care_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE quellight_product_v1.memory_care_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quellight_product_v1.memory_care_commands,quellight_product_v1.memory_care_attempts FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON quellight_product_v1.memory_care_commands,quellight_product_v1.memory_care_attempts TO ql_app_runtime;
CREATE POLICY memory_care_runtime ON quellight_product_v1.memory_care_commands TO ql_app_runtime USING(true) WITH CHECK(true);
CREATE POLICY memory_care_attempts_runtime ON quellight_product_v1.memory_care_attempts TO ql_app_runtime USING(true) WITH CHECK(true);
