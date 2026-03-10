-- Migration 007 — Create Tracer Phase 1 tables
-- tracer_url_inventory: per-URL record with template mapping and CMS management status
-- tracer_field_snapshots: per-field SEO data captured during a tracer scan run
-- tracer_gsc_cache: cached GSC performance data for tracer analysis

-- ── tracer_url_inventory ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tracer_url_inventory (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        UUID        NOT NULL,
  url            TEXT        NOT NULL,
  template_id    TEXT,
  first_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_cms_managed BOOLEAN     NOT NULL DEFAULT TRUE,
  status         TEXT        NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'redirected', 'deleted', '404')),

  CONSTRAINT tracer_url_inventory_site_url_unique UNIQUE (site_id, url)
);

CREATE INDEX IF NOT EXISTS tracer_url_inventory_site_id_idx ON tracer_url_inventory (site_id);
CREATE INDEX IF NOT EXISTS tracer_url_inventory_status_idx  ON tracer_url_inventory (status);

-- ── tracer_field_snapshots ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tracer_field_snapshots (
  snapshot_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      TEXT        NOT NULL,
  site_id     UUID        NOT NULL,
  url         TEXT        NOT NULL,
  field_type  TEXT        NOT NULL CHECK (field_type IN (
                'title', 'meta_description', 'h1', 'h2',
                'canonical', 'schema', 'og_title', 'og_description',
                'og_image', 'robots'
              )),
  current_value TEXT,
  char_count    INTEGER,
  issue_flag    BOOLEAN   NOT NULL DEFAULT FALSE,
  issue_type    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tracer_field_snapshots_run_id_idx  ON tracer_field_snapshots (run_id);
CREATE INDEX IF NOT EXISTS tracer_field_snapshots_site_id_idx ON tracer_field_snapshots (site_id);
CREATE INDEX IF NOT EXISTS tracer_field_snapshots_url_idx     ON tracer_field_snapshots (url);

-- ── tracer_gsc_cache ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tracer_gsc_cache (
  cache_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID        NOT NULL,
  url         TEXT        NOT NULL,
  query       TEXT        NOT NULL,
  clicks      INTEGER     NOT NULL DEFAULT 0,
  impressions INTEGER     NOT NULL DEFAULT 0,
  ctr         NUMERIC(5,4),
  position    NUMERIC(5,1),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tracer_gsc_cache_site_id_idx     ON tracer_gsc_cache (site_id);
CREATE INDEX IF NOT EXISTS tracer_gsc_cache_url_idx         ON tracer_gsc_cache (url);
CREATE INDEX IF NOT EXISTS tracer_gsc_cache_captured_at_idx ON tracer_gsc_cache (captured_at);
