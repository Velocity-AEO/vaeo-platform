/**
 * tools/tracer/freshness_signal_auditor.ts
 *
 * Audits freshness signals (dateModified JSON-LD and article:modified_time OG).
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface FreshnessSignal {
  url:                        string;
  has_date_modified_jsonld:   boolean;
  has_article_modified_og:    boolean;
  date_modified_value:        string | null;
  article_modified_value:     string | null;
  signals_in_sync:            boolean;
  freshness_score:            number;
}

export interface SiteFreshnessAudit {
  pages_audited:              number;
  pages_with_both_signals:    number;
  pages_missing_signals:      number;
  pages_out_of_sync:          number;
  average_freshness_score:    number;
}

// ── extractDateModifiedJSONLD ────────────────────────────────────────────────

export function extractDateModifiedJSONLD(html: string): string | null {
  try {
    if (!html) return null;
    const match = html.match(/"dateModified"\s*:\s*"([^"]+)"/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

// ── extractArticleModifiedOG ─────────────────────────────────────────────────

export function extractArticleModifiedOG(html: string): string | null {
  try {
    if (!html) return null;
    const match = html.match(/<meta\s[^>]*property\s*=\s*["']article:modified_time["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i)
      ?? html.match(/<meta\s[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']article:modified_time["'][^>]*>/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

// ── checkFreshnessSignalsInSync ──────────────────────────────────────────────

export function checkFreshnessSignalsInSync(
  jsonld_date: string | null,
  og_date: string | null,
): boolean {
  try {
    if (!jsonld_date || !og_date) return false;

    const d1 = new Date(jsonld_date).getTime();
    const d2 = new Date(og_date).getTime();

    if (isNaN(d1) || isNaN(d2)) return false;

    const diffMs = Math.abs(d1 - d2);
    const twentyFourHours = 24 * 60 * 60 * 1000;

    return diffMs <= twentyFourHours;
  } catch {
    return false;
  }
}

// ── auditFreshnessSignals ────────────────────────────────────────────────────

export function auditFreshnessSignals(html: string, url: string): FreshnessSignal {
  try {
    const jsonldDate = extractDateModifiedJSONLD(html);
    const ogDate = extractArticleModifiedOG(html);
    const hasJsonld = jsonldDate !== null;
    const hasOg = ogDate !== null;
    const inSync = checkFreshnessSignalsInSync(jsonldDate, ogDate);

    let freshness_score = 0;
    if (hasJsonld && hasOg && inSync) {
      freshness_score = 100;
    } else if (hasJsonld && hasOg) {
      freshness_score = 50;
    } else if (hasJsonld || hasOg) {
      freshness_score = 50;
    }

    return {
      url:                      url ?? '',
      has_date_modified_jsonld: hasJsonld,
      has_article_modified_og:  hasOg,
      date_modified_value:      jsonldDate,
      article_modified_value:   ogDate,
      signals_in_sync:          inSync,
      freshness_score,
    };
  } catch {
    return {
      url:                      url ?? '',
      has_date_modified_jsonld: false,
      has_article_modified_og:  false,
      date_modified_value:      null,
      article_modified_value:   null,
      signals_in_sync:          false,
      freshness_score:          0,
    };
  }
}

// ── auditSiteFreshness ───────────────────────────────────────────────────────

export async function auditSiteFreshness(
  site_id: string,
  deps?: { loadPagesFn?: (site_id: string) => Promise<Array<{ html: string; url: string }>> },
): Promise<SiteFreshnessAudit> {
  try {
    const loadPages = deps?.loadPagesFn ?? defaultLoadPages;
    const pages = await loadPages(site_id);

    if (!pages || pages.length === 0) {
      return { pages_audited: 0, pages_with_both_signals: 0, pages_missing_signals: 0, pages_out_of_sync: 0, average_freshness_score: 0 };
    }

    let bothSignals = 0;
    let missing = 0;
    let outOfSync = 0;
    let totalScore = 0;

    for (const p of pages) {
      const result = auditFreshnessSignals(p.html, p.url);
      totalScore += result.freshness_score;
      if (result.has_date_modified_jsonld && result.has_article_modified_og) {
        bothSignals++;
        if (!result.signals_in_sync) outOfSync++;
      } else {
        missing++;
      }
    }

    return {
      pages_audited:            pages.length,
      pages_with_both_signals:  bothSignals,
      pages_missing_signals:    missing,
      pages_out_of_sync:        outOfSync,
      average_freshness_score:  Math.round(totalScore / pages.length),
    };
  } catch {
    return { pages_audited: 0, pages_with_both_signals: 0, pages_missing_signals: 0, pages_out_of_sync: 0, average_freshness_score: 0 };
  }
}

async function defaultLoadPages(_site_id: string) {
  return [] as Array<{ html: string; url: string }>;
}
