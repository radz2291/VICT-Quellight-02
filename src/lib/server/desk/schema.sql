-- Private product data. This package DDL is applied by the authorized migration operator.
CREATE TABLE IF NOT EXISTS quellight_product_v1.desk_items (
  id uuid PRIMARY KEY, actor_id uuid NOT NULL, room_id uuid NOT NULL,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200), body text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT '', status text NOT NULL DEFAULT '',
  attention text NOT NULL DEFAULT 'within-reach' CHECK(attention IN ('carried','within-reach','put-away')),
  archived_at timestamptz, revision integer NOT NULL CHECK(revision>0), is_method boolean NOT NULL DEFAULT false,
  derivation_authority_revision text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(room_id,actor_id) REFERENCES quellight_product_v1.rooms(id,actor_id), UNIQUE(id,actor_id,room_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS desk_one_method_per_room ON quellight_product_v1.desk_items(actor_id,room_id) WHERE is_method;
CREATE INDEX IF NOT EXISTS desk_room_page ON quellight_product_v1.desk_items(actor_id,room_id,updated_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS quellight_product_v1.desk_revisions (
  item_id uuid NOT NULL, actor_id uuid NOT NULL, room_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
  snapshot jsonb NOT NULL, author_kind text NOT NULL CHECK(author_kind IN ('owner','agent','method')),
  operation text NOT NULL, provenance jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(item_id,revision), FOREIGN KEY(item_id,actor_id,room_id) REFERENCES quellight_product_v1.desk_items(id,actor_id,room_id)
);
CREATE INDEX IF NOT EXISTS desk_revision_provenance ON quellight_product_v1.desk_revisions(actor_id,room_id,author_kind,operation,created_at);
CREATE TABLE IF NOT EXISTS quellight_product_v1.desk_commands (
  actor_id uuid NOT NULL, command_key text NOT NULL, argument_digest text NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,command_key)
);
CREATE TABLE IF NOT EXISTS quellight_product_v1.desk_contexts (
  actor_id uuid NOT NULL, room_id uuid NOT NULL, turn_id text NOT NULL, selection_digest text NOT NULL, selection jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,turn_id), FOREIGN KEY(room_id,actor_id) REFERENCES quellight_product_v1.rooms(id,actor_id)
);
ALTER TABLE quellight_product_v1.desk_items ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS quellight_product_v1.desk_reads (
 actor_id uuid NOT NULL,room_id uuid NOT NULL,turn_id text NOT NULL,invocation_id text NOT NULL,
 item_id uuid NOT NULL,item_revision integer NOT NULL,title text NOT NULL,authority_revision text NOT NULL,
 at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_id,invocation_id),
 FOREIGN KEY(room_id,actor_id) REFERENCES quellight_product_v1.rooms(id,actor_id)
);
CREATE INDEX IF NOT EXISTS desk_reads_turn ON quellight_product_v1.desk_reads(actor_id,room_id,turn_id,at);
ALTER TABLE quellight_product_v1.desk_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quellight_product_v1.desk_reads FROM PUBLIC;
GRANT SELECT,INSERT ON quellight_product_v1.desk_reads TO ql_app_runtime;
CREATE POLICY desk_reads_runtime ON quellight_product_v1.desk_reads TO ql_app_runtime USING(true) WITH CHECK(true);
ALTER TABLE quellight_product_v1.desk_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quellight_product_v1.desk_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE quellight_product_v1.desk_contexts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quellight_product_v1.desk_items,quellight_product_v1.desk_revisions,quellight_product_v1.desk_commands,quellight_product_v1.desk_contexts FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON quellight_product_v1.desk_items TO ql_app_runtime;
GRANT SELECT,INSERT ON quellight_product_v1.desk_revisions,quellight_product_v1.desk_commands,quellight_product_v1.desk_contexts TO ql_app_runtime;
CREATE POLICY desk_items_runtime ON quellight_product_v1.desk_items TO ql_app_runtime USING(true) WITH CHECK(true);
CREATE POLICY desk_history_runtime ON quellight_product_v1.desk_revisions TO ql_app_runtime USING(true) WITH CHECK(true);
CREATE POLICY desk_commands_runtime ON quellight_product_v1.desk_commands TO ql_app_runtime USING(true) WITH CHECK(true);
CREATE POLICY desk_contexts_runtime ON quellight_product_v1.desk_contexts TO ql_app_runtime USING(true) WITH CHECK(true);
-- No browser/Data API grants. Server reads enforce actor+room; writes use VICT fenced authority.
