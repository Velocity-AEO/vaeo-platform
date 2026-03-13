/**
 * tools/viewport/playwright_capture.ts
 *
 * Playwright-based screenshot engine for multi-viewport capture.
 * Injectable launchBrowser dep for testing. Never throws.
 */

import {
  VIEWPORTS,
  buildScreenshotKey,
  type Viewport,
  type ViewportScreenshot,
  type ViewportCapturePair,
} from './viewport_capture.js';

// ── Constants ────────────────────────────────────────────────────────────────

export const PLAYWRIGHT_CAPTURE_TIMEOUT_MS: number = 15000;

// ── CaptureTimeoutError ──────────────────────────────────────────────────────

export class CaptureTimeoutError extends Error {
  override name = 'CaptureTimeoutError' as const;
  url:        string;
  viewport:   number;
  elapsed_ms: number;

  constructor(url: string, viewport: number, elapsed_ms: number) {
    super(`Playwright capture timed out after ${elapsed_ms}ms for ${url} at ${viewport}px`);
    this.url = url;
    this.viewport = viewport;
    this.elapsed_ms = elapsed_ms;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface BrowserPage {
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  screenshot(opts?: { type?: string; fullPage?: boolean }): Promise<Buffer>;
  close(): Promise<void>;
}

export interface Browser {
  newPage(): Promise<BrowserPage>;
  close(): Promise<void>;
}

export type LaunchBrowserFn = () => Promise<Browser>;

export interface CaptureOpts {
  timeout_ms?: number;
  full_page?:  boolean;
}

export interface ViewportCaptureResult extends ViewportScreenshot {
  timed_out:  boolean;
  elapsed_ms: number;
  timeout_ms: number;
}

export interface CaptureAllResult {
  results:              ViewportCaptureResult[];
  timed_out_viewports:  number[];
  any_timed_out:        boolean;
}

export interface CaptureDeps {
  timeoutFn?: (ms: number) => Promise<never>;
}

// ── Injection ────────────────────────────────────────────────────────────────

let _launchBrowser: LaunchBrowserFn | undefined;

export function _injectLaunchBrowser(fn: LaunchBrowserFn): void {
  _launchBrowser = fn;
}

export function _resetInjections(): void {
  _launchBrowser = undefined;
}

// ── Default launcher ─────────────────────────────────────────────────────────

async function defaultLaunchBrowser(): Promise<Browser> {
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: true });
}

// ── Default timeout ──────────────────────────────────────────────────────────

function defaultTimeoutFn(ms: number): Promise<never> {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), ms);
  });
}

// ── Single-viewport capture ─────────────────────────────────────────────────

