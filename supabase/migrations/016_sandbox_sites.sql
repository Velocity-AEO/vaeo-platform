-- Migration 016 — Add sandbox columns to sites table
-- Supports Sandbox Phase 1: sandbox site verification pipeline.

ALTER TABLE sites ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS sandbox_last_verified_at TIMESTAMPTZ;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS sandbox_last_result JSONB;
