-- Migration 012 — Create tracer_url_inventory and tracer_field_snapshots tables
--
-- These tables store the output of the VAEO tracer scan:
--   - tracer_url_inventory: one row per URL discovered on a site
--   - tracer_field_snapshots: one row per SEO field per URL per scan run

CREATE TABLE IF NOT EXISTS tracer_url_inventory (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         UUID        NOT NULL,
  url             TEXT        NOT NULL,
  template_id     TEXT,
  first_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_cms_managed  BOOLEAN     NOT NULL DEFAULT TRUE,
  status          TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'redirected', 'deleted', '404')),
  UNIQUE (site_id, url)
);

CREATE INDEX IF NOT EXISTS tracer_url_inv_site_idx ON tracer_url_inventory (site_id);
CREATE INDEX IF NOT EXISTS tracer_url_inv_status_idx ON tracer_url_inventory (status);

CREATE TABLE IF NOT EXISTS tracer_field_snapshots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID        NOT NULL,
  site_id         UUID        NOT NULL,
  url             TEXT        NOT NULL,
  field_type      TEXT        NOT NULL,
  current_value   TEXT,
  proposed_value  TEXT,
  char_count      INTEGER     DEFAULT 0,
  issue_flag      BOOLEAN     NOT NULL DEFAULT FALSE,
  issue_type      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tracer_snap_run_idx ON tracer_field_snapshots (run_id);
CREATE INDEX IF NOT EXISTS tracer_snap_site_idx ON tracer_field_snapshots (site_id);
CREATE INDEX IF NOT EXISTS tracer_snap_url_idx ON tracer_field_snapshots (url);
CREATE INDEX IF NOT EXISTS tracer_snap_issue_idx ON tracer_field_snapshots (issue_flag) WHERE issue_flag = TRUE;

-- Also create health_snapshots if it doesn't exist (used by weekly digest)
CREATE TABLE IF NOT EXISTS health_snapshots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         UUID        NOT NULL,
  score           INTEGER     NOT NULL,
  grade           TEXT        NOT NULL CHECK (grade IN ('A', 'B', 'C', 'D', 'F')),
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS health_snap_site_idx ON health_snapshots (site_id);
CREATE INDEX IF NOT EXISTS health_snap_recorded_idx ON health_snapshots (recorded_at);
