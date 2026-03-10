-- Migration 011 — Tenants table + RLS for multi-tenant isolation
--
-- Creates the tenants table, adds FK from sites → tenants, and
-- enables Row Level Security so users can only access their own tenant's data.
--
-- Dev seed identity: 00000000-0000-0000-0000-000000000001

-- ── Tenants table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  owner_user_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan          TEXT        NOT NULL DEFAULT 'starter'
                            CHECK (plan IN ('starter', 'pro', 'enterprise')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenants_owner_user_id_idx ON tenants (owner_user_id);

-- ── FK: sites → tenants ────────────────────────────────────────────────────
-- sites.tenant_id already exists (migration 001) but had no FK constraint.

-- NOT VALID defers checking existing rows — seed.ts calls VALIDATE CONSTRAINT after
-- inserting the dev tenant (id=00000000-0000-0000-0000-000000000001) so the live rows pass.
ALTER TABLE sites
  ADD CONSTRAINT sites_tenant_id_fk
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  NOT VALID;

-- ── Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites   ENABLE ROW LEVEL SECURITY;

-- Tenants: each user can only see and manage their own tenant.

CREATE POLICY "tenants_select_own"
  ON tenants FOR SELECT
  USING (owner_user_id = auth.uid());

CREATE POLICY "tenants_insert_own"
  ON tenants FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "tenants_update_own"
  ON tenants FOR UPDATE
  USING (owner_user_id = auth.uid());

-- Sites: access limited to sites belonging to the authenticated user's tenant.
-- Subquery is indexed on tenants.owner_user_id and sites.tenant_id.

CREATE POLICY "sites_select_own_tenant"
  ON sites FOR SELECT
  USING (
    tenant_id IN (SELECT id FROM tenants WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "sites_insert_own_tenant"
  ON sites FOR INSERT
  WITH CHECK (
    tenant_id IN (SELECT id FROM tenants WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "sites_update_own_tenant"
  ON sites FOR UPDATE
  USING (
    tenant_id IN (SELECT id FROM tenants WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "sites_delete_own_tenant"
  ON sites FOR DELETE
  USING (
    tenant_id IN (SELECT id FROM tenants WHERE owner_user_id = auth.uid())
  );
