-- Migration 004 — Create crawl_results and site_snapshots tables
-- crawl_results: per-URL SEO data written by packages/crawler/src/index.ts
-- site_snapshots: full CMS state snapshots written by packages/truth-server/src/index.ts

-- ── crawl_results ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crawl_results (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         TEXT        NOT NULL,
  tenant_id      UUID        NOT NULL,
  site_id        UUID        NOT NULL,
  url            TEXT        NOT NULL,
  status_code    INTEGER,
  title          TEXT,
  meta_desc      TEXT,
  h1             JSONB       NOT NULL DEFAULT '[]',
  h2             JSONB       NOT NULL DEFAULT '[]',
  images         JSONB       NOT NULL DEFAULT '[]',
  internal_links JSONB       NOT NULL DEFAULT '[]',
  schema_blocks  JSONB       NOT NULL DEFAULT '[]',
  canonical      TEXT,
  redirect_chain JSONB       NOT NULL DEFAULT '[]',
  load_time_ms   INTEGER,
  crawled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crawl_results_run_id_idx    ON crawl_results (run_id);
CREATE INDEX IF NOT EXISTS crawl_results_tenant_id_idx ON crawl_results (tenant_id);
CREATE INDEX IF NOT EXISTS crawl_results_site_id_idx   ON crawl_results (site_id);
CREATE INDEX IF NOT EXISTS crawl_results_url_idx       ON crawl_results (url);

-- ── site_snapshots ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_snapshots (
  snapshot_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        TEXT        NOT NULL,
  tenant_id     UUID        NOT NULL,
  site_id       UUID        NOT NULL,
  cms_type      TEXT        NOT NULL CHECK (cms_type IN ('shopify', 'wordpress')),
  snapshot_data JSONB       NOT NULL DEFAULT '{}',
  content_hash  TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS site_snapshots_run_id_idx    ON site_snapshots (run_id);
CREATE INDEX IF NOT EXISTS site_snapshots_tenant_id_idx ON site_snapshots (tenant_id);
CREATE INDEX IF NOT EXISTS site_snapshots_site_id_idx   ON site_snapshots (site_id);
