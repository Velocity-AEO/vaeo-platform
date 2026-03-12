-- 022_app_replacements.sql
-- Tracks Shopify apps that VAEO has removed or replaced,
-- with performance deltas before/after.

CREATE TABLE IF NOT EXISTS app_replacements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id             UUID NOT NULL,
  tenant_id           TEXT NOT NULL,
  app_name            TEXT NOT NULL,
  app_category        TEXT NOT NULL,
  removed_at          TIMESTAMPTZ DEFAULT NOW(),
  replacement         TEXT,
  replacement_type    TEXT NOT NULL DEFAULT 'vaeo_native',
  health_score_before INTEGER,
  health_score_after  INTEGER,
  lcp_before          NUMERIC,
  lcp_after           NUMERIC,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_replacements_site
  ON app_replacements(site_id, removed_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_replacements_tenant
  ON app_replacements(tenant_id, removed_at DESC);
