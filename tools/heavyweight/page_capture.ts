/**
 * tools/heavyweight/page_capture.ts
 *
 * Playwright-based page capture engine.
 * Fetches live pages in a real Chromium browser, capturing full HTML
 * after all scripts have fired, network requests, and timing data.
 *
 * Injectable deps for testability. Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PageCaptureConfig {
  url:               string;
  timeout_ms:        number;
  wait_for:          'load' | 'networkidle' | 'domcontentloaded';
  block_resources?:  string[];
  extra_headers?:    Record<string, string>;
  viewport?:         { width: number; height: number };
}

export interface PageCaptureResult {
  url:                 string;
  html:                string;
  status_code:         number;
  final_url:           string;
  load_time_ms:        number;
  resource_count:      number;
  failed_resources:    string[];
  scripts_fired:       string[];
  third_party_domains: string[];
  captured_at:         string;
  error?:              string;
}

// ── Injectable browser page interface ────────────────────────────────────────

export interface BrowserPage {
  goto:     (url: string, opts: object) => Promise<{ status: () => number; url: () => string }>;
  content:  () => Promise<string>;
  evaluate: (fn: () => unknown) => Promise<unknown>;
  on:       (event: string, fn: (r: unknown) => void) => void;
  close:    () => Promise<void>;
}

// ── Known cost patterns ───────────────────────────────────────────────────────

const COST_PATTERNS: Record<string, string[]> = {
  critical: ['hotjar', 'luckyorange', 'fullstory', 'mouseflow'],
  high:     ['intercom', 'tidio', 'drift', 'klaviyo', 'omnisend', 'privy', 'sendwill', 'smile.io'],
  medium:   ['judge.me', 'loox', 'yotpo', 'stamped', 'instafeed', 'elfsight'],
};

// ── Helper: empty error result ────────────────────────────────────────────────

function errorResult(url: string, error: string): PageCaptureResult {
  return {
    url,
    html:                '',
    status_code:         0,
    final_url:           url,
    load_time_ms:        0,
    resource_count:      0,
    failed_resources:    [],
    scripts_fired:       [],
    third_party_domains: [],
    captured_at:         new Date().toISOString(),
    error,
  };
}

// ── defaultCaptureConfig ──────────────────────────────────────────────────────

export function defaultCaptureConfig(url: string): PageCaptureConfig {
  try {
    return {
      url,
      timeout_ms:       30_000,
      wait_for:         'networkidle',
      block_resources:  [],
      extra_headers:    {},
      viewport:         { width: 1280, height: 800 },
    };
  } catch {
    return {
      url:        url ?? '',
      timeout_ms: 30_000,
      wait_for:   'networkidle',
    };
  }
}

// ── extractThirdPartyDomains ──────────────────────────────────────────────────

export function extractThirdPartyDomains(
  scripts_fired:  string[],
  page_hostname:  string,
): string[] {
  try {
    const seen = new Set<string>();
    for (const src of (scripts_fired ?? [])) {
      if (!src || src.startsWith('data:') || src.startsWith('blob:')) continue;
      try {
        const normalized = src.startsWith('//') ? 'https:' + src : src;
        const hn = new URL(normalized).hostname.toLowerCase();
        if (hn && hn !== page_hostname?.toLowerCase()) {
          seen.add(hn);
        }
      } catch { /* skip malformed URLs */ }
    }
    return [...seen];
  } catch {
    return [];
  }
}

// ── classifyResourceCost ──────────────────────────────────────────────────────

export function classifyResourceCost(
  domain: string,
): 'critical' | 'high' | 'medium' | 'low' {
  try {
    const d = (domain ?? '').toLowerCase();
    for (const [level, patterns] of Object.entries(COST_PATTERNS)) {
      if (patterns.some((p) => d.includes(p))) {
        return level as 'critical' | 'high' | 'medium' | 'low';
      }
    }
    return 'low';
  } catch {
    return 'low';
  }
}

// ── capturePage ───────────────────────────────────────────────────────────────

export async function capturePage(
  config: PageCaptureConfig,
  deps?: {
    launchBrowser?: () => Promise<{
      newPage: () => Promise<BrowserPage>;
      close:   () => Promise<void>;
    }>;
  },
): Promise<PageCaptureResult> {
  const url = config?.url ?? '';
  try {
    // Resolve browser launcher
    let launch: (() => Promise<{ newPage: () => Promise<BrowserPage>; close: () => Promise<void> }>) | null =
      deps?.launchBrowser ?? null;

    if (!launch) {
      // Try dynamic playwright import
      try {
        const pw = await import('playwright');
        const chromium = (pw as unknown as { chromium: { launch: (o: object) => Promise<{ newPage: () => Promise<BrowserPage>; close: () => Promise<void> }> } }).chromium;
        launch = () => chromium.launch({ headless: true });
      } catch {
        return errorResult(url, 'playwright not installed');
      }
    }

    const browser   = await launch();
    const page      = await browser.newPage();
    const resources: string[] = [];
    const failed:    string[] = [];
    const scripts:   string[] = [];

    // Listen for requests
    page.on('request', (req: unknown) => {
      const r = req as { url: () => string };
      try { resources.push(r.url()); } catch { /* non-fatal */ }
    });

    // Listen for responses (to detect failures)
    page.on('response', (res: unknown) => {
      const r = res as { url: () => string; status: () => number };
      try {
        const status = r.status();
        if (status >= 400) failed.push(r.url());
      } catch { /* non-fatal */ }
    });

    const start = Date.now();

    const response = await page.goto(url, {
      timeout:   config.timeout_ms ?? 30_000,
      waitUntil: config.wait_for   ?? 'networkidle',
    });

    const load_time_ms = Date.now() - start;
    const status_code  = response?.status() ?? 0;
    const final_url    = response?.url()    ?? url;

    const html = await page.content();

    // Collect script src attributes
    const scriptSrcs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('script[src]'))
        .map((s: unknown) => (s as { getAttribute: (a: string) => string | null }).getAttribute('src') ?? '');
    }) as string[];

    for (const src of scriptSrcs) {
      if (src) scripts.push(src);
    }

    // Also include network request URLs that are JS files
    for (const r of resources) {
      if (r.endsWith('.js') || r.includes('.js?')) {
        const alreadyAdded = scripts.some((s) => s === r || r.includes(s));
        if (!alreadyAdded) scripts.push(r);
      }
    }

    await page.close();
    await browser.close();

    let page_hostname = '';
    try { page_hostname = new URL(final_url).hostname; } catch { /* ignore */ }

    const third_party_domains = extractThirdPartyDomains(scripts, page_hostname);

    return {
      url,
      html,
      status_code,
      final_url,
      load_time_ms,
      resource_count:      resources.length,
      failed_resources:    failed,
      scripts_fired:       scripts,
      third_party_domains,
      captured_at:         new Date().toISOString(),
    };
  } catch (err) {
    return errorResult(url, err instanceof Error ? err.message : String(err));
  }
}
