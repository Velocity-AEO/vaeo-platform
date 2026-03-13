-- 030_drift_events.sql
-- Stores drift scan results — tracks when previously applied fixes are overwritten.

create table if not exists drift_events (
  id                  uuid primary key default gen_random_uuid(),
  fix_id              text        not null,
  site_id             text        not null,
  url                 text        not null,
  issue_type          text        not null,
  original_value      text        not null default '',
  expected_value      text        not null default '',
  current_value       text,
  drift_status        text        not null check (drift_status in ('stable', 'drifted', 'unknown')),
  drift_detected_at   timestamptz not null default now(),
  applied_at          timestamptz,
  days_since_fix      integer     not null default 0,
  probable_cause      text,
  is_resolved         boolean     not null default false,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists drift_events_site_id_idx        on drift_events (site_id);
create index if not exists drift_events_fix_id_idx         on drift_events (fix_id);
create index if not exists drift_events_drift_status_idx   on drift_events (drift_status);
create index if not exists drift_events_detected_at_idx    on drift_events (drift_detected_at desc);
create index if not exists drift_events_is_resolved_idx    on drift_events (is_resolved) where is_resolved = false;

comment on table drift_events is
  'Records each drift scan result per fix — whether the fix is still present or was overwritten.';
comment on column drift_events.drift_status is
  'stable = fix still present; drifted = fix was overwritten; unknown = could not verify';
comment on column drift_events.probable_cause is
  'Heuristic cause: theme_update, plugin_update, cms_edit, cache_issue, cdn_issue, unknown';
comment on column drift_events.is_resolved is
  'True once a re-applied fix has been confirmed stable again';
