-- Sprint: Link Velocity Tracker
-- Run in Supabase SQL editor

create table if not exists link_velocity_snapshots (
  id                       uuid primary key default gen_random_uuid(),
  site_id                  uuid not null references sites(id),
  url                      text not null,
  snapshot_date            date not null,
  inbound_internal_count   integer default 0,
  outbound_internal_count  integer default 0,
  body_content_inbound     integer default 0,
  navigation_inbound       integer default 0,
  authority_score          numeric,
  captured_at              timestamptz default now(),

  constraint uq_velocity_site_url_date unique (site_id, url, snapshot_date)
);

create index if not exists idx_velocity_site_id
  on link_velocity_snapshots (site_id);

create index if not exists idx_velocity_url
  on link_velocity_snapshots (url);

create index if not exists idx_velocity_snapshot_date
  on link_velocity_snapshots (snapshot_date desc);
