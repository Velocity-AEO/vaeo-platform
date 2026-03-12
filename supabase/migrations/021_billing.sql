-- 021_billing.sql
-- Adds billing columns to tenants table and creates digest_schedules table.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan_tier TEXT
    DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS billing_status TEXT
    DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS digest_schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL UNIQUE,
  frequency     TEXT NOT NULL DEFAULT 'weekly',
  day_of_week   INT  NOT NULL DEFAULT 1,
  hour_utc      INT  NOT NULL DEFAULT 9,
  enabled       BOOL NOT NULL DEFAULT true,
  last_sent_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_digest_schedules_tenant
  ON digest_schedules(tenant_id);
