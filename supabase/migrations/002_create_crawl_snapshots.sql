-- Migration 002 — Create crawl_snapshots table
-- Stores one summary row per vaeo crawl run.
-- snapshot_id is the stable reference returned in CrawlCommandResult.snapshot_id
-- and used by downstream commands (audit, optimize) to load the crawl results.

CREATE TABLE IF NOT EXISTS crawl_snapshots (
  snapshot_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       TEXT        NOT NULL,
  tenant_id    UUID        NOT NULL,
  site_id      UUID        NOT NULL,
  cms_type     TEXT        NOT NULL CHECK (cms_type IN ('shopify', 'wordpress')),
  urls_crawled INTEGER     NOT NULL DEFAULT 0,
  urls_failed  INTEGER     NOT NULL DEFAULT 0,
  started_at   TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  status       TEXT        NOT NULL CHECK (status IN ('completed', 'failed', 'partial')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crawl_snapshots_run_id_idx    ON crawl_snapshots (run_id);
CREATE INDEX IF NOT EXISTS crawl_snapshots_tenant_id_idx ON crawl_snapshots (tenant_id);
CREATE INDEX IF NOT EXISTS crawl_snapshots_site_id_idx   ON crawl_snapshots (site_id);
