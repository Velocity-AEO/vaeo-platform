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
import type { CaptureOpts, LaunchBrowserFn } from './playwright_capture.js';

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
}

// ── getFailedViewports ────────────────────────────────────────────────────────

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

// ── Default no-op capture / store ─────────────────────────────────────────────

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

// ── runViewportQA ─────────────────────────────────────────────────────────────

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

    // 4. Verdict
    const failed_viewports = getFailedViewports(pair);
    const passed = pair.all_viewports_clean;

    return {
      fix_id: input.fix_id,
      site_id: input.site_id,
      pair,
      passed,
      failed_viewports,
      stored_keys,
      qa_at,
    };
  } catch (err) {
    const emptyPair = buildCapturePair(input.before_url, input.fix_id, input.site_id, [], []);
    return {
      fix_id:           input.fix_id,
      site_id:          input.site_id,
      pair:             emptyPair,
      passed:           false,
      failed_viewports: [],
      stored_keys:      [],
      qa_at,
      error:            err instanceof Error ? err.message : String(err),
    };
  }
}
