/**
 * tools/link_graph/link_graph_types.ts
 *
 * Core data model for the link graph builder.
 */

// ── Primitives ────────────────────────────────────────────────────────────────

export type LinkType =
  | 'navigation'
  | 'footer'
  | 'sidebar'
  | 'body_content'
  | 'breadcrumb'
  | 'pagination'
  | 'canonical_ref'
  | 'unknown';

export type LinkSource = 'html_static' | 'js_rendered';

// ── Link interfaces ───────────────────────────────────────────────────────────

export interface InternalLink {
  source_url:           string;
  destination_url:      string;
  anchor_text:          string | null;
  link_type:            LinkType;
  link_source:          LinkSource;
  is_nofollow:          boolean;
  is_redirect:          boolean;
  redirect_destination: string | null;
  position_in_page:     number;
  discovered_at:        string;
}

export interface ExternalLink {
  source_url:         string;
  destination_url:    string;
  destination_domain: string;
  anchor_text:        string | null;
  is_nofollow:        boolean;
  status_code:        number | null;
  is_broken:          boolean;
  discovered_at:      string;
}

// ── PageNode ──────────────────────────────────────────────────────────────────

export interface PageNode {
  url:                    string;
  site_id:                string;
  title:                  string | null;
  is_canonical:           boolean;
  canonical_url:          string | null;
  is_noindex:             boolean;
  is_paginated:           boolean;
  pagination_root:        string | null;
  depth_from_homepage:    number | null;
  inbound_internal_count: number;
  outbound_internal_count: number;
  outbound_external_count: number;
  total_link_count:       number;
  is_in_sitemap:          boolean;
  is_orphaned:            boolean;
  is_dead_end:            boolean;
  has_redirect_chain:     boolean;
  link_equity_score:      number | null;
  last_crawled_at:        string;
}

// ── LinkGraph ─────────────────────────────────────────────────────────────────

export interface LinkGraph {
  site_id:                string;
  built_at:               string;
  total_pages:            number;
  total_internal_links:   number;
  total_external_links:   number;
  orphaned_pages:         string[];
  dead_end_pages:         string[];
  deep_pages:             string[];
  redirect_chain_links:   InternalLink[];
  pages:                  PageNode[];
  internal_links:         InternalLink[];
  external_links:         ExternalLink[];
  sitemap_urls:           string[];
  sitemap_discrepancies:  string[];
  pagination_groups:      Array<{ root_url: string; paginated_urls: string[] }>;
}

// ── LinkGraphSummary ──────────────────────────────────────────────────────────

export interface LinkGraphSummary {
  site_id:                    string;
  built_at:                   string;
  total_pages:                number;
  orphaned_count:             number;
  dead_end_count:             number;
  deep_pages_count:           number;
  broken_external_count:      number;
  redirect_chain_count:       number;
  sitemap_discrepancy_count:  number;
  avg_depth:                  number | null;
  max_depth:                  number | null;
  pages_exceeding_link_limit: number;
  link_limit:                 number;
}
