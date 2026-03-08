-- Migration 006: monitor_results table
-- Stores post-deploy regression detections from the monitoring system.

CREATE TABLE IF NOT EXISTS monitor_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID NOT NULL,
  tenant_id   UUID NOT NULL,
  check_type  TEXT NOT NULL,   -- 'http_status' | 'lighthouse' | 'gsc_indexing' | 'playwright'
  url         TEXT NOT NULL,
  issue       TEXT NOT NULL,
  severity    TEXT NOT NULL,   -- 'warning' | 'critical'
  action_id   UUID,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitor_results_run_id     ON monitor_results(run_id);
CREATE INDEX IF NOT EXISTS idx_monitor_results_tenant_id  ON monitor_results(tenant_id);
CREATE INDEX IF NOT EXISTS idx_monitor_results_detected_at ON monitor_results(detected_at);

-- RLS: service role only
ALTER TABLE monitor_results ENABLE ROW LEVEL SECURITY;
