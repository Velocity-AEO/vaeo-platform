-- Migration 009 — Add proposed_value column to tracer_field_snapshots
-- Stores AI-generated proposed title/meta_description values from tools/ai/title_meta_generator.ts

ALTER TABLE tracer_field_snapshots
  ADD COLUMN IF NOT EXISTS proposed_value TEXT DEFAULT NULL;
