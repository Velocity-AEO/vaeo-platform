/**
 * tools/link_graph/link_graph_exporter.ts
 *
 * CSV/JSON export engine for link graph data.
 * All functions are pure and injectable. Never throws.
 */

import type { PageNode, InternalLink, ExternalLink } from './link_graph_types.js';
import type { AuthorityScore } from './authority_scorer.js';
import type { LinkSuggestion } from './link_suggester.js';
import type { ExternalLinkCheckResult } from './external_link_checker.js';
import type { LinkVelocityTrend } from './link_velocity_tracker.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type ExportFormat = 'csv' | 'json';

export interface LinkGraphExport {
  site_id:      string;
  export_type:  string;
  format:       ExportFormat;
  row_count:    number;
  generated_at: string;
  data:         string;
}

// ── CSV Headers ──────────────────────────────────────────────────────────────

export const PAGE_NODES_CSV_HEADERS: string[] = [
  'URL',
  'Title',
  'Depth From Homepage',
  'Inbound Internal Links',
  'Outbound Internal Links',
  'Outbound External Links',
  'Total Links',
  'Authority Score',
  'Authority Tier',
  'Is Orphaned',
  'Is Dead End',
  'Is In Sitemap',
  'Is Paginated',
  'Has Redirect Chain',
  'Link Equity Score',
  'Last Crawled',
];

export const INTERNAL_LINKS_CSV_HEADERS: string[] = [
  'Source URL',
  'Destination URL',
  'Anchor Text',
  'Link Type',
  'Link Source',
  'Is Nofollow',
  'Is Redirect',
  'Redirect Destination',
  'Position In Page',
];

export const EXTERNAL_LINKS_CSV_HEADERS: string[] = [
  'Source URL',
  'Destination URL',
  'Destination Domain',
  'Anchor Text',
  'Is Nofollow',
  'Status Code',
  'Is Broken',
  'Domain Reputation',
];

export const LINK_OPPORTUNITIES_CSV_HEADERS: string[] = [
  'Priority',
  'Source URL',
  'Source Title',
  'Destination URL',
  'Destination Title',
  'Suggested Anchor Text',
  'Reason',
  'Destination Authority Score',
];

export const VELOCITY_CSV_HEADERS: string[] = [
  'URL',
  'Current Inbound',
  'Change 7 Days',
  'Change 30 Days',
  'Pct Change 7 Days',
  'Trend Type',
  'Is Hub Page',
  'Alert Required',
  'Alert Reason',
  'Authority Score',
];

// ── Row converters ────────────────────────────────────────────────────────────

function boolStr(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  return v ? 'Yes' : 'No';
}

