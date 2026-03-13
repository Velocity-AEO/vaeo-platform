-- 026_notification_dedup.sql
-- Notification deduplication window table.
-- Same fix + same event within 1 hour = send once.

create table if not exists notification_dedup (
  dedup_key   text        primary key,
  site_id     text        not null,
  fix_id      text        not null,
  event       text        not null,
  sent_at     timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists idx_notification_dedup_expires
  on notification_dedup (expires_at);

create index if not exists idx_notification_dedup_site
  on notification_dedup (site_id);
