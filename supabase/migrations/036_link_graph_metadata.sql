-- Sprint: Canonical conflicts + link limits
-- Run in Supabase SQL editor

ALTER TABLE link_graphs ADD COLUMN IF NOT EXISTS
  canonical_conflicts_count integer default 0;

ALTER TABLE link_graphs ADD COLUMN IF NOT EXISTS
  link_limit_violations_count integer default 0;
