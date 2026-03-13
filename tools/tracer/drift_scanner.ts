/**
 * tools/tracer/drift_scanner.ts
 *
 * Drift detection engine.
 * Detects when previously applied fixes have been overwritten by theme
 * updates, plugin updates, or CMS edits. A fix that doesn't stick is not a fix.
 *
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type DriftStatus = 'stable' | 'drifted' | 'unknown';

export interface DriftEvent {
  fix_id:             string;
  site_id:            string;
  url:                string;
  issue_type:         string;
  original_value:     string;
  expected_value:     string;
  current_value:      string | null;
  drift_status:       DriftStatus;
  drift_detected_at:  string;
  applied_at:         string;
  days_since_fix:     number;
  probable_cause:     string | null;
}

export interface DriftScanResult {
  site_id:             string;
  scanned_at:          string;
  fixes_scanned:       number;
  stable_fixes:        number;
  drifted_fixes:       number;
  unknown_fixes:       number;
  drift_rate:          number;
  drift_events:        DriftEvent[];
  most_probable_cause: string | null;
}

// ── DRIFT_PROBABLE_CAUSES ─────────────────────────────────────────────────────

export const DRIFT_PROBABLE_CAUSES: Record<string, string> = {
  theme_update:  'Theme update overwrote fix',
  plugin_update: 'Plugin update overwrote fix',
  cms_edit:      'Manual CMS edit removed fix',
  cache_issue:   'Cached version serving old content',
  cdn_issue:     'CDN serving stale content',
  unknown:       'Unknown — fix was overwritten',
};

// ── detectDriftCause ──────────────────────────────────────────────────────────

/**
 * Heuristically determines why a fix drifted.
 * Examines HTML signals: generator tags, theme class patterns, content diff size.
 */
