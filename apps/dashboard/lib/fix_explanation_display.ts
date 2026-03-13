/**
 * apps/dashboard/lib/fix_explanation_display.ts
 *
 * Display helpers for fix explanations.
 * Never throws.
 */

import type { FixExplanation, FixExplanationCategory } from '../../../tools/explanations/fix_explanation_registry.js';

// ── Category badge config ────────────────────────────────────────────────────

const BADGE_CONFIG: Record<FixExplanationCategory, { label: string; color: string }> = {
  seo:           { label: 'SEO',           color: 'bg-blue-100 text-blue-700' },
  aeo:           { label: 'AEO',           color: 'bg-purple-100 text-purple-700' },
  technical:     { label: 'Technical',     color: 'bg-gray-100 text-gray-700' },
  accessibility: { label: 'Accessibility', color: 'bg-green-100 text-green-700' },
  social:        { label: 'Social',        color: 'bg-orange-100 text-orange-700' },
};

export function getCategoryBadgeConfig(
  category: FixExplanationCategory,
): { label: string; color: string } {
  try {
    return BADGE_CONFIG[category] ?? BADGE_CONFIG.seo;
  } catch {
    return BADGE_CONFIG.seo;
  }
}

// ── Explanation preview ──────────────────────────────────────────────────────

export function formatExplanationPreview(explanation: FixExplanation): string {
  try {
    const text = explanation?.what_we_did ?? '';
    if (text.length <= 80) return text;
    return text.slice(0, 80) + '…';
  } catch {
    return '';
  }
}
