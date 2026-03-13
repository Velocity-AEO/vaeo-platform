/**
 * tools/link_graph/link_fix_issue_builder.ts
 *
 * Builds SEO issues from link graph analysis results.
 * Converts redirect chains, canonical conflicts, generic anchors,
 * and broken external links into the fix pipeline issue format.
 *
 * Never throws.
 */

import type { RedirectChain } from './redirect_chain_detector.js';
import type { CanonicalConflict } from './canonical_conflict_detector.js';
import type { AnchorTextProfile } from './anchor_text_analyzer.js';
import type { InternalLink } from './types.js';
import type { ExternalLinkCheckResult } from './external_link_checker.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SEOIssue {
  issue_type:      string;
  site_id:         string;
  url:             string;
  title:           string;
  description:     string;
  recommended_fix: string;
  current_value:   string;
  expected_value:  string;
  severity:        'high' | 'medium' | 'low';
  auto_fixable:    boolean;
  confidence:      number;
  detected_at:     string;
}

// ── buildRedirectChainIssue ──────────────────────────────────────────────────

export function buildRedirectChainIssue(
  chain:   RedirectChain,
  site_id: string,
): SEOIssue {
  try {
    const link_url  = chain?.link_url ?? '';
    const final_url = chain?.final_url ?? '';
    const hop_count = chain?.hop_count ?? 0;

    return {
      issue_type:      'REDIRECT_CHAIN_INTERNAL_LINK',
      site_id:         site_id ?? '',
      url:             chain?.source_url ?? '',
      title:           'Redirect chain in internal link',
      description:     `Internal link to ${link_url} redirects ${hop_count} time${hop_count !== 1 ? 's' : ''} before reaching ${final_url}`,
      recommended_fix: `Update link href to ${final_url} to skip redirect chain`,
      current_value:   link_url,
      expected_value:  final_url,
      severity:        'medium',
      auto_fixable:    true,
      confidence:      0.9,
      detected_at:     new Date().toISOString(),
    };
  } catch {
    return {
      issue_type: 'REDIRECT_CHAIN_INTERNAL_LINK', site_id: site_id ?? '', url: '',
      title: 'Redirect chain in internal link', description: 'Redirect chain detected',
      recommended_fix: '', current_value: '', expected_value: '', severity: 'medium',
      auto_fixable: true, confidence: 0.9, detected_at: new Date().toISOString(),
    };
  }
}

// ── buildCanonicalConflictIssue ──────────────────────────────────────────────