export function detectDriftCause(
  original_html: string | null,
  current_html:  string,
  _issue_type:    string,
): string {
  try {
    const orig = original_html ?? '';
    const curr = current_html  ?? '';

    // Theme update: generator tag changed or theme-specific class changed
    const origGenerator = orig.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? '';
    const currGenerator = curr.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? '';

    if (origGenerator && currGenerator && origGenerator !== currGenerator) {
      // Check if version number changed (plugin update) vs theme name changed (theme update)
      const origParts = origGenerator.split(/[\s\/]/);
      const currParts = currGenerator.split(/[\s\/]/);
      // Same base product, different version → plugin update
      if (origParts[0] && currParts[0] && origParts[0] === currParts[0] && origParts[1] !== currParts[1]) {
        return 'plugin_update';
      }
      // Different generator entirely → theme update
      return 'theme_update';
    }

    // Theme update: theme body class changed
    const origThemeClass = orig.match(/class=["'][^"']*theme-[a-z0-9-]+/i)?.[0] ?? '';
    const currThemeClass = curr.match(/class=["'][^"']*theme-[a-z0-9-]+/i)?.[0] ?? '';
    if (origThemeClass && currThemeClass && origThemeClass !== currThemeClass) {
      return 'theme_update';
    }

    // CMS edit: content changed substantially (>30% of characters differ)
    if (orig.length > 0 && curr.length > 0) {
      const longer = Math.max(orig.length, curr.length);
      const shorter = Math.min(orig.length, curr.length);
      const lengthDiffRatio = (longer - shorter) / longer;
      if (lengthDiffRatio > 0.30) {
        return 'cms_edit';
      }
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── checkFixPresence ──────────────────────────────────────────────────────────

/**
 * Checks whether a previously applied fix is still present in current HTML.
 * Mirrors logic from wp_delta_verify for cross-platform consistency.
 */
export function checkFixPresence(
  current_html:   string,
  issue_type:     string,
  expected_value: string,
): boolean {
  try {
    const h    = current_html   ?? '';
    const type = (issue_type    ?? '').toUpperCase();
    const val  = expected_value ?? '';

    // ── Title ──────────────────────────────────────────────────────────────
    if (type === 'TITLE_MISSING' || type === 'TITLE_LONG' || type === 'TITLE_SHORT') {
      const m = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (!m) return false;
      return m[1]!.trim().toLowerCase().includes(val.toLowerCase());
    }

    // ── Meta description ───────────────────────────────────────────────────
    if (type === 'META_DESC_MISSING' || type === 'META_DESC_LONG') {
      const m = h.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
             ?? h.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
      if (!m) return false;
      return m[1]!.trim().toLowerCase().includes(val.toLowerCase());
    }

    // ── JSON-LD schema ─────────────────────────────────────────────────────
    if (type === 'SCHEMA_MISSING' || type === 'SCHEMA_INVALID') {
      return /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i.test(h);
    }

    // ── Canonical ──────────────────────────────────────────────────────────
    if (type === 'CANONICAL_MISSING' || type === 'CANONICAL_WRONG') {
      const m = h.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
             ?? h.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
      if (!m) return false;
      if (!val) return true;
      return m[1]!.trim().toLowerCase().includes(val.toLowerCase());
    }

    // ── OG tags ────────────────────────────────────────────────────────────
    if (type === 'OG_MISSING' || type === 'OG_TITLE' || type === 'OG_DESC') {
      return /<meta[^>]+property=["']og:/i.test(h);
    }

    // ── Speakable schema ───────────────────────────────────────────────────
    if (type === 'SPEAKABLE_MISSING') {
      return /"@type"\s*:\s*"SpeakableSpecification"/i.test(h)
          || /"speakable"/i.test(h);
    }

    // ── Alt text ───────────────────────────────────────────────────────────
    if (type === 'ALT_MISSING') {
      // Check that images with the expected src have alt text
      if (val) {
        const re = new RegExp(`<img[^>]+alt=["'][^"']+["'][^>]+src=["'][^"']*${val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        return re.test(h);
      }
      // Fallback: check any img has alt attribute
      return /<img[^>]+alt=["'][^"']*["']/i.test(h);
    }

    // ── Robots noindex ─────────────────────────────────────────────────────
    if (type === 'ROBOTS_NOINDEX' || type === 'ROBOTS_DISALLOW') {
      // Fix is "present" when noindex is NOT in the page (we removed it)
      return !/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(h)
          && !/content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots["']/i.test(h);
    }

    // ── Default: check for expected_value substring ────────────────────────
    if (val) return h.toLowerCase().includes(val.toLowerCase());
    return false;
  } catch {
    return false;
  }
}

// ── calculateDriftRate ────────────────────────────────────────────────────────

export function calculateDriftRate(total: number, drifted: number): number {
  try {
    if (!total || total <= 0) return 0;
    const rate = (drifted / total) * 100;
    return Math.min(100, Math.max(0, Math.round(rate * 10) / 10));
  } catch {
    return 0;
  }
}

// ── getMostProbableCause ──────────────────────────────────────────────────────

export function getMostProbableCause(events: DriftEvent[]): string | null {
  try {
    if (!Array.isArray(events) || events.length === 0) return null;
    const counts: Record<string, number> = {};
    for (const e of events) {
      if (!e.probable_cause) continue;
      counts[e.probable_cause] = (counts[e.probable_cause] ?? 0) + 1;
    }
    const entries = Object.entries(counts);
    if (entries.length === 0) return null;
    return entries.sort((a, b) => b[1] - a[1])[0]![0];
  } catch {
    return null;
  }
}

// ── scanFixForDrift ───────────────────────────────────────────────────────────

export async function scanFixForDrift(
  fix: {
    fix_id:         string;
    site_id:        string;
    url:            string;
    issue_type:     string;
    expected_value: string;
    original_value: string;
    applied_at:     string;
  },
  current_html: string,
  deps?: {
    checkFn?: (html: string, issue_type: string, expected: string) => boolean;
    causeFn?: (original: string | null, current: string, issue_type: string) => string;
  },
): Promise<DriftEvent> {
  const detected_at = new Date().toISOString();

  try {
    const checkFn = deps?.checkFn ?? checkFixPresence;
    const causeFn = deps?.causeFn ?? detectDriftCause;

    const isPresent = checkFn(current_html, fix.issue_type, fix.expected_value);

    const appliedMs    = new Date(fix.applied_at).getTime();
    const nowMs        = Date.now();
    const days_since   = isNaN(appliedMs) ? 0 : Math.floor((nowMs - appliedMs) / 86400000);

    const drift_status: DriftStatus = isPresent ? 'stable' : 'drifted';
    const probable_cause = isPresent
      ? null
      : causeFn(fix.original_value ?? null, current_html, fix.issue_type);

    // Extract current value for reporting
    let current_value: string | null = null;
    try {
      const type = (fix.issue_type ?? '').toUpperCase();
      if (type.startsWith('TITLE')) {
        current_value = current_html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
      } else if (type.startsWith('META_DESC')) {
        current_value = current_html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ?? null;
      }
    } catch {
      // non-fatal
    }

    return {
      fix_id:            fix.fix_id,
      site_id:           fix.site_id,
      url:               fix.url,
      issue_type:        fix.issue_type,
      original_value:    fix.original_value,
      expected_value:    fix.expected_value,
      current_value,
      drift_status,
      drift_detected_at: detected_at,
      applied_at:        fix.applied_at,
      days_since_fix:    days_since,
      probable_cause,
    };
  } catch {
    return {
      fix_id:            fix?.fix_id   ?? 'unknown',
      site_id:           fix?.site_id  ?? 'unknown',
      url:               fix?.url      ?? '',
      issue_type:        fix?.issue_type ?? '',
      original_value:    fix?.original_value ?? '',
      expected_value:    fix?.expected_value ?? '',
      current_value:     null,
      drift_status:      'unknown',
      drift_detected_at: detected_at,
      applied_at:        fix?.applied_at ?? '',
      days_since_fix:    0,
      probable_cause:    null,
    };
  }
}

// ── runDriftScan ──────────────────────────────────────────────────────────────

export async function runDriftScan(
  site_id: string,
  deps?: {
    loadFixesFn?: (site_id: string) => Promise<Array<{
      fix_id: string; site_id: string; url: string;
      issue_type: string; expected_value: string;
      original_value: string; applied_at: string;
    }>>;
    fetchHTMLFn?: (url: string) => Promise<string>;
    scanFn?: typeof scanFixForDrift;
  },
): Promise<DriftScanResult> {
  const scanned_at = new Date().toISOString();

  try {
    const loadFixes  = deps?.loadFixesFn ?? defaultLoadFixes;
    const fetchHTML  = deps?.fetchHTMLFn ?? defaultFetchHTML;
    const scan       = deps?.scanFn      ?? scanFixForDrift;

    const fixes = await loadFixes(site_id).catch(() => []);
    const drift_events: DriftEvent[] = [];

    for (const fix of fixes) {
      try {
        const html  = await fetchHTML(fix.url).catch(() => '');
        const event = await scan(fix, html);
        drift_events.push(event);
      } catch {
        // skip this fix on error
      }
    }

    const stable_fixes  = drift_events.filter(e => e.drift_status === 'stable').length;
    const drifted_fixes = drift_events.filter(e => e.drift_status === 'drifted').length;
    const unknown_fixes = drift_events.filter(e => e.drift_status === 'unknown').length;
    const drift_rate    = calculateDriftRate(drift_events.length, drifted_fixes);

    return {
      site_id,
      scanned_at,
      fixes_scanned:       drift_events.length,
      stable_fixes,
      drifted_fixes,
      unknown_fixes,
      drift_rate,
      drift_events,
      most_probable_cause: getMostProbableCause(drift_events.filter(e => e.drift_status === 'drifted')),
    };
  } catch {
    return {
      site_id:             site_id ?? '',
      scanned_at,
      fixes_scanned:       0,
      stable_fixes:        0,
      drifted_fixes:       0,
      unknown_fixes:       0,
      drift_rate:          0,
      drift_events:        [],
      most_probable_cause: null,
    };
  }
}

// ── Defaults ──────────────────────────────────────────────────────────────────

async function defaultLoadFixes(_site_id: string) {
  return [] as Array<{
    fix_id: string; site_id: string; url: string;
    issue_type: string; expected_value: string;
    original_value: string; applied_at: string;
  }>;
}

async function defaultFetchHTML(_url: string): Promise<string> {
  return '';
}
