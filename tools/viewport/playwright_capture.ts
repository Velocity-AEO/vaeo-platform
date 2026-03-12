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

// ── Injection ────────────────────────────────────────────────────────────────

let _launchBrowser: LaunchBrowserFn | undefined;

export function _injectLaunchBrowser(fn: LaunchBrowserFn): void {
  _launchBrowser = fn;
}

export function _resetInjections(): void {
  _launchBrowser = undefined;
}

// ── Default launcher ──────────────────────────────────────────────────────────

async function defaultLaunchBrowser(): Promise<Browser> {
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: true });
}

// ── Single-viewport capture ───────────────────────────────────────────────────

export async function captureViewport(
  url:       string,
  fix_id:    string,
  site_id:   string,
  viewport:  Viewport,
  stage:     'before' | 'after',
  opts?:     CaptureOpts,
  launchFn?: LaunchBrowserFn,
): Promise<ViewportScreenshot> {
  const key = buildScreenshotKey(site_id, fix_id, viewport.name, stage);
  const captured_at = new Date().toISOString();

  const launch = launchFn ?? _launchBrowser ?? defaultLaunchBrowser;
  let browser: Browser | undefined;
  let page:    BrowserPage | undefined;

  try {
    browser = await launch();
    page    = await browser.newPage();
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout:   opts?.timeout_ms ?? 30_000,
    });
    await page.screenshot({ type: 'png', fullPage: opts?.full_page ?? false });

    return { viewport, stage, url, key, captured_at, success: true };
  } catch (err) {
    return {
      viewport,
      stage,
      url,
      key,
      captured_at,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try { await page?.close(); }  catch { /* non-fatal */ }
    try { await browser?.close(); } catch { /* non-fatal */ }
  }
}

// ── Multi-viewport capture ────────────────────────────────────────────────────

/**
 * Captures screenshots at all 4 viewports for a given stage.
 * Each viewport opens its own browser instance so failures are isolated.
 */
export async function captureViewports(
  url:     string,
  fix_id:  string,
  site_id: string,
  stage:   'before' | 'after',
  opts?:   CaptureOpts,
  launchFn?: LaunchBrowserFn,
): Promise<ViewportScreenshot[]> {
  try {
    const results = await Promise.all(
      VIEWPORTS.map((vp) => captureViewport(url, fix_id, site_id, vp, stage, opts, launchFn)),
    );
    return results;
  } catch {
    return VIEWPORTS.map((vp) => ({
      viewport:    vp,
      stage,
      url,
      key:         buildScreenshotKey(site_id, fix_id, vp.name, stage),
      captured_at: new Date().toISOString(),
      success:     false,
      error:       'captureViewports outer error',
    }));
  }
}

// ── Before and after pair ─────────────────────────────────────────────────────

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
