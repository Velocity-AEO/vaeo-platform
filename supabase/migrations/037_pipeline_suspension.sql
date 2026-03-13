-- 037_pipeline_suspension.sql
-- Adds pipeline suspension columns to sites table.
-- DO NOT RUN — Vincent will run manually in Supabase SQL editor.

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS pipeline_suspended boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pipeline_suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS pipeline_resume_at timestamptz,
  ADD COLUMN IF NOT EXISTS pipeline_suspension_reason text,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sites_pipeline_suspended
  ON sites(pipeline_suspended);

CREATE INDEX IF NOT EXISTS idx_sites_pipeline_resume_at
  ON sites(pipeline_resume_at);
