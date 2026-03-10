-- Migration 011 — Create tenants table for billing & plan management
--
-- Holds one row per paying tenant. Every site belongs to a tenant.
-- plan / billing_status fields drive site-creation gating and dashboard UI.

CREATE TABLE IF NOT EXISTS tenants (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL DEFAULT '',
  email             TEXT        NOT NULL DEFAULT '',
  plan              TEXT        NOT NULL DEFAULT 'starter'
                      CHECK (plan IN ('starter', 'pro', 'enterprise')),
  billing_status    TEXT        NOT NULL DEFAULT 'inactive'
                      CHECK (billing_status IN ('active', 'inactive', 'past_due', 'canceled')),
  stripe_customer_id  TEXT      DEFAULT NULL,
  stripe_subscription_id TEXT   DEFAULT NULL,
  site_limit        INTEGER     NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tenants_stripe_customer_idx ON tenants (stripe_customer_id);
CREATE INDEX IF NOT EXISTS tenants_billing_status_idx  ON tenants (billing_status);

-- Seed the hardcoded tenant so existing data stays consistent
INSERT INTO tenants (id, name, email, plan, billing_status, site_limit)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'admin@vaeo.io', 'enterprise', 'active', 999)
ON CONFLICT (id) DO NOTHING;
