-- 020_audit_log.sql
--
-- Immutable audit event log for SOC 2 compliance.
--
-- Retention policy: rows should never be deleted — use an archival
-- strategy (e.g. pg_partman) for long-term storage.

CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT        NOT NULL,
  user_id       TEXT,
  actor_type    TEXT        NOT NULL DEFAULT 'system',
  action        TEXT        NOT NULL,
  resource_type TEXT        NOT NULL,
  resource_id   TEXT,
  outcome       TEXT        NOT NULL DEFAULT 'success',
  ip_address    TEXT,
  user_agent    TEXT,
  metadata      JSONB       DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookup: most queries filter by tenant + recency
CREATE INDEX IF NOT EXISTS idx_audit_tenant
  ON audit_log(tenant_id, created_at DESC);

-- Aggregate queries group by action and outcome
CREATE INDEX IF NOT EXISTS idx_audit_action
  ON audit_log(action, outcome);

-- Resource-scoped lookups (e.g. "all events for site X")
CREATE INDEX IF NOT EXISTS idx_audit_resource
  ON audit_log(resource_type, resource_id);

-- Constrain outcome to known values
ALTER TABLE audit_log
  ADD CONSTRAINT IF NOT EXISTS chk_audit_outcome
  CHECK (outcome IN ('success', 'failure', 'blocked'));

-- Constrain actor_type to known values
ALTER TABLE audit_log
  ADD CONSTRAINT IF NOT EXISTS chk_audit_actor_type
  CHECK (actor_type IN ('user', 'system', 'api'));

COMMENT ON TABLE audit_log IS 'SOC 2 immutable audit event log — never delete rows';
COMMENT ON COLUMN audit_log.actor_type IS 'user | system | api';
COMMENT ON COLUMN audit_log.outcome IS 'success | failure | blocked';
COMMENT ON COLUMN audit_log.metadata IS 'Arbitrary structured context for the event';
