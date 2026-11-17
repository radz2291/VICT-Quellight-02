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
