/**
 * tools/sandbox/wp_lighthouse_runner.ts
 *
 * Mobile-first Lighthouse configuration for WordPress sandbox runs.
 * Runs mobile as primary (matching Google's ranking signal),
 * desktop as secondary for comparison.
 *
 * Injectable deps. Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type LighthouseFormFactor = 'mobile' | 'desktop';

export interface WPLighthouseConfig {
  /** Default: 'mobile' */
  form_factor:           LighthouseFormFactor;
  /** Run desktop after mobile for gap comparison. Default: true */
  run_desktop_secondary: boolean;
}

export interface WPLighthouseScore {
  url:            string;
  performance:    number;
  accessibility:  number;
  best_practices: number;
  seo:            number;
  lcp:            number;
  fid:            number;
  cls:            number;
  form_factor:    LighthouseFormFactor;
  /** true = this is the primary (mobile) score */
  is_primary:     boolean;
  measured_at:    string;
  error?:         string;
}

export interface WPLighthouseFullResult {
  url:                  string;
  mobile:               WPLighthouseScore;
  desktop:              WPLighthouseScore | null;
  /** Always = mobile result */
  primary_score:        WPLighthouseScore;
  /** desktop.performance - mobile.performance (positive = desktop faster) */
  mobile_desktop_gap:   number | null;
  measured_at:          string;
}

export interface WPLighthouseDelta {
  before_score:               number;
  after_score:                number;
  delta:                      number;
  regression_detected:        boolean;
  mobile_performance_delta:   number | null;
  desktop_performance_delta:  number | null;
  /** Always = mobile_performance_delta */
  primary_delta:              number | null;
}

export interface WPLighthouseRunnerDeps {
  lighthouseFn?: (url: string, form_factor: LighthouseFormFactor) => Promise<WPLighthouseScore>;
}

// ── Config constants ──────────────────────────────────────────────────────────

export const MOBILE_LIGHTHOUSE_CONFIG = {
  formFactor: 'mobile' as const,
  screenEmulation: {
    mobile:            true,
    width:             375,
    height:            812,
    deviceScaleFactor: 3,
    disabled:          false,
  },
  throttling: {
    rttMs:                   150,
    throughputKbps:          1638.4,
    cpuSlowdownMultiplier:   4,
  },
  categories: ['performance', 'seo', 'accessibility', 'best-practices'] as const,
} as const;

export const DESKTOP_LIGHTHOUSE_CONFIG = {
  formFactor: 'desktop' as const,
  screenEmulation: {
    mobile:            false,
    width:             1350,
    height:            940,
    deviceScaleFactor: 1,
    disabled:          false,
  },
  throttling: {
    rttMs:                  40,
    throughputKbps:         10240,
    cpuSlowdownMultiplier:  1,
  },
  categories: ['performance', 'seo', 'accessibility', 'best-practices'] as const,
} as const;

// ── Defaults ──────────────────────────────────────────────────────────────────

async function defaultLighthouseFn(
  url:         string,
  form_factor: LighthouseFormFactor,
): Promise<WPLighthouseScore> {
  // Stub — callers inject a real PSI/Lighthouse client in production.
  return emptyScore(url, form_factor);
}

function emptyScore(url: string, form_factor: LighthouseFormFactor): WPLighthouseScore {
  return {
    url,
    performance:    0,
    accessibility:  0,
    best_practices: 0,
    seo:            0,
    lcp:            0,
    fid:            0,
    cls:            0,
    form_factor,
    is_primary:  form_factor === 'mobile',
    measured_at: new Date().toISOString(),
  };
}

// ── runWPLighthouse ───────────────────────────────────────────────────────────

/**
 * Run a single Lighthouse pass.
 * Defaults to mobile (MOBILE_LIGHTHOUSE_CONFIG).
 * Never throws.
 */
export async function runWPLighthouse(
  url:     string,
  config?: Partial<WPLighthouseConfig>,
  deps?:   WPLighthouseRunnerDeps,
): Promise<WPLighthouseScore> {
  const measured_at = new Date().toISOString();
  const form_factor = config?.form_factor ?? 'mobile';

  try {
    const fn = deps?.lighthouseFn ?? defaultLighthouseFn;
    const score = await fn(url, form_factor);
    return {
      ...score,
      form_factor,
      is_primary:  form_factor === 'mobile',
      measured_at: score.measured_at ?? measured_at,
    };
  } catch {
    return {
      ...emptyScore(url, form_factor),
      measured_at,
      error: 'lighthouse_failed',
    };
  }
}

// ── runWPLighthouseFull ───────────────────────────────────────────────────────

/**
 * Runs mobile first (primary), then desktop if run_desktop_secondary=true.
 * primary_score is always the mobile result.
 * mobile_desktop_gap = desktop.performance − mobile.performance
 *   (positive = desktop faster than mobile — common and expected)
 * Never throws.
 */
export async function runWPLighthouseFull(
  url:     string,
  config?: Partial<WPLighthouseConfig>,
  deps?:   WPLighthouseRunnerDeps,
): Promise<WPLighthouseFullResult> {
  const measured_at          = new Date().toISOString();
  const run_desktop_secondary = config?.run_desktop_secondary ?? true;

  try {
    // Mobile first — always the primary
    const mobile = await runWPLighthouse(url, { ...config, form_factor: 'mobile' }, deps);

    // Desktop second (optional)
    let desktop: WPLighthouseScore | null = null;
    if (run_desktop_secondary) {
      desktop = await runWPLighthouse(url, { ...config, form_factor: 'desktop' }, deps);
    }

    const mobile_desktop_gap = desktop !== null
      ? desktop.performance - mobile.performance
      : null;

    return {
      url,
      mobile,
      desktop,
      primary_score:      mobile,
      mobile_desktop_gap,
      measured_at,
    };
  } catch {
    const fallback = emptyScore(url, 'mobile');
    return {
      url,
      mobile:             { ...fallback, measured_at, error: 'lighthouse_failed' },
      desktop:            null,
      primary_score:      { ...fallback, measured_at, error: 'lighthouse_failed' },
      mobile_desktop_gap: null,
      measured_at,
    };
  }
}

// ── runWPLighthouseDelta ──────────────────────────────────────────────────────

/**
 * Computes the performance delta between two full Lighthouse runs.
 * regression_detected is based on mobile (primary) — matching Google ranking signal.
 * Never throws.
 */
export function runWPLighthouseDelta(
  before:                WPLighthouseFullResult,
  after:                 WPLighthouseFullResult,
  regression_threshold = 5,
): WPLighthouseDelta {
  try {
    const mobile_performance_delta  = after.mobile.performance - before.mobile.performance;

    const desktop_performance_delta =
      before.desktop !== null && after.desktop !== null
        ? after.desktop.performance - before.desktop.performance
        : null;

    const primary_delta      = mobile_performance_delta;
    const regression_detected = primary_delta < -regression_threshold;

    return {
      before_score:              before.mobile.performance,
      after_score:               after.mobile.performance,
      delta:                     mobile_performance_delta,
      regression_detected,
      mobile_performance_delta,
      desktop_performance_delta,
      primary_delta,
    };
  } catch {
    return {
      before_score:              0,
      after_score:               0,
      delta:                     0,
      regression_detected:       false,
      mobile_performance_delta:  null,
      desktop_performance_delta: null,
      primary_delta:             null,
    };
  }
}