export function buildCanonicalConflictIssue(
  conflict: CanonicalConflict,
  site_id:  string,
): SEOIssue | null {
  try {
    if (!conflict) return null;
    if (conflict.fix_action !== 'update_link_to_canonical') return null;

    const linked_url    = conflict.linked_url ?? '';
    const canonical_url = conflict.canonical_url ?? '';

    const severityMap: Record<string, 'high' | 'medium' | 'low'> = {
      high:   'high',
      medium: 'medium',
      low:    'low',
    };
    const severity = severityMap[conflict.equity_impact] ?? 'medium';

    return {
      issue_type:      'CANONICAL_CONFLICT_LINK',
      site_id:         site_id ?? '',
      url:             conflict.source_url ?? '',
      title:           'Internal link to non-canonical URL',
      description:     `Internal link points to ${linked_url} which canonicals to ${canonical_url} — equity is wasted`,
      recommended_fix: `Update link to ${canonical_url}`,
      current_value:   linked_url,
      expected_value:  canonical_url,
      severity,
      auto_fixable:    true,
      confidence:      0.85,
      detected_at:     new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ── buildGenericAnchorIssue ──────────────────────────────────────────────────

export function buildGenericAnchorIssue(
  profile:      AnchorTextProfile,
  worst_source: InternalLink,
  site_id:      string,
): SEOIssue | null {
  try {
    if (!profile || !worst_source) return null;
    if ((profile.generic_anchor_count ?? 0) < 3) return null;

    const destination = profile.destination_url ?? '';
    const count       = profile.generic_anchor_count;
    const anchor      = worst_source.anchor_text ?? 'click here';

    // Generate descriptive anchor from destination URL path
    const destTitle = generateDescriptiveAnchor(destination);

    return {
      issue_type:      'GENERIC_ANCHOR_TEXT',
      site_id:         site_id ?? '',
      url:             worst_source.source_url ?? '',
      title:           'Generic anchor text on internal links',
      description:     `${count} links to ${destination} use generic anchor text (click here, read more, etc.)`,
      recommended_fix: `Replace generic anchors with descriptive text about ${destTitle}`,
      current_value:   anchor,
      expected_value:  destTitle,
      severity:        'low',
      auto_fixable:    true,
      confidence:      0.8,
      detected_at:     new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function generateDescriptiveAnchor(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/$/, '');
    const last = path.split('/').filter(Boolean).pop() ?? '';
    return last.replace(/[-_]/g, ' ').replace(/\.\w+$/, '') || 'the destination page';
  } catch {
    return 'the destination page';
  }
}

// ── buildBrokenExternalIssue ─────────────────────────────────────────────────

export function buildBrokenExternalIssue(
  check:   ExternalLinkCheckResult,
  site_id: string,
): SEOIssue {
  try {
    const dest   = check?.destination_url ?? '';
    const status = check?.status_code;
    const label  = status != null ? `returns ${status}` : 'is unreachable';

    return {
      issue_type:      'BROKEN_EXTERNAL_LINK_REMOVE',
      site_id:         site_id ?? '',
      url:             check?.url ?? '',
      title:           'Broken external link',
      description:     `External link to ${dest} ${label}`,
      recommended_fix: 'Remove broken external link',
      current_value:   dest,
      expected_value:  'removed',
      severity:        'medium',
      auto_fixable:    true,
      confidence:      0.85,
      detected_at:     new Date().toISOString(),
    };
  } catch {
    return {
      issue_type: 'BROKEN_EXTERNAL_LINK_REMOVE', site_id: site_id ?? '', url: '',
      title: 'Broken external link', description: 'Broken external link detected',
      recommended_fix: 'Remove broken external link', current_value: '', expected_value: 'removed',
      severity: 'medium', auto_fixable: true, confidence: 0.85, detected_at: new Date().toISOString(),
    };
  }
}

// ── buildAllLinkGraphIssues ──────────────────────────────────────────────────

export interface LinkGraphIssueDeps {
  loadChainsFn?:    (site_id: string) => Promise<RedirectChain[]>;
  loadConflictsFn?: (site_id: string) => Promise<CanonicalConflict[]>;
  loadAnchorsFn?:   (site_id: string) => Promise<{ profiles: AnchorTextProfile[]; links: InternalLink[] }>;
  loadChecksFn?:    (site_id: string) => Promise<ExternalLinkCheckResult[]>;
}

export async function buildAllLinkGraphIssues(
  site_id: string,
  deps?:   LinkGraphIssueDeps,
): Promise<SEOIssue[]> {
  try {
    if (!site_id) return [];

    const loadChains    = deps?.loadChainsFn ?? (async () => [] as RedirectChain[]);
    const loadConflicts = deps?.loadConflictsFn ?? (async () => [] as CanonicalConflict[]);
    const loadAnchors   = deps?.loadAnchorsFn ?? (async () => ({ profiles: [] as AnchorTextProfile[], links: [] as InternalLink[] }));
    const loadChecks    = deps?.loadChecksFn ?? (async () => [] as ExternalLinkCheckResult[]);

    const [chains, conflicts, anchorData, checks] = await Promise.all([
      loadChains(site_id).catch(() => [] as RedirectChain[]),
      loadConflicts(site_id).catch(() => [] as CanonicalConflict[]),
      loadAnchors(site_id).catch(() => ({ profiles: [] as AnchorTextProfile[], links: [] as InternalLink[] })),
      loadChecks(site_id).catch(() => [] as ExternalLinkCheckResult[]),
    ]);

    const issues: SEOIssue[] = [];
    const seen = new Set<string>();

    // Redirect chains
    for (const chain of (chains ?? [])) {
      const issue = buildRedirectChainIssue(chain, site_id);
      const key = `${issue.issue_type}:${issue.url}:${issue.current_value}`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push(issue);
      }
    }

    // Canonical conflicts
    for (const conflict of (conflicts ?? [])) {
      const issue = buildCanonicalConflictIssue(conflict, site_id);
      if (issue) {
        const key = `${issue.issue_type}:${issue.url}:${issue.current_value}`;
        if (!seen.has(key)) {
          seen.add(key);
          issues.push(issue);
        }
      }
    }

    // Generic anchors — find worst source for each profile with 3+ generics
    const profiles = anchorData?.profiles ?? [];
    const links    = anchorData?.links ?? [];
    for (const profile of profiles) {
      if ((profile?.generic_anchor_count ?? 0) < 3) continue;
      // Find the worst (first generic) source link for this destination
      const genericLink = links.find(
        l => l?.destination_url === profile.destination_url &&
             l?.anchor_text &&
             ['click here', 'here', 'read more', 'learn more', 'more', 'this',
              'link', 'click', 'visit', 'go here', 'this page', 'this post',
              'this article', 'continue reading'].includes((l.anchor_text ?? '').toLowerCase().trim()),
      );
      if (genericLink) {
        const issue = buildGenericAnchorIssue(profile, genericLink, site_id);
        if (issue) {
          const key = `${issue.issue_type}:${issue.url}:${profile.destination_url}`;
          if (!seen.has(key)) {
            seen.add(key);
            issues.push(issue);
          }
        }
      }
    }

    // Broken external links
    for (const check of (checks ?? [])) {
      if (!check?.is_broken) continue;
      const issue = buildBrokenExternalIssue(check, site_id);
      const key = `${issue.issue_type}:${issue.url}:${issue.current_value}`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push(issue);
      }
    }

    // Sort by severity desc (high > medium > low)
    const severityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
    issues.sort((a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0));

    return issues;
  } catch {
    return [];
  }
}