function nullStr(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

export function pageNodeToCSVRow(
  node:  PageNode,
  score: AuthorityScore | null,
): string[] {
  try {
    if (!node) return new Array(PAGE_NODES_CSV_HEADERS.length).fill('');
    return [
      nullStr(node.url),
      nullStr(node.title),
      nullStr(node.depth_from_homepage),
      nullStr(node.inbound_internal_count),
      nullStr(node.outbound_internal_count),
      nullStr(node.outbound_external_count),
      nullStr(node.total_link_count),
      nullStr(score?.normalized_score ?? null),
      nullStr(score?.authority_tier ?? null),
      boolStr(node.is_orphaned),
      boolStr(node.is_dead_end),
      boolStr(node.is_in_sitemap),
      boolStr(node.is_paginated),
      boolStr(node.has_redirect_chain),
      nullStr(node.link_equity_score),
      nullStr(node.last_crawled_at),
    ];
  } catch {
    return new Array(PAGE_NODES_CSV_HEADERS.length).fill('');
  }
}

export function internalLinkToCSVRow(link: InternalLink): string[] {
  try {
    if (!link) return new Array(INTERNAL_LINKS_CSV_HEADERS.length).fill('');
    return [
      nullStr(link.source_url),
      nullStr(link.destination_url),
      nullStr(link.anchor_text),
      nullStr(link.link_type),
      nullStr(link.link_source),
      boolStr(link.is_nofollow),
      boolStr(link.is_redirect),
      nullStr(link.redirect_destination),
      nullStr(link.position_in_page),
    ];
  } catch {
    return new Array(INTERNAL_LINKS_CSV_HEADERS.length).fill('');
  }
}

export function externalLinkToCSVRow(
  link:  ExternalLink,
  check: ExternalLinkCheckResult | null,
): string[] {
  try {
    if (!link) return new Array(EXTERNAL_LINKS_CSV_HEADERS.length).fill('');
    const statusCode     = check?.status_code  ?? link.status_code;
    const isBroken       = check?.is_broken    ?? link.is_broken;
    const domainRep      = check?.domain_reputation ?? '';
    return [
      nullStr(link.source_url),
      nullStr(link.destination_url),
      nullStr(link.destination_domain),
      nullStr(link.anchor_text),
      boolStr(link.is_nofollow),
      nullStr(statusCode),
      boolStr(isBroken),
      nullStr(domainRep),
    ];
  } catch {
    return new Array(EXTERNAL_LINKS_CSV_HEADERS.length).fill('');
  }
}

export function suggestionToCSVRow(suggestion: LinkSuggestion): string[] {
  try {
    if (!suggestion) return new Array(LINK_OPPORTUNITIES_CSV_HEADERS.length).fill('');
    return [
      nullStr(suggestion.priority),
      nullStr(suggestion.source_url),
      nullStr(suggestion.source_title),
      nullStr(suggestion.destination_url),
      nullStr(suggestion.destination_title),
      nullStr(suggestion.suggested_anchor_text),
      nullStr(suggestion.suggestion_reason),
      nullStr(suggestion.destination_authority_score),
    ];
  } catch {
    return new Array(LINK_OPPORTUNITIES_CSV_HEADERS.length).fill('');
  }
}

export function velocityTrendToCSVRow(trend: LinkVelocityTrend): string[] {
  try {
    if (!trend) return new Array(VELOCITY_CSV_HEADERS.length).fill('');
    return [
      nullStr(trend.url),
      nullStr(trend.current_inbound),
      nullStr(trend.change_7d),
      nullStr(trend.change_30d),
      nullStr(trend.pct_change_7d),
      nullStr(trend.trend_type),
      boolStr(trend.is_hub_page),
      boolStr(trend.alert_required),
      nullStr(trend.alert_reason),
      nullStr(trend.authority_score),
    ];
  } catch {
    return new Array(VELOCITY_CSV_HEADERS.length).fill('');
  }
}

// ── buildCSV ──────────────────────────────────────────────────────────────────

export function buildCSV(headers: string[], rows: string[][]): string {
  try {
    function escapeCell(val: string): string {
      const s = val == null ? '' : String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    const allRows = [headers, ...rows];
    return allRows.map((r) => (r ?? []).map(escapeCell).join(',')).join('\n');
  } catch {
    return (headers ?? []).join(',');
  }
}

// ── Export builders ──────────────────────────────────────────────────────────

export function exportPageNodes(
  nodes:  PageNode[],
  scores: AuthorityScore[],
): LinkGraphExport {
  try {
    const safeNodes  = Array.isArray(nodes)  ? nodes  : [];
    const safeScores = Array.isArray(scores) ? scores : [];
    const scoreMap   = new Map(safeScores.map((s) => [s.url, s]));
    const rows       = safeNodes.map((n) => pageNodeToCSVRow(n, scoreMap.get(n?.url ?? '') ?? null));
    const data       = buildCSV(PAGE_NODES_CSV_HEADERS, rows);
    return {
      site_id:      '',
      export_type:  'page_nodes',
      format:       'csv',
      row_count:    safeNodes.length,
      generated_at: new Date().toISOString(),
      data,
    };
  } catch {
    return { site_id: '', export_type: 'page_nodes', format: 'csv', row_count: 0, generated_at: new Date().toISOString(), data: PAGE_NODES_CSV_HEADERS.join(',') };
  }
}

export function exportInternalLinks(links: InternalLink[]): LinkGraphExport {
  try {
    const safe = Array.isArray(links) ? links : [];
    const rows = safe.map((l) => internalLinkToCSVRow(l));
    const data = buildCSV(INTERNAL_LINKS_CSV_HEADERS, rows);
    return {
      site_id:      '',
      export_type:  'internal_links',
      format:       'csv',
      row_count:    safe.length,
      generated_at: new Date().toISOString(),
      data,
    };
  } catch {
    return { site_id: '', export_type: 'internal_links', format: 'csv', row_count: 0, generated_at: new Date().toISOString(), data: INTERNAL_LINKS_CSV_HEADERS.join(',') };
  }
}

export function exportExternalLinks(
  links:  ExternalLink[],
  checks: ExternalLinkCheckResult[],
): LinkGraphExport {
  try {
    const safeLinks  = Array.isArray(links)  ? links  : [];
    const safeChecks = Array.isArray(checks) ? checks : [];
    const checkMap   = new Map(safeChecks.map((c) => [c.destination_url, c]));
    const rows       = safeLinks.map((l) => externalLinkToCSVRow(l, checkMap.get(l?.destination_url ?? '') ?? null));
    const data       = buildCSV(EXTERNAL_LINKS_CSV_HEADERS, rows);
    return {
      site_id:      '',
      export_type:  'external_links',
      format:       'csv',
      row_count:    safeLinks.length,
      generated_at: new Date().toISOString(),
      data,
    };
  } catch {
    return { site_id: '', export_type: 'external_links', format: 'csv', row_count: 0, generated_at: new Date().toISOString(), data: EXTERNAL_LINKS_CSV_HEADERS.join(',') };
  }
}

export function exportLinkOpportunities(suggestions: LinkSuggestion[]): LinkGraphExport {
  try {
    const safe = Array.isArray(suggestions) ? suggestions : [];
    const rows = safe.map((s) => suggestionToCSVRow(s));
    const data = buildCSV(LINK_OPPORTUNITIES_CSV_HEADERS, rows);
    return {
      site_id:      '',
      export_type:  'link_opportunities',
      format:       'csv',
      row_count:    safe.length,
      generated_at: new Date().toISOString(),
      data,
    };
  } catch {
    return { site_id: '', export_type: 'link_opportunities', format: 'csv', row_count: 0, generated_at: new Date().toISOString(), data: LINK_OPPORTUNITIES_CSV_HEADERS.join(',') };
  }
}

export function exportVelocityTrends(trends: LinkVelocityTrend[]): LinkGraphExport {
  try {
    const safe = Array.isArray(trends) ? trends : [];
    const rows = safe.map((t) => velocityTrendToCSVRow(t));
    const data = buildCSV(VELOCITY_CSV_HEADERS, rows);
    return {
      site_id:      '',
      export_type:  'velocity_trends',
      format:       'csv',
      row_count:    safe.length,
      generated_at: new Date().toISOString(),
      data,
    };
  } catch {
    return { site_id: '', export_type: 'velocity_trends', format: 'csv', row_count: 0, generated_at: new Date().toISOString(), data: VELOCITY_CSV_HEADERS.join(',') };
  }
}

// ── exportFullLinkReport ──────────────────────────────────────────────────────

export interface FullLinkReportDeps {
  loadGraphFn?:       (site_id: string) => Promise<{ pages: PageNode[]; internal_links: InternalLink[]; external_links: ExternalLink[] } | null>;
  loadScoresFn?:      (site_id: string) => Promise<AuthorityScore[]>;
  loadChecksFn?:      (site_id: string) => Promise<ExternalLinkCheckResult[]>;
  loadSuggestionsFn?: (site_id: string) => Promise<LinkSuggestion[]>;
  loadVelocityFn?:    (site_id: string) => Promise<LinkVelocityTrend[]>;
}

export async function exportFullLinkReport(
  site_id: string,
  deps?:   FullLinkReportDeps,
): Promise<{
  page_nodes:     LinkGraphExport;
  internal_links: LinkGraphExport;
  external_links: LinkGraphExport;
  opportunities:  LinkGraphExport;
  velocity:       LinkGraphExport;
  generated_at:   string;
}> {
  const generated_at = new Date().toISOString();
  try {
    const loadGraph       = deps?.loadGraphFn       ?? (() => Promise.resolve(null));
    const loadScores      = deps?.loadScoresFn      ?? (() => Promise.resolve([]));
    const loadChecks      = deps?.loadChecksFn      ?? (() => Promise.resolve([]));
    const loadSuggestions = deps?.loadSuggestionsFn ?? (() => Promise.resolve([]));
    const loadVelocity    = deps?.loadVelocityFn    ?? (() => Promise.resolve([]));

    const [graph, scores, checks, suggestions, velocity] = await Promise.all([
      loadGraph(site_id).catch(() => null),
      loadScores(site_id).catch(() => [] as AuthorityScore[]),
      loadChecks(site_id).catch(() => [] as ExternalLinkCheckResult[]),
      loadSuggestions(site_id).catch(() => [] as LinkSuggestion[]),
      loadVelocity(site_id).catch(() => [] as LinkVelocityTrend[]),
    ]);

    const page_nodes_export     = exportPageNodes(graph?.pages ?? [], scores);
    const internal_links_export = exportInternalLinks(graph?.internal_links ?? []);
    const external_links_export = exportExternalLinks(graph?.external_links ?? [], checks);
    const opportunities_export  = exportLinkOpportunities(suggestions);
    const velocity_export       = exportVelocityTrends(velocity);

    // Stamp site_id
    page_nodes_export.site_id     = site_id ?? '';
    internal_links_export.site_id = site_id ?? '';
    external_links_export.site_id = site_id ?? '';
    opportunities_export.site_id  = site_id ?? '';
    velocity_export.site_id       = site_id ?? '';

    return {
      page_nodes:     page_nodes_export,
      internal_links: internal_links_export,
      external_links: external_links_export,
      opportunities:  opportunities_export,
      velocity:       velocity_export,
      generated_at,
    };
  } catch {
    const empty = (type: string): LinkGraphExport => ({
      site_id:      site_id ?? '',
      export_type:  type,
      format:       'csv',
      row_count:    0,
      generated_at,
      data:         '',
    });
    return {
      page_nodes:     empty('page_nodes'),
      internal_links: empty('internal_links'),
      external_links: empty('external_links'),
      opportunities:  empty('link_opportunities'),
      velocity:       empty('velocity_trends'),
      generated_at,
    };
  }
}
