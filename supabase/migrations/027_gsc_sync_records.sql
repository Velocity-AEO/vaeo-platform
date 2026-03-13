-- Sprint: GSC delta sync
-- Run in Supabase SQL editor
-- DO NOT run automatically

create table if not exists gsc_sync_records (
  id                   uuid        primary key default gen_random_uuid(),
  site_id              uuid        not null unique,
  last_full_sync_at    timestamptz,
  last_delta_sync_at   timestamptz,
  last_sync_at         timestamptz,
  last_sync_mode       text,
  total_syncs          integer     default 0,
  total_rows_fetched   integer     default 0,
  updated_at           timestamptz default now()
);

create index if not exists gsc_sync_records_site_id_idx
  on gsc_sync_records (site_id);
