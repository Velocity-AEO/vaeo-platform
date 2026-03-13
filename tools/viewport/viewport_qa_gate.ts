/**
 * tools/viewport/viewport_qa_gate.ts
 *
 * Viewport QA gate: captures before/after screenshots at all 4 viewports,
 * stores them, and produces a pass/fail report.
 * Injectable captureFn and storeFn. Never throws.
 */

import {
  buildCapturePair,
  type ViewportScreenshot,
  type ViewportCapturePair,
} from './viewport_capture.js';
import type { StorageDeps } from './screenshot_storage.js';
import {
  PLAYWRIGHT_CAPTURE_TIMEOUT_MS,
  type CaptureOpts,
  type LaunchBrowserFn,
  type ViewportCaptureResult,
} from './playwright_capture.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ViewportQAInput {
  fix_id:     string;
  site_id:    string;
  before_url: string;
  after_url:  string;
}

export interface ViewportQAResult {
  fix_id:               string;
  site_id:              string;
  pair:                 ViewportCapturePair;
  passed:               boolean;
  failed_viewports:     string[];  // names of viewports that had failures
  stored_keys:          string[];  // keys successfully stored
  qa_at:                string;
  error?:               string;
  timed_out_viewports:  number[];
  capture_timeout_ms:   number;
  partial_capture:      boolean;
  failure_reasons:      string[];
}

export type CaptureFn = (
  beforeUrl: string,
  afterUrl:  string,
  fix_id:    string,
  site_id:   string,
  opts?:     CaptureOpts,
  launchFn?: LaunchBrowserFn,
) => Promise<{ before: ViewportScreenshot[]; after: ViewportScreenshot[] }>;

export type StoreFn = (
  shot: ViewportScreenshot,
  data: Buffer,
  deps?: StorageDeps,
) => Promise<{ key: string; url: string; ok: boolean; error?: string }>;

export interface QAGateDeps {
  capture?:     CaptureFn;
  store?:       StoreFn;
  storageDeps?: StorageDeps;
  captureOpts?: CaptureOpts;
  launchFn?:    LaunchBrowserFn;
  logFn?:       (message: string) => void;
}

// ── getFailedViewports ──────────────────────────────────────────────────────

/**
 * Returns names of viewports where any shot (before or after) failed.
 */
export function getFailedViewports(pair: ViewportCapturePair): string[] {
  try {
    const failed = new Set<string>();
    for (const shot of [...pair.before, ...pair.after]) {
      if (!shot.success) failed.add(shot.viewport.name);
    }
    return Array.from(failed);
  } catch {
    return [];
  }
}

// ── Default no-op capture / store ───────────────────────────────────────────

async function defaultCapture(
  beforeUrl: string,
  afterUrl:  string,
  fix_id:    string,
  site_id:   string,
): Promise<{ before: ViewportScreenshot[]; after: ViewportScreenshot[] }> {
  const { captureBeforeAndAfter } = await import('./playwright_capture.js');
  return captureBeforeAndAfter(beforeUrl, afterUrl, fix_id, site_id);
}

async function defaultStore(
  shot:  ViewportScreenshot,
  data:  Buffer,
  deps?: StorageDeps,
): Promise<{ key: string; url: string; ok: boolean }> {
  const { storeScreenshot } = await import('./screenshot_storage.js');
  return storeScreenshot(shot, data, deps);
}

// ── getTimedOutViewports ────────────────────────────────────────────────────

function getTimedOutViewports(shots: ViewportScreenshot[]): number[] {
  try {
    const widths: number[] = [];
    for (const shot of shots) {
      const r = shot as ViewportCaptureResult;
      if (r.timed_out) widths.push(r.viewport.width);
    }
    return [...new Set(widths)];
  } catch {
    return [];
  }
}

// ── runViewportQA ───────────────────────────────────────────────────────────

/**
 * Full QA run: capture before/after at 4 viewports, store each screenshot,
 * and return a pass/fail verdict.
 *
 * Passes when all_viewports_clean=true (8/8 captures succeeded).
 */
export async function runViewportQA(
  input: ViewportQAInput,
  deps?: QAGateDeps,
): Promise<ViewportQAResult> {
  const qa_at = new Date().toISOString();
  const timeout_ms = deps?.captureOpts?.timeout_ms ?? PLAYWRIGHT_CAPTURE_TIMEOUT_MS;
  const log = deps?.logFn ?? ((msg: string) => process.stderr.write(msg + '\n'));

  try {
    const captureFn = deps?.capture ?? defaultCapture;
    const storeFn   = deps?.store   ?? defaultStore;

    // 1. Capture
    const { before, after } = await captureFn(
      input.before_url,
      input.after_url,
      input.fix_id,
      input.site_id,
      deps?.captureOpts,
      deps?.launchFn,
    );

    // 2. Build pair
    const pair = buildCapturePair(
      input.before_url,
      input.fix_id,
      input.site_id,
      before,
      after,
    );

    // 3. Store successful screenshots (best-effort, non-fatal)
    const stored_keys: string[] = [];
    const allShots = [...before, ...after];
    for (const shot of allShots) {
      if (!shot.success) continue;
      try {
        const res = await storeFn(shot, Buffer.alloc(0), deps?.storageDeps);
        if (res.ok) stored_keys.push(res.key);
      } catch {
        // non-fatal
      }
    }

    // 4. Timeout analysis
    const timed_out_viewports = getTimedOutViewports(allShots);
    const totalViewportCount = 4; // VIEWPORTS.length
    const timedOutCount = timed_out_viewports.length;
    const failure_reasons: string[] = [];

    // Log every timeout
    for (const shot of allShots) {
      const r = shot as ViewportCaptureResult;
      if (r.timed_out) {
        log(`[VIEWPORT_TIMEOUT] ${r.url} at ${r.viewport.width}px timed out after ${r.elapsed_ms}ms`);
      }
    }

    let partial_capture = false;

    if (timedOutCount >= totalViewportCount) {
      // All viewports timed out
      failure_reasons.push(`All viewport captures timed out after ${timeout_ms}ms — page may be unreachable or too slow`);
    } else if (timedOutCount > 0) {
      // Some viewports timed out
      partial_capture = true;
      const widths = timed_out_viewports.join(', ');
      failure_reasons.push(`${timedOutCount} viewport(s) timed out: ${widths}px — partial capture only`);
    }

    // 5. Verdict
    const failed_viewports = getFailedViewports(pair);
    const passed = pair.all_viewports_clean && timedOutCount === 0;

    return {
      fix_id: input.fix_id,
      site_id: input.site_id,
      pair,
      passed,
      failed_viewports,
      stored_keys,
      qa_at,
      timed_out_viewports,
      capture_timeout_ms: timeout_ms,
      partial_capture,
      failure_reasons,
    };
  } catch (err) {
    const emptyPair = buildCapturePair(input.before_url, input.fix_id, input.site_id, [], []);
    return {
      fix_id:              input.fix_id,
      site_id:             input.site_id,
      pair:                emptyPair,
      passed:              false,
      failed_viewports:    [],
      stored_keys:         [],
      qa_at,
      error:               err instanceof Error ? err.message : String(err),
      timed_out_viewports: [],
      capture_timeout_ms:  timeout_ms,
      partial_capture:     false,
      failure_reasons:     [],
    };
  }
}
