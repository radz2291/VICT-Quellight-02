CREATE SCHEMA IF NOT EXISTS quellight_product_v1;
REVOKE ALL ON SCHEMA quellight_product_v1 FROM PUBLIC;
CREATE TABLE IF NOT EXISTS quellight_product_v1.rooms (
  id uuid PRIMARY KEY, actor_id uuid NOT NULL, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  purpose text NOT NULL DEFAULT '', archived_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,actor_id)
);
CREATE INDEX IF NOT EXISTS rooms_owner ON quellight_product_v1.rooms(actor_id,created_at);
CREATE TABLE IF NOT EXISTS quellight_product_v1.conversations (
  id uuid PRIMARY KEY, actor_id uuid NOT NULL, room_id uuid NOT NULL, thread_id text NOT NULL UNIQUE,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200), archived_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(room_id,actor_id) REFERENCES quellight_product_v1.rooms(id,actor_id), UNIQUE(id,actor_id)
);
CREATE INDEX IF NOT EXISTS conversations_owner ON quellight_product_v1.conversations(actor_id,room_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS quellight_product_v1.command_receipts (
  actor_id uuid NOT NULL, command_key text NOT NULL, argument_digest text NOT NULL,
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,command_key)
);
ALTER TABLE quellight_product_v1.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE quellight_product_v1.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quellight_product_v1.command_receipts ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA quellight_product_v1 TO ql_app_runtime;
GRANT SELECT,INSERT,UPDATE ON quellight_product_v1.rooms,quellight_product_v1.conversations TO ql_app_runtime;
GRANT SELECT,INSERT ON quellight_product_v1.command_receipts TO ql_app_runtime;
CREATE POLICY product_runtime ON quellight_product_v1.rooms TO ql_app_runtime USING(true) WITH CHECK(true);
CREATE POLICY product_runtime ON quellight_product_v1.conversations TO ql_app_runtime USING(true) WITH CHECK(true);
CREATE POLICY product_runtime ON quellight_product_v1.command_receipts TO ql_app_runtime USING(true) WITH CHECK(true);
