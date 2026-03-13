-- 034_external_link_checks.sql
-- Sprint: External Link Auditor
-- Run in Supabase SQL editor

create table if not exists external_link_checks (
  id                 uuid        primary key default gen_random_uuid(),
  site_id            uuid        not null references sites(id) on delete cascade,
  link_graph_id      uuid        references link_graphs(id) on delete cascade,
  source_url         text        not null,
  destination_url    text        not null,
  destination_domain text,
  status_code        integer,
  is_broken          boolean     not null default false,
  is_redirect        boolean     not null default false,
  final_url          text,
  redirect_hops      integer     not null default 0,
  response_time_ms   integer,
  is_nofollow        boolean     not null default false,
  domain_reputation  text        not null default 'unchecked',
  check_error        text,
  checked_at         timestamptz not null default now()
);

create index if not exists external_link_checks_site_id_idx        on external_link_checks (site_id);
create index if not exists external_link_checks_is_broken_idx       on external_link_checks (is_broken) where is_broken = true;
create index if not exists external_link_checks_destination_domain_idx on external_link_checks (destination_domain);
create index if not exists external_link_checks_checked_at_idx      on external_link_checks (checked_at desc);

comment on table external_link_checks is
  'Results of automated external link health checks. One row per checked destination URL per audit run.';
comment on column external_link_checks.domain_reputation is
  'trusted | unknown | low_value | spammy | unchecked';
comment on column external_link_checks.redirect_hops is
  'Number of HTTP redirects followed before reaching final_url.';
