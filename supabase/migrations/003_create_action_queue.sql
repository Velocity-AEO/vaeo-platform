-- Migration 003 — Create action_queue table
-- Stores one row per ranked issue produced by vaeo audit.
-- priority maps directly to the guardrail PRIORITY_MAP (1=errors … 8=enhancements).
-- execution_status starts as 'queued' and advances through the optimize/verify/promote pipeline.

CREATE TABLE IF NOT EXISTS action_queue (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            TEXT        NOT NULL,
  tenant_id         UUID        NOT NULL,
  site_id           UUID        NOT NULL,
  issue_type        TEXT        NOT NULL,
  url               TEXT        NOT NULL,
  risk_score        INTEGER     NOT NULL CHECK (risk_score BETWEEN 1 AND 10),
  priority          INTEGER     NOT NULL CHECK (priority BETWEEN 1 AND 8),
  category          TEXT        NOT NULL CHECK (category IN (
                      'errors', 'redirects', 'canonicals', 'indexing',
                      'content', 'schema', 'performance', 'enhancements'
                    )),
  proposed_fix      JSONB       NOT NULL DEFAULT '{}',
  approval_required BOOLEAN     NOT NULL DEFAULT FALSE,
  auto_deploy       BOOLEAN     NOT NULL DEFAULT FALSE,
  execution_status  TEXT        NOT NULL DEFAULT 'queued'
                      CHECK (execution_status IN ('queued', 'in_progress', 'completed', 'skipped', 'failed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS action_queue_run_id_idx       ON action_queue (run_id);
CREATE INDEX IF NOT EXISTS action_queue_tenant_id_idx    ON action_queue (tenant_id);
CREATE INDEX IF NOT EXISTS action_queue_site_id_idx      ON action_queue (site_id);
CREATE INDEX IF NOT EXISTS action_queue_priority_idx     ON action_queue (priority);
CREATE INDEX IF NOT EXISTS action_queue_status_idx       ON action_queue (execution_status);
