/**
 * tools/sandbox/lighthouse_runner.ts
 *
 * Lighthouse integration via Google PageSpeed Insights API.
 * Fetches performance, accessibility, best-practices, and SEO scores,
 * plus Core Web Vitals (LCP, FID/INP, CLS) and optimization opportunities.
 *
 * Injectable fetch for tests. Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface LighthouseOpportunity {
  id:          string;
  title:       string;
  savings_ms?: number;
}

export interface LighthouseResult {
  url:            string;
  fetchedAt:      string;
  performance:    number;
  accessibility:  number;
  best_practices: number;
  seo:            number;
  lcp:            number;
  fid:            number;
  cls:            number;
  opportunities:  LighthouseOpportunity[];
  error?:         string;
}

export interface LighthouseOptions {
  strategy?: 'mobile' | 'desktop';
  fetch?:    typeof fetch;
  apiKey?:   string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeScore(categories: Record<string, unknown>, key: string): number {
  const cat = categories[key] as { score?: number } | undefined;
  return typeof cat?.score === 'number' ? Math.round(cat.score * 100) : 0;
}

function safeMetric(audits: Record<string, unknown>, id: string): number {
  const audit = audits[id] as { numericValue?: number } | undefined;
  return typeof audit?.numericValue === 'number' ? audit.numericValue : 0;
}

function extractOpportunities(audits: Record<string, unknown>): LighthouseOpportunity[] {
  const opportunities: LighthouseOpportunity[] = [];

  const opportunityIds = [
    'render-blocking-resources',
    'unused-css-rules',
    'unused-javascript',
    'modern-image-formats',
    'offscreen-images',
    'unminified-css',
    'unminified-javascript',
    'efficient-animated-content',
    'uses-text-compression',
    'uses-responsive-images',
    'uses-optimized-images',
    'server-response-time',
    'redirects',
    'uses-rel-preconnect',
    'uses-rel-preload',
    'font-display',
    'third-party-summary',
  ];

  for (const id of opportunityIds) {
    const audit = audits[id] as {
      score?: number | null;
      title?: string;
      numericValue?: number;
      details?: { overallSavingsMs?: number };
    } | undefined;

    if (!audit) continue;
    // Only include failed audits (score < 1 or null)
    if (audit.score === 1) continue;

    const savings = audit.details?.overallSavingsMs ?? audit.numericValue;

    opportunities.push({
      id,
      title:      audit.title ?? id,
      savings_ms: typeof savings === 'number' ? Math.round(savings) : undefined,
    });
  }

  return opportunities;
}

// ── runLighthouse ────────────────────────────────────────────────────────────

/**
 * Run a Lighthouse audit via the Google PageSpeed Insights API.
 *
 * Returns scores (0-100) for performance, accessibility, best-practices, SEO,
 * plus Core Web Vitals and optimization opportunities.
 *
 * Never throws — returns error field on failure.
 */
export async function runLighthouse(
  url: string,
  options?: LighthouseOptions,
): Promise<LighthouseResult> {
  const fetchedAt = new Date().toISOString();
  const fetchFn  = options?.fetch ?? fetch;
  const strategy = options?.strategy ?? 'mobile';

  const empty: LighthouseResult = {
    url,
    fetchedAt,
    performance:    0,
    accessibility:  0,
    best_practices: 0,
    seo:            0,
    lcp:            0,
    fid:            0,
    cls:            0,
    opportunities:  [],
  };

  try {
    const params = new URLSearchParams({
      url,
      strategy,
      category: 'performance',
    });
    // PSI API accepts multiple category params
    params.append('category', 'accessibility');
    params.append('category', 'best-practices');
    params.append('category', 'seo');

    if (options?.apiKey) {
      params.set('key', options.apiKey);
    }

    const apiUrl = `${PSI_ENDPOINT}?${params.toString()}`;
    const res = await fetchFn(apiUrl);

    if (!res.ok) {
      const text = await res.text();
      return { ...empty, error: `PSI API returned ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = await res.json() as {
      lighthouseResult?: {
        categories?: Record<string, unknown>;
        audits?:     Record<string, unknown>;
      };
      error?: { message?: string };
    };

    if (data.error) {
      return { ...empty, error: data.error.message ?? 'Unknown PSI error' };
    }

    const lr = data.lighthouseResult;
    if (!lr) {
      return { ...empty, error: 'No lighthouseResult in response' };
    }

    const categories = lr.categories ?? {};
    const audits     = lr.audits ?? {};

    return {
      url,
      fetchedAt,
      performance:    safeScore(categories, 'performance'),
      accessibility:  safeScore(categories, 'accessibility'),
      best_practices: safeScore(categories, 'best-practices'),
      seo:            safeScore(categories, 'seo'),
      lcp:            safeMetric(audits, 'largest-contentful-paint'),
      fid:            safeMetric(audits, 'max-potential-fid'),
      cls:            safeMetric(audits, 'cumulative-layout-shift'),
      opportunities:  extractOpportunities(audits),
    };
  } catch (err) {
    return {
      ...empty,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
