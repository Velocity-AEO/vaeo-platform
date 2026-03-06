-- Migration 001 — Create sites table
-- Table: sites
-- Stores one record per connected CMS site.
-- site_id is the stable UUID referenced by all subsequent VAEO commands.
-- A (tenant_id, site_url) pair is unique — reconnecting the same site
-- updates verified_at rather than creating a duplicate row.

CREATE TABLE IF NOT EXISTS sites (
  site_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL,
  cms_type    TEXT        NOT NULL CHECK (cms_type IN ('shopify', 'wordpress')),
  site_url    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,

  CONSTRAINT sites_tenant_site_unique UNIQUE (tenant_id, site_url)
);

CREATE INDEX IF NOT EXISTS sites_tenant_id_idx ON sites (tenant_id);
