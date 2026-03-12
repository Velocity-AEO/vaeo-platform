/**
 * tools/wordpress/plugin_conflict_detector.ts
 *
 * Detects active SEO plugins and determines what signals VAEO
 * is safe to write without conflicting with existing plugins.
 *
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type SEOPlugin = 'yoast' | 'rankmath' | 'aioseo' | 'none';

export interface ActivePlugins {
  yoast:         boolean;
  rankmath:      boolean;
  aioseo:        boolean;
  detected:      SEOPlugin[];
  conflict_risk: boolean;
}

export interface SEOCoverage {
  title_tag:        SEOPlugin | null;
  meta_description: SEOPlugin | null;
  og_tags:          SEOPlugin | null;
  twitter_tags:     SEOPlugin | null;
  json_ld_schema:   SEOPlugin | null;
  canonical:        SEOPlugin | null;
}

// ── detectActivePlugins ──────────────────────────────────────────────────────

export function detectActivePlugins(plugin_slugs: string[]): ActivePlugins {
  try {
    const slugs = new Set(plugin_slugs.map((s) => s.toLowerCase().trim()));

    const yoast = slugs.has('wordpress-seo') || slugs.has('wordpress-seo-premium');
    const rankmath = slugs.has('seo-by-rank-math') || slugs.has('seo-by-rank-math-pro');
    const aioseo = slugs.has('all-in-one-seo-pack');

    const detected: SEOPlugin[] = [];
    if (yoast) detected.push('yoast');
    if (rankmath) detected.push('rankmath');
    if (aioseo) detected.push('aioseo');

    return {
      yoast,
      rankmath,
      aioseo,
      detected,
      conflict_risk: detected.length > 1,
    };
  } catch {
    return { yoast: false, rankmath: false, aioseo: false, detected: [], conflict_risk: false };
  }
}

// ── detectSEOCoverage ────────────────────────────────────────────────────────

export function detectSEOCoverage(html: string, active_plugins: ActivePlugins): SEOCoverage {
  try {
    // Determine which plugin is active in the HTML via comments
    let owner: SEOPlugin | null = null;
    if (active_plugins.yoast && html.includes('Yoast SEO')) owner = 'yoast';
    else if (active_plugins.rankmath && html.includes('Rank Math SEO')) owner = 'rankmath';
    else if (active_plugins.aioseo && html.includes('All in One SEO')) owner = 'aioseo';

    const hasTitle = /<title[^>]*>/i.test(html);
    const hasMeta = /<meta\s[^>]*name\s*=\s*["']description["'][^>]*>/i.test(html);
    const hasOG = /<meta\s[^>]*property\s*=\s*["']og:title["'][^>]*>/i.test(html);
    const hasTwitter = /<meta\s[^>]*name\s*=\s*["']twitter:card["'][^>]*>/i.test(html);
    const hasJsonLd = /application\/ld\+json/i.test(html);
    const hasCanonical = /<link\s[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.test(html);

    return {
      title_tag:        hasTitle ? (owner ?? 'none') : null,
      meta_description: hasMeta ? (owner ?? 'none') : null,
      og_tags:          hasOG ? (owner ?? 'none') : null,
      twitter_tags:     hasTwitter ? (owner ?? 'none') : null,
      json_ld_schema:   hasJsonLd ? (owner ?? 'none') : null,
      canonical:        hasCanonical ? (owner ?? 'none') : null,
    };
  } catch {
    return {
      title_tag: null,
      meta_description: null,
      og_tags: null,
      twitter_tags: null,
      json_ld_schema: null,
      canonical: null,
    };
  }
}

// ── buildSafeWriteList ───────────────────────────────────────────────────────

export function buildSafeWriteList(coverage: SEOCoverage): string[] {
  try {
    const safe: string[] = [];
    if (coverage.title_tag === null) safe.push('title_tag');
    if (coverage.meta_description === null) safe.push('meta_description');
    if (coverage.og_tags === null) safe.push('og_tags');
    if (coverage.twitter_tags === null) safe.push('twitter_tags');
    if (coverage.json_ld_schema === null) safe.push('json_ld_schema');
    if (coverage.canonical === null) safe.push('canonical');
    return safe;
  } catch {
    return [];
  }
}
