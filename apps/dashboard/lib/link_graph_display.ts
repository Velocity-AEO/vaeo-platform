/**
 * apps/dashboard/lib/link_graph_display.ts
 *
 * Display logic for link graph tree map visualization.
 * All functions never throw.
 */

// ── Types (inlined for bundler) ──────────────────────────────────────────────

export type AuthorityTier = 'hub' | 'strong' | 'average' | 'weak' | 'isolated';

export type LinkType =
  | 'body_content'
  | 'navigation'
  | 'footer'
  | 'breadcrumb'
  | 'sidebar'
  | 'pagination';

export interface PageNode {
  url:                    string;
  title:                  string | null;
  depth:                  number;
  inbound_internal_count: number;
  outbound_internal_count: number;
  is_orphaned:            boolean;
  is_dead_end:            boolean;
  is_in_sitemap:          boolean;
  health_score:           number | null;
  outbound_link_count:    number;
  link_limit:             number;
}

export interface AuthorityScore {
  url:            string;
  score:          number;
  authority_tier: AuthorityTier;
}

export interface StatusBadge {
  label: string;
  color: string;
}

// ── Node radius ──────────────────────────────────────────────────────────────

export function getNodeRadius(inbound_count: number): number {
  try {
    if (typeof inbound_count !== 'number' || inbound_count < 0) return 8;
    const r = Math.sqrt(inbound_count) * 8;
    return Math.max(8, Math.min(40, r));
  } catch {
    return 8;
  }
}

// ── Node color ───────────────────────────────────────────────────────────────

const TIER_COLORS: Record<AuthorityTier, string> = {
  hub:      '#4F46E5',
  strong:   '#0EA5E9',
  average:  '#10B981',
  weak:     '#F59E0B',
  isolated: '#EF4444',
};

export function getNodeColor(tier: AuthorityTier): string {
  try {
    return TIER_COLORS[tier] ?? '#94A3B8';
  } catch {
    return '#94A3B8';
  }
}

// ── Edge color ───────────────────────────────────────────────────────────────

const EDGE_COLORS: Record<LinkType, string> = {
  body_content: '#94A3B8',
  navigation:   '#CBD5E1',
  footer:       '#CBD5E1',
  breadcrumb:   '#818CF8',
  sidebar:      '#A5B4FC',
  pagination:   '#E2E8F0',
};

export function getEdgeColor(link_type: LinkType): string {
  try {
    return EDGE_COLORS[link_type] ?? '#CBD5E1';
  } catch {
    return '#CBD5E1';
  }
}

// ── Format node tooltip ──────────────────────────────────────────────────────

export function formatNodeTooltip(
  node: PageNode,
  score: AuthorityScore | null,
): string {
  try {
    if (!node) return '';
    const url = truncateUrl(node.url, 40);
    const title = node.title ?? '(no title)';
    const depth = typeof node.depth === 'number' ? node.depth : '—';
    const inbound = node.inbound_internal_count ?? 0;
    const outbound = node.outbound_internal_count ?? 0;
    const tier = score?.authority_tier ?? 'unknown';
    const lines = [
      url,
      title,
      `Inbound: ${inbound} | Outbound: ${outbound}`,
      `Depth: ${depth}`,
      `Authority: ${tier}`,
    ];
    if (node.health_score !== null && node.health_score !== undefined) {
      lines.push(`Health: ${node.health_score}`);
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

// ── Status badges ────────────────────────────────────────────────────────────

export function getStatusBadges(node: PageNode): StatusBadge[] {
  try {
    if (!node) return [];
    const badges: StatusBadge[] = [];
    if (node.is_orphaned) {
      badges.push({ label: 'Orphaned page', color: 'red' });
    }
    if (node.is_dead_end) {
      badges.push({ label: 'Dead end', color: 'orange' });
    }
    if (typeof node.depth === 'number' && node.depth > 3) {
      badges.push({ label: `Deep page (${node.depth} clicks)`, color: 'yellow' });
    }
    if (
      typeof node.outbound_link_count === 'number' &&
      typeof node.link_limit === 'number' &&
      node.outbound_link_count > node.link_limit
    ) {
      badges.push({ label: `Exceeds link limit (${node.outbound_link_count})`, color: 'amber' });
    }
    return badges;
  } catch {
    return [];
  }
}

// ── URL truncation ───────────────────────────────────────────────────────────

export function truncateUrl(url: string, max_length: number): string {
  try {
    if (!url || typeof url !== 'string') return '';
    if (typeof max_length !== 'number' || max_length <= 0) return url;
    // Strip protocol
    let path = url.replace(/^https?:\/\//, '');
    // Strip domain
    const slashIdx = path.indexOf('/');
    if (slashIdx >= 0) {
      path = path.slice(slashIdx);
    }
    if (path.length <= max_length) return path;
    return path.slice(0, max_length - 3) + '...';
  } catch {
    return '';
  }
}

// ── Depth path formatting ────────────────────────────────────────────────────

export function formatDepthPath(path: string[]): string {
  try {
    if (!Array.isArray(path) || path.length === 0) return '';
    if (path.length <= 5) return path.join(' → ');
    return [path[0], path[1], '...', path[path.length - 2], path[path.length - 1]].join(' → ');
  } catch {
    return '';
  }
}
