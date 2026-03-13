/**
 * tools/orphaned/orphaned_page_issue_builder.ts
 *
 * Builds structured issue objects for orphaned pages (pages with no
 * inbound internal links). Orphaned pages hurt crawlability and reduce
 * ranking potential for intentional content.
 *
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrphanedPageIssue {
  site_id:              string;
  url:                  string;
  issue_type:           'ORPHANED_PAGE';
  severity:             'low';
  detected_at:          string;
  internal_link_count:  number;
  page_title:           string | null;
  suggested_fix:        string;
  fix_type:             'INTERNAL_LINK_SUGGESTION' | 'SITEMAP_INCLUSION';
  confidence:           number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ── buildOrphanedPageIssue ────────────────────────────────────────────────────

export function buildOrphanedPageIssue(
  site_id:              string,
  url:                  string,
  page_title:           string | null,
  internal_link_count:  number,
): OrphanedPageIssue {
  try {
    const domain = extractDomain(url ?? '');
    return {
      site_id:             site_id ?? '',
      url:                 url ?? '',
      issue_type:          'ORPHANED_PAGE',
      severity:            'low',
      detected_at:         new Date().toISOString(),
      internal_link_count: internal_link_count ?? 0,
      page_title:          page_title ?? null,
      suggested_fix:       `Add internal links to this page from related content on ${domain}`,
      fix_type:            'INTERNAL_LINK_SUGGESTION',
      confidence:          0.95,
    };
  } catch {
    return {
      site_id:             site_id ?? '',
      url:                 url ?? '',
      issue_type:          'ORPHANED_PAGE',
      severity:            'low',
      detected_at:         new Date().toISOString(),
      internal_link_count: 0,
      page_title:          null,
      suggested_fix:       `Add internal links to this page from related content`,
      fix_type:            'INTERNAL_LINK_SUGGESTION',
      confidence:          0.95,
    };
  }
}

// ── buildOrphanedPageIssues ───────────────────────────────────────────────────

export function buildOrphanedPageIssues(
  site_id:        string,
  orphaned_pages: Array<{
    url:                 string;
    page_title:          string | null;
    internal_link_count: number;
  }>,
): OrphanedPageIssue[] {
  try {
    if (!Array.isArray(orphaned_pages)) return [];
    return orphaned_pages.map(p =>
      buildOrphanedPageIssue(site_id, p.url, p.page_title, p.internal_link_count),
    );
  } catch {
    return [];
  }
}

// ── prioritizeOrphanedPages ───────────────────────────────────────────────────

export function prioritizeOrphanedPages(
  issues: OrphanedPageIssue[],
): OrphanedPageIssue[] {
  try {
    if (!Array.isArray(issues)) return [];
    return [...issues].sort((a, b) => {
      // Titled pages first (more likely intentional content)
      const aHasTitle = a.page_title != null ? 0 : 1;
      const bHasTitle = b.page_title != null ? 0 : 1;
      if (aHasTitle !== bHasTitle) return aHasTitle - bHasTitle;
      // Then alphabetically by URL
      return (a.url ?? '').localeCompare(b.url ?? '');
    });
  } catch {
    return [];
  }
}
