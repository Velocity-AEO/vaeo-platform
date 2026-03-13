-- 033_link_graph.sql
-- Sprint: Link Graph Builder
-- Run in Supabase SQL editor

-- ── link_graphs ───────────────────────────────────────────────────────────────

create table if not exists link_graphs (
  id                        uuid        primary key default gen_random_uuid(),
  site_id                   uuid        not null references sites(id) on delete cascade,
  built_at                  timestamptz not null default now(),
  total_pages               integer     not null default 0,
  total_internal_links      integer     not null default 0,
  total_external_links      integer     not null default 0,
  orphaned_count            integer     not null default 0,
  dead_end_count            integer     not null default 0,
  deep_pages_count          integer     not null default 0,
  sitemap_discrepancy_count integer     not null default 0,
  avg_depth                 numeric,
  max_depth                 integer
);

create index if not exists link_graphs_site_id_idx on link_graphs (site_id);
create index if not exists link_graphs_built_at_idx on link_graphs (built_at desc);

comment on table link_graphs is
  'Summary record per link graph build. One per site per crawl run.';

-- ── page_nodes ────────────────────────────────────────────────────────────────

create table if not exists page_nodes (
  id                      uuid        primary key default gen_random_uuid(),
  site_id                 uuid        not null references sites(id) on delete cascade,
  link_graph_id           uuid        references link_graphs(id) on delete cascade,
  url                     text        not null,
  title                   text,
  is_canonical            boolean     not null default true,
  canonical_url           text,
  is_noindex              boolean     not null default false,
  is_paginated            boolean     not null default false,
  pagination_root         text,
  depth_from_homepage     integer,
  inbound_internal_count  integer     not null default 0,
  outbound_internal_count integer     not null default 0,
  outbound_external_count integer     not null default 0,
  total_link_count        integer     not null default 0,
  is_in_sitemap           boolean     not null default false,
  is_orphaned             boolean     not null default false,
  is_dead_end             boolean     not null default false,
  has_redirect_chain      boolean     not null default false,
  link_equity_score       numeric,
  last_crawled_at         timestamptz
);

create index if not exists page_nodes_site_id_idx      on page_nodes (site_id);
create index if not exists page_nodes_link_graph_id_idx on page_nodes (link_graph_id);
create index if not exists page_nodes_url_idx           on page_nodes (url);
create index if not exists page_nodes_is_orphaned_idx   on page_nodes (is_orphaned) where is_orphaned = true;
create index if not exists page_nodes_is_dead_end_idx   on page_nodes (is_dead_end) where is_dead_end = true;

comment on table page_nodes is
  'One row per page per link graph build. Stores crawl metrics and link counts.';

-- ── internal_links ────────────────────────────────────────────────────────────

create table if not exists internal_links (
  id                   uuid    primary key default gen_random_uuid(),
  site_id              uuid    not null references sites(id) on delete cascade,
  link_graph_id        uuid    references link_graphs(id) on delete cascade,
  source_url           text    not null,
  destination_url      text    not null,
  anchor_text          text,
  link_type            text    not null,
  link_source          text    not null default 'html_static',
  is_nofollow          boolean not null default false,
  is_redirect          boolean not null default false,
  redirect_destination text,
  position_in_page     integer
);

create index if not exists internal_links_site_id_idx       on internal_links (site_id);
create index if not exists internal_links_link_graph_id_idx  on internal_links (link_graph_id);
create index if not exists internal_links_source_url_idx     on internal_links (source_url);
create index if not exists internal_links_destination_url_idx on internal_links (destination_url);

comment on table internal_links is
  'Every internal hyperlink discovered in a link graph crawl.';

-- ── external_links ────────────────────────────────────────────────────────────

create table if not exists external_links (
  id                 uuid    primary key default gen_random_uuid(),
  site_id            uuid    not null references sites(id) on delete cascade,
  link_graph_id      uuid    references link_graphs(id) on delete cascade,
  source_url         text    not null,
  destination_url    text    not null,
  destination_domain text,
  anchor_text        text,
  is_nofollow        boolean not null default false,
  status_code        integer,
  is_broken          boolean not null default false
);

create index if not exists external_links_site_id_idx        on external_links (site_id);
create index if not exists external_links_link_graph_id_idx   on external_links (link_graph_id);
create index if not exists external_links_source_url_idx      on external_links (source_url);
create index if not exists external_links_destination_url_idx on external_links (destination_url);
create index if not exists external_links_destination_domain_idx on external_links (destination_domain);
create index if not exists external_links_is_broken_idx       on external_links (is_broken) where is_broken = true;

comment on table external_links is
  'Every external hyperlink discovered in a link graph crawl.';
