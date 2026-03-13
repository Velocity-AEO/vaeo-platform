-- 029_site_events.sql
-- Records site lifecycle events for onboarding progress tracking.
-- DO NOT RUN — migration tracked by Supabase CLI.

CREATE TABLE IF NOT EXISTS site_events (
  event_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     TEXT        NOT NULL,
  event_type  TEXT        NOT NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_site_event UNIQUE (site_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_site_events_site_id
  ON site_events (site_id);

CREATE INDEX IF NOT EXISTS idx_site_events_type
  ON site_events (event_type);

CREATE INDEX IF NOT EXISTS idx_site_events_created
  ON site_events (created_at DESC);
