/**
 * tools/aeo/aeo_score_calculator.ts
 *
 * Standalone AEO (Answer Engine Optimization) score calculator.
 * Measures readiness for AI search and voice assistants.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface AEOSignal {
  signal_name:        string;
  present:            boolean;
  weight:             number;
  score_contribution: number;
  label:              string;
  recommendation:     string | null;
}

export interface AEOScore {
  site_id:              string;
  url:                  string;
  score:                number;
  max_score:            number;
  percentage:           number;
  grade:                'A' | 'B' | 'C' | 'D' | 'F';
  signals:              AEOSignal[];
  top_recommendation:   string | null;
  calculated_at:        string;
}

// ── Signal definitions ───────────────────────────────────────────────────────

export const AEO_SIGNALS: Record<string, { weight: number; label: string; recommendation: string }> = {
  speakable_schema: {
    weight: 25,
    label: 'Speakable Schema',
    recommendation: 'Add speakable schema to mark content for voice search',
  },
  faq_schema: {
    weight: 20,
    label: 'FAQ Schema',
    recommendation: 'Add FAQ schema to target featured snippets',
  },
  how_to_schema: {
    weight: 15,
    label: 'HowTo Schema',
    recommendation: 'Add HowTo schema for step-by-step content',
  },
  article_schema: {
    weight: 15,
    label: 'Article Schema',
    recommendation: 'Add Article schema for news and blog content',
  },
  breadcrumb_schema: {
    weight: 10,
    label: 'Breadcrumb Schema',
    recommendation: 'Add Breadcrumb schema for navigation clarity',
  },
  meta_description: {
    weight: 10,
    label: 'Meta Description',
    recommendation: 'Add meta description — used by AI for page summaries',
  },
  structured_headings: {
    weight: 5,
    label: 'Structured Headings (H1-H3)',
    recommendation: 'Use clear H1/H2/H3 hierarchy for AI content parsing',
  },
};

// ── detectAEOSignals ─────────────────────────────────────────────────────────

export function detectAEOSignals(html: string, url: string): Record<string, boolean> {
  try {
    const h = html ?? '';
    return {
      speakable_schema:    /"@type"\s*:\s*"Speakable"/i.test(h),
      faq_schema:          /"@type"\s*:\s*"FAQPage"/i.test(h),
      how_to_schema:       /"@type"\s*:\s*"HowTo"/i.test(h),
      article_schema:      /"@type"\s*:\s*"Article"/i.test(h),
      breadcrumb_schema:   /"@type"\s*:\s*"BreadcrumbList"/i.test(h),
      meta_description:    /<meta\s[^>]*name\s*=\s*["']description["'][^>]*>/i.test(h),
      structured_headings: /<h1[\s>]/i.test(h) && /<h2[\s>]/i.test(h) && /<h3[\s>]/i.test(h),
    };
  } catch {
    return Object.fromEntries(Object.keys(AEO_SIGNALS).map(k => [k, false]));
  }
}

// ── calculateAEOScore ────────────────────────────────────────────────────────

function assignGrade(percentage: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (percentage >= 90) return 'A';
  if (percentage >= 75) return 'B';
  if (percentage >= 60) return 'C';
  if (percentage >= 40) return 'D';
  return 'F';
}

export function calculateAEOScore(html: string, site_id: string, url: string): AEOScore {
  try {
    const detected = detectAEOSignals(html, url);
    const signals: AEOSignal[] = [];
    let score = 0;
    const maxScore = 100;
    let topRec: string | null = null;
    let topRecWeight = -1;

    for (const [key, def] of Object.entries(AEO_SIGNALS)) {
      const present = detected[key] ?? false;
      const contribution = present ? def.weight : 0;
      score += contribution;

      signals.push({
        signal_name:        key,
        present,
        weight:             def.weight,
        score_contribution: contribution,
        label:              def.label,
        recommendation:     present ? null : def.recommendation,
      });

      if (!present && def.weight > topRecWeight) {
        topRecWeight = def.weight;
        topRec = def.recommendation;
      }
    }

    const percentage = Math.round((score / maxScore) * 100);

    return {
      site_id,
      url,
      score,
      max_score:           maxScore,
      percentage,
      grade:               assignGrade(percentage),
      signals,
      top_recommendation:  topRec,
      calculated_at:       new Date().toISOString(),
    };
  } catch {
    return {
      site_id:            site_id ?? '',
      url:                url ?? '',
      score:              0,
      max_score:          100,
      percentage:         0,
      grade:              'F',
      signals:            [],
      top_recommendation: null,
      calculated_at:      new Date().toISOString(),
    };
  }
}

// ── calculateSiteAEOScore ────────────────────────────────────────────────────

export interface SiteAEOSummary {
  average_score:        number;
  grade:                string;
  page_scores:          AEOScore[];
  top_recommendations:  string[];
}

export async function calculateSiteAEOScore(
  site_id: string,
  sample_size = 10,
  deps?: { loadPagesFn?: (site_id: string, limit: number) => Promise<Array<{ html: string; url: string }>> },
): Promise<SiteAEOSummary> {
  try {
    const loadPages = deps?.loadPagesFn ?? defaultLoadPages;
    const pages = await loadPages(site_id, sample_size);

    if (!pages || pages.length === 0) {
      return { average_score: 0, grade: 'F', page_scores: [], top_recommendations: [] };
    }

    const scores = pages.map(p => calculateAEOScore(p.html, site_id, p.url));
    const avg = scores.reduce((s, p) => s + p.percentage, 0) / scores.length;
    const grade = assignGrade(Math.round(avg));

    const recSet = new Set<string>();
    for (const s of scores) {
      if (s.top_recommendation) recSet.add(s.top_recommendation);
    }

    return {
      average_score:       Math.round(avg),
      grade,
      page_scores:         scores,
      top_recommendations: [...recSet].slice(0, 5),
    };
  } catch {
    return { average_score: 0, grade: 'F', page_scores: [], top_recommendations: [] };
  }
}

async function defaultLoadPages(_site_id: string, _limit: number) {
  return [] as Array<{ html: string; url: string }>;
}
