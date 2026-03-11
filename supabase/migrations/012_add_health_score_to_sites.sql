-- Migration 012 — Add health_score, health_grade, last_scored_at to sites
--
-- health_score    INT          — 0–100 score from the most recent onboard/audit run
-- health_grade    TEXT         — letter grade ('A'|'B'|'C'|'D'|'F')
-- last_scored_at  TIMESTAMPTZ  — when the score was last written
--
-- Nullable: existing rows have no score until the next onboard run.
-- Apply via Supabase SQL editor or:
--   DB_PASS='...' bash apps/dashboard/scripts/apply-migration.sh

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS health_score    INT,
  ADD COLUMN IF NOT EXISTS health_grade    TEXT,
  ADD COLUMN IF NOT EXISTS last_scored_at  TIMESTAMPTZ;