export async function captureViewport(
  url:       string,
  fix_id:    string,
  site_id:   string,
  viewport:  Viewport,
  stage:     'before' | 'after',
  opts?:     CaptureOpts,
  launchFn?: LaunchBrowserFn,
  deps?:     CaptureDeps,
): Promise<ViewportCaptureResult> {
  const key = buildScreenshotKey(site_id, fix_id, viewport.name, stage);
  const captured_at = new Date().toISOString();
  const timeout_ms = opts?.timeout_ms ?? PLAYWRIGHT_CAPTURE_TIMEOUT_MS;
  const startMs = Date.now();

  const launch = launchFn ?? _launchBrowser ?? defaultLaunchBrowser;
  const timeoutFn = deps?.timeoutFn ?? defaultTimeoutFn;
  let browser: Browser | undefined;
  let page:    BrowserPage | undefined;

  try {
    browser = await launch();
    page    = await browser.newPage();
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    // Race goto + screenshot against timeout
    await Promise.race([
      (async () => {
        await page!.goto(url, {
          waitUntil: 'networkidle',
          timeout:   timeout_ms,
        });
        await page!.screenshot({ type: 'png', fullPage: opts?.full_page ?? false });
      })(),
      timeoutFn(timeout_ms).catch(() => {
        throw new CaptureTimeoutError(url, viewport.width, Date.now() - startMs);
      }),
    ]);

    const elapsed_ms = Date.now() - startMs;
    return { viewport, stage, url, key, captured_at, success: true, timed_out: false, elapsed_ms, timeout_ms };
  } catch (err) {
    const elapsed_ms = Date.now() - startMs;
    const timed_out = err instanceof CaptureTimeoutError;

    // Close page gracefully on timeout
    if (timed_out) {
      try { await page?.close(); } catch { /* non-fatal */ }
      try { await browser?.close(); } catch { /* non-fatal */ }
    }

    return {
      viewport,
      stage,
      url,
      key,
      captured_at,
      success: false,
      timed_out,
      elapsed_ms,
      timeout_ms,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try { await page?.close(); }  catch { /* non-fatal */ }
    try { await browser?.close(); } catch { /* non-fatal */ }
  }
}

// ── Multi-viewport capture ──────────────────────────────────────────────────

/**
 * Captures screenshots at all 4 viewports for a given stage.
 * Each viewport opens its own browser instance so failures are isolated.
 * Continues capturing remaining viewports even if one times out.
 */
export async function captureViewports(
  url:     string,
  fix_id:  string,
  site_id: string,
  stage:   'before' | 'after',
  opts?:   CaptureOpts,
  launchFn?: LaunchBrowserFn,
  deps?:     CaptureDeps,
): Promise<ViewportScreenshot[]> {
  try {
    const results = await Promise.all(
      VIEWPORTS.map((vp) => captureViewport(url, fix_id, site_id, vp, stage, opts, launchFn, deps)),
    );
    return results;
  } catch {
    const timeout_ms = opts?.timeout_ms ?? PLAYWRIGHT_CAPTURE_TIMEOUT_MS;
    return VIEWPORTS.map((vp) => ({
      viewport:    vp,
      stage,
      url,
      key:         buildScreenshotKey(site_id, fix_id, vp.name, stage),
      captured_at: new Date().toISOString(),
      success:     false,
      timed_out:   false,
      elapsed_ms:  0,
      timeout_ms,
      error:       'captureViewports outer error',
    }));
  }
}

/**
 * Captures all viewports and returns enriched results with timeout info.
 */
export async function captureAllViewports(
  url:     string,
  fix_id:  string,
  site_id: string,
  stage:   'before' | 'after',
  opts?:   CaptureOpts,
  launchFn?: LaunchBrowserFn,
  deps?:     CaptureDeps,
): Promise<CaptureAllResult> {
  try {
    const results = await Promise.all(
      VIEWPORTS.map((vp) => captureViewport(url, fix_id, site_id, vp, stage, opts, launchFn, deps)),
    );
    const timed_out_viewports = results
      .filter(r => r.timed_out)
      .map(r => r.viewport.width);
    return {
      results,
      timed_out_viewports,
      any_timed_out: timed_out_viewports.length > 0,
    };
  } catch {
    const timeout_ms = opts?.timeout_ms ?? PLAYWRIGHT_CAPTURE_TIMEOUT_MS;
    const results: ViewportCaptureResult[] = VIEWPORTS.map((vp) => ({
      viewport:    vp,
      stage,
      url,
      key:         buildScreenshotKey(site_id, fix_id, vp.name, stage),
      captured_at: new Date().toISOString(),
      success:     false,
      timed_out:   false,
      elapsed_ms:  0,
      timeout_ms,
      error:       'captureAllViewports outer error',
    }));
    return { results, timed_out_viewports: [], any_timed_out: false };
  }
}

// ── Before and after pair ───────────────────────────────────────────────────

/**
 * Captures before and after screenshots across all viewports.
 * `beforeUrl` and `afterUrl` may differ (e.g., preview_theme_id param).
 */
export async function captureBeforeAndAfter(
  beforeUrl: string,
  afterUrl:  string,
  fix_id:    string,
  site_id:   string,
  opts?:     CaptureOpts,
  launchFn?: LaunchBrowserFn,
): Promise<{ before: ViewportScreenshot[]; after: ViewportScreenshot[] }> {
  try {
    const [before, after] = await Promise.all([
      captureViewports(beforeUrl, fix_id, site_id, 'before', opts, launchFn),
      captureViewports(afterUrl,  fix_id, site_id, 'after',  opts, launchFn),
    ]);
    return { before, after };
  } catch {
    const emptyBefore = VIEWPORTS.map((vp) => ({
      viewport:    vp,
      stage:       'before' as const,
      url:         beforeUrl,
      key:         buildScreenshotKey(site_id, fix_id, vp.name, 'before'),
      captured_at: new Date().toISOString(),
      success:     false,
      error:       'captureBeforeAndAfter outer error',
    }));
    const emptyAfter = VIEWPORTS.map((vp) => ({
      viewport:    vp,
      stage:       'after' as const,
      url:         afterUrl,
      key:         buildScreenshotKey(site_id, fix_id, vp.name, 'after'),
      captured_at: new Date().toISOString(),
      success:     false,
      error:       'captureBeforeAndAfter outer error',
    }));
    return { before: emptyBefore, after: emptyAfter };
  }
}
