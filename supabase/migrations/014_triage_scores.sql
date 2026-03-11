-- 014_triage_scores.sql
-- Adds triage columns to action_queue for automated fix prioritization.

ALTER TABLE action_queue
  ADD COLUMN IF NOT EXISTS triage_score INTEGER,
  ADD COLUMN IF NOT EXISTS triage_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS triage_reason TEXT,
  ADD COLUMN IF NOT EXISTS triage_impact TEXT,
  ADD COLUMN IF NOT EXISTS ai_reviewed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ;
