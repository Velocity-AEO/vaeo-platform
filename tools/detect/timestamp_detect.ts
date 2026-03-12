/**
 * tools/detect/timestamp_detect.ts
 *
 * Detects whether an HTML page carries proper last-modified timestamp signals:
 *   - dateModified in JSON-LD
 *   - article:modified_time in Open Graph meta tags
 *
 * Pure function — never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TimestampSignals {
  has_jsonld_date_modified:    boolean;
  has_og_modified_time:        boolean;
  has_jsonld_date_published:   boolean;
  current_date_modified?:      string;
  current_og_modified_time?:   string;
  needs_injection:             boolean;
}

// ── Regex patterns ────────────────────────────────────────────────────────────

const JSONLD_SCRIPT_RE = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const OG_MODIFIED_RE   = /<meta[^>]+property\s*=\s*["']article:modified_time["'][^>]*>/gi;
const OG_CONTENT_RE    = /content\s*=\s*["']([^"']+)["']/i;

// ── detectTimestampSignals ────────────────────────────────────────────────────

export function detectTimestampSignals(html: string): TimestampSignals {
  let has_jsonld_date_modified  = false;
  let has_jsonld_date_published = false;
  let has_og_modified_time      = false;
  let current_date_modified:    string | undefined;
  let current_og_modified_time: string | undefined;

  if (typeof html !== 'string') {
    return { has_jsonld_date_modified, has_og_modified_time, has_jsonld_date_published, needs_injection: true };
  }

  try {
    // ── JSON-LD blocks ──────────────────────────────────────────────────────
    JSONLD_SCRIPT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = JSONLD_SCRIPT_RE.exec(html)) !== null) {
      const raw = m[1]?.trim() ?? '';
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { continue; }

      const candidates: Record<string, unknown>[] = [];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') candidates.push(item as Record<string, unknown>);
        }
      } else if (parsed && typeof parsed === 'object') {
        candidates.push(parsed as Record<string, unknown>);
      }

      for (const obj of candidates) {
        if ('dateModified' in obj && typeof obj['dateModified'] === 'string') {
          has_jsonld_date_modified = true;
          current_date_modified    = obj['dateModified'] as string;
        }
        if ('datePublished' in obj && typeof obj['datePublished'] === 'string') {
          has_jsonld_date_published = true;
        }
      }
    }

    // ── Open Graph meta tags ────────────────────────────────────────────────
    OG_MODIFIED_RE.lastIndex = 0;
    const ogMatch = OG_MODIFIED_RE.exec(html);
    if (ogMatch) {
      has_og_modified_time = true;
      const contentMatch   = OG_CONTENT_RE.exec(ogMatch[0]);
      if (contentMatch?.[1]) current_og_modified_time = contentMatch[1];
    }
  } catch {
    // Non-fatal — return whatever we found so far
  }

  const needs_injection = !has_jsonld_date_modified || !has_og_modified_time;

  return {
    has_jsonld_date_modified,
    has_og_modified_time,
    has_jsonld_date_published,
    current_date_modified,
    current_og_modified_time,
    needs_injection,
  };
}
