-- 017_learnings.sql
-- Stores outcomes from applied fixes, used to train approval heuristics.

CREATE TABLE IF NOT EXISTS learnings (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          UUID         REFERENCES sites (site_id),
  issue_type       TEXT,
  url              TEXT,
  fix_type         TEXT,
  before_value     TEXT,
  after_value      TEXT,
  sandbox_status   TEXT,
  approval_status  TEXT         NOT NULL DEFAULT 'pending',
  reviewer_note    TEXT,
  applied_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learnings_site_id_idx    ON learnings (site_id);
CREATE INDEX IF NOT EXISTS learnings_issue_type_idx ON learnings (issue_type);
CREATE INDEX IF NOT EXISTS learnings_status_idx     ON learnings (approval_status);
