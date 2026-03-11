-- 018_approval_queue.sql
-- Human review queue: items awaiting manual approve/reject before apply.

CREATE TABLE IF NOT EXISTS approval_queue (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id           UUID         REFERENCES sites (site_id),
  action_queue_id   UUID         REFERENCES action_queue (id),
  learning_id       UUID         REFERENCES learnings (id),
  issue_type        TEXT,
  url               TEXT,
  before_value      TEXT,
  proposed_value    TEXT,
  sandbox_result    JSONB,
  status            TEXT         NOT NULL DEFAULT 'pending',
  reviewer_id       TEXT,
  reviewer_note     TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approval_queue_site_id_idx ON approval_queue (site_id);
CREATE INDEX IF NOT EXISTS approval_queue_status_idx  ON approval_queue (status);
