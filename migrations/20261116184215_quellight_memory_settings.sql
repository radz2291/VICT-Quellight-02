-- Product configuration only: learned memory and original conversation content are separate domains.
CREATE TABLE IF NOT EXISTS quellight_product_v1.memory_settings_heads (
  actor_id uuid NOT NULL,
  scope_key text NOT NULL,
  room_id uuid,
  revision integer NOT NULL CHECK(revision >= 0),
  content_revision text NOT NULL CHECK(content_revision ~ '^[a-f0-9]{64}$'),
  content jsonb NOT NULL CHECK(jsonb_typeof(content) = 'object'),
  operation text NOT NULL CHECK(operation IN ('initial','save','restore')),
  restored_from_revision integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,scope_key),
  FOREIGN KEY(room_id,actor_id) REFERENCES quellight_product_v1.rooms(id,actor_id),
  CHECK((room_id IS NULL AND scope_key = 'app') OR (room_id IS NOT NULL AND scope_key = room_id::text)),
  CHECK((operation = 'restore' AND restored_from_revision IS NOT NULL AND restored_from_revision >= 0 AND restored_from_revision < revision)
    OR (operation <> 'restore' AND restored_from_revision IS NULL))
);
CREATE TABLE IF NOT EXISTS quellight_product_v1.memory_settings_revisions (
  actor_id uuid NOT NULL,
  scope_key text NOT NULL,
  revision integer NOT NULL CHECK(revision >= 0),
  content_revision text NOT NULL CHECK(content_revision ~ '^[a-f0-9]{64}$'),
  content jsonb NOT NULL CHECK(jsonb_typeof(content) = 'object'),
  operation text NOT NULL CHECK(operation IN ('initial','save','restore')),
  restored_from_revision integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,scope_key,revision),
  FOREIGN KEY(actor_id,scope_key) REFERENCES quellight_product_v1.memory_settings_heads(actor_id,scope_key),
  CHECK((operation = 'restore' AND restored_from_revision IS NOT NULL AND restored_from_revision >= 0 AND restored_from_revision < revision)
    OR (operation <> 'restore' AND restored_from_revision IS NULL))
);
ALTER TABLE quellight_product_v1.memory_settings_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE quellight_product_v1.memory_settings_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quellight_product_v1.memory_settings_heads,quellight_product_v1.memory_settings_revisions FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON quellight_product_v1.memory_settings_heads TO ql_app_runtime;
GRANT SELECT,INSERT ON quellight_product_v1.memory_settings_revisions TO ql_app_runtime;
REVOKE UPDATE,DELETE,TRUNCATE ON quellight_product_v1.memory_settings_revisions FROM ql_app_runtime;
CREATE POLICY memory_settings_runtime ON quellight_product_v1.memory_settings_heads
  TO ql_app_runtime USING(true) WITH CHECK(true);
CREATE POLICY memory_settings_history_runtime ON quellight_product_v1.memory_settings_revisions
  TO ql_app_runtime USING(true) WITH CHECK(true);
-- The restricted private server role is authorized by VICT before receiving a fenced client.
-- No anon/authenticated grants, Data API exposure, or security-definer helper is introduced.
