-- Migration 005: site_credentials table
-- Stores encrypted access tokens per site (service-role only reads).

CREATE TABLE IF NOT EXISTS site_credentials (
  credential_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        UUID NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL,
  credential_key VARCHAR(64) NOT NULL,   -- e.g. 'shopify_access_token'
  credential_val TEXT NOT NULL,          -- store encrypted in prod; plaintext in dev
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, credential_key)
);

CREATE INDEX IF NOT EXISTS idx_site_credentials_site_id ON site_credentials(site_id);
CREATE INDEX IF NOT EXISTS idx_site_credentials_tenant_id ON site_credentials(tenant_id);

-- RLS: only service role may read/write
ALTER TABLE site_credentials ENABLE ROW LEVEL SECURITY;
