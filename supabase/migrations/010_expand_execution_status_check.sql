-- Migration 010 — Expand execution_status CHECK to include all pipeline statuses
-- Adds: pending_approval, deployed, approved, regression_detected
-- These statuses are already used by optimize.ts, promote.ts, verify.ts, and approve.ts

ALTER TABLE action_queue DROP CONSTRAINT IF EXISTS action_queue_execution_status_check;

ALTER TABLE action_queue
  ADD CONSTRAINT action_queue_execution_status_check
  CHECK (execution_status IN (
    'queued', 'in_progress', 'completed', 'skipped', 'failed',
    'pending_approval', 'deployed', 'approved', 'regression_detected'
  ));
