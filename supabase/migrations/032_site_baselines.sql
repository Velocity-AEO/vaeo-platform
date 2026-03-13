-- 032_site_baselines.sql
-- Sprint: Baseline snapshot store
-- Run in Supabase SQL editor

create table if not exists site_baselines (
  id                  uuid    primary key default gen_random_uuid(),
  site_id             uuid    not null references sites(id) on delete cascade,
  url                 text    not null,
  snapshot_date       date    not null,
  title               text,
  meta_description    text,
  canonical           text,
  has_schema          boolean not null default false,
  schema_types        text[]  not null default '{}',
  has_og_tags         boolean not null default false,
  has_canonical       boolean not null default false,
  is_noindex          boolean not null default false,
  h1_count            integer not null default 0,
  word_count          integer not null default 0,
  image_count         integer not null default 0,
  images_missing_alt  integer not null default 0,
  internal_links      integer not null default 0,
  external_links      integer not null default 0,
  mobile_lighthouse   integer,
  page_size_bytes     integer,
  captured_at         timestamptz not null default now()
);

-- One snapshot per URL per date per site
alter table site_baselines
  add constraint site_baselines_site_url_date_key
  unique (site_id, url, snapshot_date);

create index if not exists site_baselines_site_id_idx   on site_baselines (site_id);
create index if not exists site_baselines_url_idx        on site_baselines (url);
create index if not exists site_baselines_snap_date_idx  on site_baselines (snapshot_date desc);

comment on table site_baselines is
  'Weekly site snapshots for degradation detection independent of VAEO fixes.';
comment on column site_baselines.snapshot_date is
  'ISO date (YYYY-MM-DD) — one row per site/url/date.';
comment on column site_baselines.mobile_lighthouse is
  'Mobile Lighthouse performance score (0-100) at time of capture.';
