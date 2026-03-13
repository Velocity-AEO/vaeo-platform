/**
 * tools/sandbox/baseline_scheduler.ts
 *
 * Weekly baseline capture job.
 * Captures snapshots of every page for a site and detects degradations
 * independent of VAEO fixes.
 *
 * Injectable deps. Never throws.
 */

import {
  capturePageBaseline,
  diffBaselines,
  saveBaselineSnapshot,
  loadLatestBaseline,
  type BaselineSnapshot,
  type BaselineDiff,
} from './baseline_snapshot.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BaselineCaptureResult {
  pages_captured:       number;
  pages_degraded:       number;
  critical_regressions: string[];
  snapshot_date:        string;
}

export interface BaselineCaptureDeps {
  /** Returns list of URLs for the site */
  crawlFn?:   (site_id: string) => Promise<string[]>;
  /** Fetches HTML for a URL; returns [html, headers] */
  fetchFn?:   (url: string) => Promise<{ html: string; headers: Record<string, string> }>;
  /** Fetches mobile Lighthouse score (optional, returns null on error) */
  lighthouseFn?: (url: string) => Promise<number | null>;
  /** Saves a BaselineSnapshot */
  saveFn?:    (snap: BaselineSnapshot) => Promise<boolean>;
  /** Loads the most recent previous baseline */
  loadFn?:    (site_id: string, url: string) => Promise<BaselineSnapshot | null>;
  /** Runs diff between current and previous */
  diffFn?:    (current: BaselineSnapshot, previous: BaselineSnapshot) => BaselineDiff;
  logFn?:     (msg: string) => void;
}

// ── runWeeklyBaselineCapture ──────────────────────────────────────────────────

export async function runWeeklyBaselineCapture(
  site_id: string,
  deps?:   BaselineCaptureDeps,
): Promise<BaselineCaptureResult> {
  const snapshot_date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const log = deps?.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));

  try {
    if (!site_id) {
      return { pages_captured: 0, pages_degraded: 0, critical_regressions: [], snapshot_date };
    }

    const crawlFn     = deps?.crawlFn      ?? defaultCrawlFn;
    const fetchFn     = deps?.fetchFn      ?? defaultFetchFn;
    const lighthouseFn = deps?.lighthouseFn ?? defaultLighthouseFn;
    const saveFn      = deps?.saveFn;
    const loadFn      = deps?.loadFn;
    const diffFn      = deps?.diffFn ?? diffBaselines;

    const urls = await crawlFn(site_id).catch(() => [] as string[]);

    let pages_captured       = 0;
    let pages_degraded       = 0;
    const critical_regressions: string[] = [];

    for (const url of urls) {
      try {
        // 1. Fetch current HTML
        const { html, headers } = await fetchFn(url).catch(() => ({ html: '', headers: {} }));

        // 2. Capture baseline fields from HTML
        const lhScore = await lighthouseFn(url).catch(() => null);
        const fields  = capturePageBaseline(url, html, headers, lhScore);

        const snapshot: BaselineSnapshot = {
          id:            '',
          site_id,
          snapshot_date,
          captured_at:   new Date().toISOString(),
          ...fields,
        };

        // 3. Load previous baseline for diff
        const previous = await loadLatestBaseline(site_id, url, { loadFn }).catch(() => null);

        // 4. Run diff if previous exists
        if (previous) {
          try {
            const diff = diffFn(snapshot, previous);
            if (diff.degradation_count > 0) {
              pages_degraded++;
            }
            if (diff.severity === 'critical' || diff.severity === 'high') {
              critical_regressions.push(url);
            }
          } catch {
            // diff failure is non-fatal
          }
        }

        // 5. Save new baseline
        await saveBaselineSnapshot(snapshot, { saveFn }).catch(() => {});
        pages_captured++;
      } catch {
        // per-page failure is non-fatal
      }
    }

    log(`[BASELINE] site=${site_id} captured=${pages_captured} degraded=${pages_degraded}`);

    return { pages_captured, pages_degraded, critical_regressions, snapshot_date };
  } catch {
    return { pages_captured: 0, pages_degraded: 0, critical_regressions: [], snapshot_date };
  }
}

// ── scheduleBaselineCaptures ──────────────────────────────────────────────────

export async function scheduleBaselineCaptures(
  deps?: {
    loadSitesFn?: () => Promise<string[]>;
    runFn?:       (site_id: string) => Promise<BaselineCaptureResult>;
    logFn?:       (msg: string) => void;
  },
): Promise<void> {
  const log = deps?.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));

  try {
    const isSunday = new Date().getDay() === 0;
    if (!isSunday) return;

    const loadSites = deps?.loadSitesFn ?? defaultLoadSitesFn;
    const runFn     = deps?.runFn       ?? ((sid: string) => runWeeklyBaselineCapture(sid));

    const sites = await loadSites().catch(() => [] as string[]);

    for (const site_id of sites) {
      try {
        const result = await runFn(site_id);
        log(`[BASELINE] site=${site_id} captured=${result.pages_captured} degraded=${result.pages_degraded}`);
      } catch {
        // per-site failure must not block others
      }
    }
  } catch {
    // scheduler failure must not propagate
  }
}

// ── Defaults ──────────────────────────────────────────────────────────────────

async function defaultCrawlFn(_site_id: string): Promise<string[]> {
  return [];
}

async function defaultFetchFn(_url: string): Promise<{ html: string; headers: Record<string, string> }> {
  return { html: '', headers: {} };
}

async function defaultLighthouseFn(_url: string): Promise<number | null> {
  return null;
}

async function defaultLoadSitesFn(): Promise<string[]> {
  return [];
}
