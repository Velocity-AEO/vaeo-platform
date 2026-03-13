/**
 * tools/link_graph/types.ts
 *
 * Shared types for the link graph analysis engine.
 */

export type LinkType =
  | 'body_content'
  | 'breadcrumb'
  | 'sidebar'
  | 'navigation'
  | 'footer'
  | 'pagination';

export interface InternalLink {
  source_url:      string;
  destination_url: string;
  anchor_text:     string | null;
  link_type:       LinkType | string;
  is_nofollow:     boolean;
}

export interface ExternalLink {
  source_url:      string;
  destination_url: string;
  anchor_text:     string | null;
  is_nofollow:     boolean;
}

export interface PageNode {
  url:                    string;
  title:                  string | null;
  depth_from_homepage:    number | null;
  link_equity_score:      number | null;
  inbound_link_count:     number;
  outbound_link_count:    number;
  is_in_sitemap:          boolean;
}
