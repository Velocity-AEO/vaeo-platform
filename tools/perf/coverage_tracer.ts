/**
 * tools/perf/coverage_tracer.ts
 *
 * Playwright-based coverage tracer.
 * Captures unused CSS rules, unused JS bytes, and LCP image data.
 *
 * tracePage(url)         — trace a live URL
 * traceLocalHTML(html)   — trace raw HTML string (no server needed)
 *
 * Never throws — errors are returned as empty results with error field.
 */

import { chromium, type Browser, type CDPSession } from 'playwright';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UnusedCSSRule {
  selector: string;
  source:   string;
}

export interface UnusedJSFile {
  url:          string;
  unusedBytes:  number;
  totalBytes:   number;
}

export interface LCPImage {
  src:          string;
  displayWidth: number;
  displayHeight: number;
}

export interface CoverageResult {
  url:             string;
  fetchedAt:       string;
  unusedCSS:       UnusedCSSRule[];
  unusedJS:        UnusedJSFile[];
  lcpImage:        LCPImage | null;
  rawCSSCoverage:  unknown[];
  rawJSCoverage:   unknown[];
  error?:          string;
}

// ── CSS coverage processing ───────────────────────────────────────────────────

interface CSSCoverageEntry {
  url:   string;
  text:  string;
  ranges: Array<{ start: number; end: number }>;
}

interface JSCoverageEntry {
  url:    string;
  source?: string;
  functions: Array<{
    ranges: Array<{ startOffset: number; endOffset: number; count: number }>;
  }>;
}

/**
 * Parse unused CSS selectors from coverage data.
 * A CSS rule is "unused" if none of its text range is covered.
 */
function parseUnusedCSS(entries: CSSCoverageEntry[]): UnusedCSSRule[] {
  const unused: UnusedCSSRule[] = [];

  for (const entry of entries) {
    const { text, ranges } = entry;
    if (!text) continue;

    // Build a set of covered byte positions
    const covered = new Set<number>();
    for (const r of ranges) {
      for (let i = r.start; i < r.end; i++) covered.add(i);
    }

    // Parse CSS rules by splitting on `}` boundaries (simple heuristic)
    // Walk through top-level rules using brace depth tracking
    let depth = 0;
    let ruleStart = 0;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const ruleText = text.slice(ruleStart, i + 1).trim();
          const ruleEnd   = i + 1;

          if (ruleText) {
            // Check if ANY byte in this rule's range is covered
            let anyCovered = false;
            for (let j = ruleStart; j < ruleEnd; j++) {
              if (covered.has(j)) { anyCovered = true; break; }
            }

            if (!anyCovered) {
              // Extract selector: text before the first {
              const braceIdx = ruleText.indexOf('{');
              if (braceIdx !== -1) {
                const selector = ruleText.slice(0, braceIdx).trim();
                // Skip @-rules (keyframes, media, variables) — preserve them
                if (selector && !selector.startsWith('@') && !selector.startsWith(':root')) {
                  unused.push({ selector, source: ruleText });
                }
              }
            }
          }

          ruleStart = i + 1;
        }
      }
    }
  }

  return unused;
}

/**
 * Calculate unused bytes per JS file from coverage data.
 * Reports files with >20% unused bytes.
 */
function parseUnusedJS(entries: JSCoverageEntry[]): UnusedJSFile[] {
  const result: UnusedJSFile[] = [];

  for (const entry of entries) {
    const source = entry.source ?? '';
    const totalBytes = source.length;
    if (totalBytes === 0) continue;

    // Collect all covered byte ranges across all functions
    const coveredRanges: Array<{ start: number; end: number }> = [];
    for (const fn of entry.functions) {
      for (const range of fn.ranges) {
        if (range.count > 0) {
          coveredRanges.push({ start: range.startOffset, end: range.endOffset });
        }
      }
    }

    // Count covered bytes
    const coveredBytes = new Set<number>();
    for (const r of coveredRanges) {
      for (let i = r.start; i < Math.min(r.end, totalBytes); i++) {
        coveredBytes.add(i);
      }
    }

    const unusedBytes = totalBytes - coveredBytes.size;
    const unusedRatio = unusedBytes / totalBytes;

    // Report if >20% unused
    if (unusedRatio > 0.2) {
      result.push({ url: entry.url, unusedBytes, totalBytes });
    }
  }

  return result;
}

