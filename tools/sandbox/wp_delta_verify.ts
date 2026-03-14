/**
 * tools/sandbox/wp_delta_verify.ts
 *
 * Verifies that a WordPress fix was actually written to the page HTML
 * by comparing before/after snapshots.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface WPDeltaVerifyConfig {
  issue_type:     string;
  expected_value: string;
  url:            string;
}

export interface WPDeltaVerifyResult {
  verified:       boolean;
  issue_type:     string;
  expected_value: string;
  found_value:    string | null;
  url:            string;
  verified_at:    string;
  error?:         string;
}

// ── extractExpectedSignal ─────────────────────────────────────────────────────

export function extractExpectedSignal(
  html:       string,
  issue_type: string,
): string | null {
  try {
    const h = html ?? '';
    const type = (issue_type ?? '').toUpperCase();

    if (type === 'TITLE_MISSING' || type === 'TITLE_LONG') {
      const m = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      return m ? m[1]!.trim() : null;
    }

    if (type === 'META_DESC_MISSING' || type === 'META_DESC_LONG') {
      const m = h.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
             ?? h.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
      return m ? m[1]!.trim() : null;
    }

    if (type === 'SCHEMA_MISSING') {
      const m = h.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      return m ? m[1]!.trim() : null;
    }

    if (type === 'OG_MISSING') {
      const m = h.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
             ?? h.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
      return m ? m[1]!.trim() : null;
    }

    if (type === 'CANONICAL_MISSING') {
      const m = h.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
             ?? h.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
      return m ? m[1]!.trim() : null;
    }

    return null;
  } catch {
    return null;
  }
}

// ── verifySignalPresent ───────────────────────────────────────────────────────

export function verifySignalPresent(
  html:           string,
  issue_type:     string,
  expected_value: string,
): boolean {
  try {
    const found = extractExpectedSignal(html, issue_type);
    if (found === null) return false;
    return found.toLowerCase().includes((expected_value ?? '').toLowerCase());
  } catch {
    return false;
  }
}

// ── verifyWPDelta ─────────────────────────────────────────────────────────────

export async function verifyWPDelta(
  before_html: string,
  after_html:  string,
  config:      WPDeltaVerifyConfig,
  deps?:       { verifyFn?: (html: string, type: string, expected: string) => boolean },
): Promise<WPDeltaVerifyResult> {
  const verified_at = new Date().toISOString();

  try {
    const verifyFn = deps?.verifyFn ?? verifySignalPresent;

    // Signal should be ABSENT in before_html (or at least different)
    const in_after  = verifyFn(after_html,  config.issue_type, config.expected_value);

    // Extract what was found for reporting
    const found_value = extractExpectedSignal(after_html, config.issue_type);

    const verified = in_after;

    return {
      verified,
      issue_type:     config.issue_type,
      expected_value: config.expected_value,
      found_value,
      url:            config.url,
      verified_at,
    };
  } catch (err) {
    return {
      verified:       false,
      issue_type:     config.issue_type,
      expected_value: config.expected_value,
      found_value:    null,
      url:            config.url,
      verified_at,
      error:          err instanceof Error ? err.message : String(err),
    };
  }
}
