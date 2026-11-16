CREATE TABLE IF NOT EXISTS quellight_product_v1.conversation_turns (
  turn_id text PRIMARY KEY,
  actor_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  request_key uuid NOT NULL,
  input_digest text NOT NULL,
  input_text text NOT NULL,
  activation_version text NOT NULL,
  execution_state text NOT NULL CHECK(execution_state IN ('queued','running','settled','interrupted')),
  output_text text,
  published_sequence bigint NOT NULL DEFAULT 0,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(conversation_id,actor_id) REFERENCES quellight_product_v1.conversations(id,actor_id),
  UNIQUE(actor_id,conversation_id,request_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_turn_active
  ON quellight_product_v1.conversation_turns(conversation_id) WHERE execution_state IN ('queued','running');
CREATE INDEX IF NOT EXISTS conversation_turn_order
  ON quellight_product_v1.conversation_turns(actor_id,conversation_id,created_at,turn_id);
CREATE TABLE IF NOT EXISTS quellight_product_v1.turn_fragments (
  turn_id text NOT NULL REFERENCES quellight_product_v1.conversation_turns(turn_id),
  sequence bigint NOT NULL CHECK(sequence > 0),
  delta text NOT NULL,
  PRIMARY KEY(turn_id,sequence)
);
ALTER TABLE quellight_product_v1.conversation_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE quellight_product_v1.turn_fragments ENABLE ROW LEVEL SECURITY;
-- The private runtime role receives explicit grants/policies during provisioning.
-- Fragments are a projection of validated public text, never model reasoning.
