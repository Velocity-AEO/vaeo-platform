-- Migration 008 — Add Tracer Phase 1 columns to action_queue and sites
-- action_queue: proposed_options, reasoning_block, batch_position, batch_total
-- sites: cms_managed_routes

-- ── action_queue additions ───────────────────────────────────────────────────

ALTER TABLE action_queue
  ADD COLUMN IF NOT EXISTS proposed_options  JSONB   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reasoning_block   JSONB   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS batch_position    INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS batch_total       INTEGER DEFAULT NULL;

-- ── sites additions ──────────────────────────────────────────────────────────

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS cms_managed_routes TEXT[] DEFAULT '{}';