// ── LCP image detection ───────────────────────────────────────────────────────

/**
 * Find the largest visible img element (heuristic LCP candidate).
 */
async function findLCPImage(page: import('playwright').Page): Promise<LCPImage | null> {
  try {
    const lcp = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      let best: { src: string; w: number; h: number } | null = null;
      let bestArea = 0;

      for (const img of imgs) {
        const rect = img.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        // Must be in viewport and have non-zero dimensions
        if (w <= 0 || h <= 0) continue;
        if (rect.top > window.innerHeight || rect.bottom < 0) continue;
        const area = w * h;
        if (area > bestArea) {
          bestArea = area;
          best = { src: img.src || img.currentSrc, w, h };
        }
      }

      return best;
    });

    if (!lcp || !lcp.src) return null;
    return { src: lcp.src, displayWidth: lcp.w, displayHeight: lcp.h };
  } catch {
    return null;
  }
}

// ── Core trace logic ──────────────────────────────────────────────────────────

async function runTrace(
  browser: Browser,
  loadFn:  (page: import('playwright').Page, cdp: CDPSession) => Promise<string>,
): Promise<Omit<CoverageResult, 'url'> & { url: string }> {
  const context = await browser.newContext();
  const page    = await context.newPage();
  const cdp     = await context.newCDPSession(page);

  // Start CSS + JS coverage
  await page.coverage.startCSSCoverage();
  await page.coverage.startJSCoverage({ resetOnNavigation: false });

  const url = await loadFn(page, cdp);

  // Stop and collect coverage
  const rawCSS = await page.coverage.stopCSSCoverage();
  const rawJS  = await page.coverage.stopJSCoverage();

  const lcpImage = await findLCPImage(page);
  await context.close();

  const unusedCSS = parseUnusedCSS(rawCSS as CSSCoverageEntry[]);
  const unusedJS  = parseUnusedJS(rawJS  as JSCoverageEntry[]);

  return {
    url,
    fetchedAt:      new Date().toISOString(),
    unusedCSS,
    unusedJS,
    lcpImage,
    rawCSSCoverage: rawCSS,
    rawJSCoverage:  rawJS,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Trace a live URL for coverage data.
 */
export async function tracePage(url: string): Promise<CoverageResult> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const result = await runTrace(browser, async (page) => {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      return url;
    });
    return result;
  } catch (err) {
    return {
      url,
      fetchedAt:      new Date().toISOString(),
      unusedCSS:      [],
      unusedJS:       [],
      lcpImage:       null,
      rawCSSCoverage: [],
      rawJSCoverage:  [],
      error:          err instanceof Error ? err.message : String(err),
    };
  } finally {
    await browser?.close();
  }
}

/**
 * Trace raw HTML string for coverage data — no live URL required.
 * Uses a data: URI so Playwright loads the HTML directly.
 */
export async function traceLocalHTML(html: string): Promise<CoverageResult> {
  let browser: Browser | null = null;
  const url = 'local://html';
  try {
    browser = await chromium.launch({ headless: true });
    const result = await runTrace(browser, async (page) => {
      await page.setContent(html, { waitUntil: 'networkidle' });
      return url;
    });
    return { ...result, url };
  } catch (err) {
    return {
      url,
      fetchedAt:      new Date().toISOString(),
      unusedCSS:      [],
      unusedJS:       [],
      lcpImage:       null,
      rawCSSCoverage: [],
      rawJSCoverage:  [],
      error:          err instanceof Error ? err.message : String(err),
    };
  } finally {
    await browser?.close();
  }
}
