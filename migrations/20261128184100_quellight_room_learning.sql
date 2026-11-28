ALTER TABLE quellight_product_v1.rooms
  ADD COLUMN IF NOT EXISTS room_guidance_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS room_guidance_authority text,
  ADD COLUMN IF NOT EXISTS room_guidance_available boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS quellight_product_v1.room_learning_revisions (
  actor_id uuid NOT NULL,
  room_id uuid NOT NULL REFERENCES quellight_product_v1.rooms(id),
  revision integer NOT NULL CHECK (revision > 0),
  previous_revision integer NOT NULL CHECK (previous_revision >= 0),
  authority_revision text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('learned','corrected','forgotten','restored','revalidated')),
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'array'),
  changed text[] NOT NULL,
  block text CHECK (block IS NULL OR octet_length(block) <= 400),
  source_revision text,
  job_id uuid,
  execution_ref jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, room_id, revision),
  UNIQUE (job_id)
);

CREATE TABLE IF NOT EXISTS quellight_product_v1.room_learning_jobs (
  job_id uuid PRIMARY KEY REFERENCES quellight_product_v1.memory_jobs(id),
  actor_id uuid NOT NULL,
  room_id uuid NOT NULL REFERENCES quellight_product_v1.rooms(id),
  base_revision integer NOT NULL,
  authority_revision text NOT NULL,
  source_revision text NOT NULL,
  configuration_revision text NOT NULL,
  pins_digest text NOT NULL,
  attempt_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','prepared','published','no-change','superseded')),
  candidate jsonb,
  execution_ref jsonb,
  failure_code text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quellight_product_v1.room_learning_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quellight_product_v1.room_learning_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON quellight_product_v1.room_learning_revisions TO ql_app_runtime;
GRANT SELECT,INSERT,UPDATE ON quellight_product_v1.room_learning_jobs TO ql_app_runtime;
CREATE POLICY room_learning_runtime_revisions ON quellight_product_v1.room_learning_revisions
  TO ql_app_runtime USING (true) WITH CHECK (true);
CREATE POLICY room_learning_runtime_jobs ON quellight_product_v1.room_learning_jobs
  TO ql_app_runtime USING (true) WITH CHECK (true);
