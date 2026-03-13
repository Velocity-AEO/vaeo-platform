-- Sprint: Lighthouse trend tracker
-- Run in Supabase SQL editor

create table if not exists lighthouse_history (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references sites(id),
  url             text not null,
  fix_id          uuid,
  form_factor     text not null default 'mobile',
  performance     integer,
  seo             integer,
  accessibility   integer,
  best_practices  integer,
  measured_at     timestamptz default now(),
  trigger         text not null default 'fix_sandbox'
);

create index if not exists idx_lighthouse_history_site_id
  on lighthouse_history(site_id);

create index if not exists idx_lighthouse_history_url
  on lighthouse_history(url);

create index if not exists idx_lighthouse_history_measured_at
  on lighthouse_history(measured_at desc);

create index if not exists idx_lighthouse_history_form_factor
  on lighthouse_history(form_factor);
