/**
 * tools/apps/environment_scanner.ts
 *
 * Scans page HTML for third-party app signatures using the
 * fingerprint catalog. Returns detected apps with confidence
 * levels, cost estimates, and performance offender lists.
 *
 * Pure function — never throws.
 */

import {
  APP_FINGERPRINT_CATALOG,
  type AppCategory,
  type AppFingerprint,
} from './app_fingerprint_catalog.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DetectedApp {
  fingerprint:            AppFingerprint;
  confidence:             'high' | 'medium' | 'low';
  matched_patterns:       string[];
  estimated_monthly_cost: number;
  performance_impact:     string;
}

export interface EnvironmentScan {
  site_id:                   string;
  url:                       string;
  scanned_at:                string;
  detected_apps:             DetectedApp[];
  total_apps_detected:       number;
  regulatory_exempt_count:   number;
  replaceable_count:         number;
  estimated_monthly_spend:   number;
  performance_offenders:     DetectedApp[];
  vaeo_replacement_savings:  number;
  app_categories:            Record<AppCategory, number>;
}

// ── Scanner ──────────────────────────────────────────────────────────────────

export function scanEnvironment(
  site_id: string,
  url: string,
  html: string,
): EnvironmentScan {
  const allCategories: AppCategory[] = [
    'seo', 'shipping', 'reviews', 'upsell', 'popup',
    'chat', 'social', 'loyalty', 'analytics', 'email',
    'payments', 'inventory', 'forms', 'other',
  ];
  const categoryCounts = Object.fromEntries(
    allCategories.map((c) => [c, 0]),
  ) as Record<AppCategory, number>;

  const detected: DetectedApp[] = [];

  try {
    if (!html) {
      return {
        site_id,
        url,
        scanned_at:                new Date().toISOString(),
        detected_apps:             [],
        total_apps_detected:       0,
        regulatory_exempt_count:   0,
        replaceable_count:         0,
        estimated_monthly_spend:   0,
        performance_offenders:     [],
        vaeo_replacement_savings:  0,
        app_categories:            categoryCounts,
      };
    }

    const htmlLower = html.toLowerCase();

    for (const fp of APP_FINGERPRINT_CATALOG) {
      const matchedPatterns: string[] = [];

      // Check script patterns (case-insensitive)
      for (const pattern of fp.script_patterns) {
        if (htmlLower.includes(pattern.toLowerCase())) {
          matchedPatterns.push(`script:${pattern}`);
        }
      }

      // Check domain patterns
      for (const domain of fp.domain_patterns) {
        if (htmlLower.includes(domain.toLowerCase())) {
          matchedPatterns.push(`domain:${domain}`);
        }
      }

      // Check DOM patterns (class names, data attributes)
      for (const dom of fp.dom_patterns) {
        if (htmlLower.includes(dom.toLowerCase())) {
          matchedPatterns.push(`dom:${dom}`);
        }
      }

      // Check cookie patterns (in HTML meta/script references)
      for (const cookie of fp.cookie_patterns) {
        if (htmlLower.includes(cookie.toLowerCase())) {
          matchedPatterns.push(`cookie:${cookie}`);
        }
      }

      if (matchedPatterns.length === 0) continue;

      const confidence: 'high' | 'medium' | 'low' =
        matchedPatterns.length >= 3 ? 'high' :
        matchedPatterns.length === 2 ? 'medium' : 'low';

      detected.push({
        fingerprint:            fp,
        confidence,
        matched_patterns:       matchedPatterns,
        estimated_monthly_cost: fp.monthly_cost_usd ?? 0,
        performance_impact:     fp.performance_impact,
      });

      categoryCounts[fp.category]++;
    }
  } catch {
    // Never throws
  }

  const regulatoryExempt = detected.filter((d) => d.fingerprint.regulatory_exempt).length;
  const replaceable = detected.filter((d) => d.fingerprint.replaceable_by_vaeo).length;
  const totalSpend = detected.reduce((sum, d) => sum + d.estimated_monthly_cost, 0);

  const replaceableSavings = detected
    .filter((d) => d.fingerprint.replaceable_by_vaeo && !d.fingerprint.regulatory_exempt)
    .reduce((sum, d) => sum + d.estimated_monthly_cost, 0);

  const offenders = detected.filter(
    (d) => d.fingerprint.performance_impact === 'high' || d.fingerprint.performance_impact === 'critical',
  );

  return {
    site_id,
    url,
    scanned_at:                new Date().toISOString(),
    detected_apps:             detected,
    total_apps_detected:       detected.length,
    regulatory_exempt_count:   regulatoryExempt,
    replaceable_count:         replaceable,
    estimated_monthly_spend:   totalSpend,
    performance_offenders:     offenders,
    vaeo_replacement_savings:  replaceableSavings,
    app_categories:            categoryCounts,
  };
}
