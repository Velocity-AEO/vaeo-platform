/**
 * tools/wordpress/wp_noindex_filter.ts
 *
 * Detects noindex signals from meta robots tags and X-Robots-Tag headers.
 * Pages with noindex must never be queued for fixes.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type NoindexSignal = 'meta_robots' | 'x_robots_tag' | 'both' | 'none';

export interface NoindexCheckResult {
  url:              string;
  is_noindex:       boolean;
  signal:           NoindexSignal;
  robots_content:   string | null;
  x_robots_content: string | null;
}

// ── checkMetaRobotsNoindex ──────────────────────────────────────────────────

export function checkMetaRobotsNoindex(html: string): boolean {
  try {
    if (!html) return false;
    const match = html.match(/<meta\s+[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*\/?>/i)
               ?? html.match(/<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']robots["'][^>]*\/?>/i);
    if (!match) return false;
    return match[1].toLowerCase().includes('noindex');
  } catch {
    return false;
  }
}

// ── checkXRobotsNoindex ─────────────────────────────────────────────────────

export function checkXRobotsNoindex(headers: Record<string, string>): boolean {
  try {
    if (!headers) return false;
    // Check case-insensitively
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'x-robots-tag') {
        return (value ?? '').toLowerCase().includes('noindex');
      }
    }
    return false;
  } catch {
    return false;
  }
}

// ── detectNoindexSignal ─────────────────────────────────────────────────────

export function detectNoindexSignal(
  html: string,
  headers: Record<string, string>,
): NoindexSignal {
  try {
    const meta = checkMetaRobotsNoindex(html);
    const xRobots = checkXRobotsNoindex(headers);
    if (meta && xRobots) return 'both';
    if (meta) return 'meta_robots';
    if (xRobots) return 'x_robots_tag';
    return 'none';
  } catch {
    return 'none';
  }
}

// ── extractRobotsContent ────────────────────────────────────────────────────

function extractRobotsContent(html: string): string | null {
  try {
    if (!html) return null;
    const match = html.match(/<meta\s+[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*\/?>/i)
               ?? html.match(/<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']robots["'][^>]*\/?>/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function extractXRobotsContent(headers: Record<string, string>): string | null {
  try {
    if (!headers) return null;
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'x-robots-tag') return value;
    }
    return null;
  } catch {
    return null;
  }
}

// ── checkPageNoindex ────────────────────────────────────────────────────────

export async function checkPageNoindex(
  url: string,
  html: string,
  headers: Record<string, string>,
): Promise<NoindexCheckResult> {
  try {
    const signal = detectNoindexSignal(html, headers);
    return {
      url,
      is_noindex:       signal !== 'none',
      signal,
      robots_content:   extractRobotsContent(html),
      x_robots_content: extractXRobotsContent(headers),
    };
  } catch {
    return {
      url:              url ?? '',
      is_noindex:       false,
      signal:           'none',
      robots_content:   null,
      x_robots_content: null,
    };
  }
}

// ── filterNoindexPages ──────────────────────────────────────────────────────

export function filterNoindexPages<T extends { url: string; html: string; headers: Record<string, string> }>(
  pages: T[],
  deps?: { logFn?: (msg: string) => void },
): Array<T & { noindex_check: NoindexCheckResult }> {
  try {
    if (!Array.isArray(pages)) return [];
    const log = deps?.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));
    const result: Array<T & { noindex_check: NoindexCheckResult }> = [];

    for (const page of pages) {
      const signal = detectNoindexSignal(page.html, page.headers);
      const check: NoindexCheckResult = {
        url:              page.url,
        is_noindex:       signal !== 'none',
        signal,
        robots_content:   extractRobotsContent(page.html),
        x_robots_content: extractXRobotsContent(page.headers),
      };

      if (check.is_noindex) {
        log(`[WP_CRAWLER] Skipping noindex page: ${page.url} signal=${signal}`);
        continue;
      }

      result.push({ ...page, noindex_check: check });
    }

    return result;
  } catch {
    return [];
  }
}
