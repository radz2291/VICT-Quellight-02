-- Additive Phase 3 storage. Existing rooms, conversations and memory remain intact.

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


CREATE TABLE IF NOT EXISTS quellight_product_v1.desk_method_settings (
 actor_id uuid NOT NULL, scope_key text NOT NULL, room_id uuid,
 revision integer NOT NULL CHECK(revision>=0),content jsonb NOT NULL,operation text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_id,scope_key),
 FOREIGN KEY(room_id,actor_id) REFERENCES quellight_product_v1.rooms(id,actor_id)
);
CREATE TABLE IF NOT EXISTS quellight_product_v1.desk_method_settings_history (
 actor_id uuid NOT NULL,scope_key text NOT NULL,revision integer NOT NULL,content jsonb NOT NULL,operation text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_id,scope_key,revision)
);
CREATE TABLE IF NOT EXISTS quellight_product_v1.desk_method_jobs (
 id uuid PRIMARY KEY,actor_id uuid NOT NULL,room_id uuid NOT NULL,conversation_id uuid NOT NULL,turn_id text NOT NULL,
 create_invocation_ids jsonb NOT NULL,state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','running','retryable','completed','superseded','blocked')),
 attempts integer NOT NULL DEFAULT 0,claim_token uuid,claim_expires timestamptz,wake_after timestamptz NOT NULL DEFAULT now(),
 pinned jsonb,attempt_id uuid,prepared jsonb,published_item_id uuid,published_revision integer,publish_run_id text,failure_code text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(actor_id,turn_id),
 FOREIGN KEY(room_id,actor_id) REFERENCES quellight_product_v1.rooms(id,actor_id),
 FOREIGN KEY(conversation_id,actor_id) REFERENCES quellight_product_v1.conversations(id,actor_id)
);
CREATE INDEX IF NOT EXISTS desk_method_due ON quellight_product_v1.desk_method_jobs(wake_after,created_at,id) WHERE state IN('queued','retryable');
CREATE INDEX IF NOT EXISTS desk_method_actor_running ON quellight_product_v1.desk_method_jobs(actor_id,claim_expires) WHERE state='running';
CREATE INDEX IF NOT EXISTS desk_method_room_activity ON quellight_product_v1.desk_method_jobs(actor_id,room_id,created_at DESC);
CREATE TABLE IF NOT EXISTS quellight_product_v1.desk_method_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,job_id uuid NOT NULL REFERENCES quellight_product_v1.desk_method_jobs(id),
 stage text NOT NULL,code text,detail jsonb,at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quellight_product_v1.desk_method_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE quellight_product_v1.desk_method_settings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE quellight_product_v1.desk_method_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quellight_product_v1.desk_method_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quellight_product_v1.desk_method_settings,quellight_product_v1.desk_method_settings_history,quellight_product_v1.desk_method_jobs,quellight_product_v1.desk_method_events FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON quellight_product_v1.desk_method_settings,quellight_product_v1.desk_method_jobs TO ql_app_runtime;
GRANT SELECT,INSERT ON quellight_product_v1.desk_method_settings_history,quellight_product_v1.desk_method_events TO ql_app_runtime;
GRANT USAGE,SELECT ON SEQUENCE quellight_product_v1.desk_method_events_id_seq TO ql_app_runtime;
CREATE POLICY desk_method_settings_runtime ON quellight_product_v1.desk_method_settings TO ql_app_runtime USING(true) WITH CHECK(true);
CREATE POLICY desk_method_history_runtime ON quellight_product_v1.desk_method_settings_history TO ql_app_runtime USING(true) WITH CHECK(true);
CREATE POLICY desk_method_jobs_runtime ON quellight_product_v1.desk_method_jobs TO ql_app_runtime USING(true) WITH CHECK(true);
CREATE POLICY desk_method_events_runtime ON quellight_product_v1.desk_method_events TO ql_app_runtime USING(true) WITH CHECK(true);


-- Per-turn admission pins; nullable for preserved Phase 1/2 turns.
ALTER TABLE quellight_product_v1.conversation_turns ADD COLUMN IF NOT EXISTS desk_binding jsonb;


REVOKE ALL ON quellight_product_v1.desk_items,quellight_product_v1.desk_revisions,quellight_product_v1.desk_commands,quellight_product_v1.desk_contexts,quellight_product_v1.desk_reads,quellight_product_v1.desk_method_settings,quellight_product_v1.desk_method_settings_history,quellight_product_v1.desk_method_jobs,quellight_product_v1.desk_method_events FROM anon,authenticated;