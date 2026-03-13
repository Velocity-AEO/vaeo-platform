/**
 * apps/dashboard/lib/lighthouse_display.ts
 *
 * Pure display helpers for Lighthouse score presentation.
 * VAEO uses mobile as primary — Google ranks based on mobile experience.
 *
 * Never throws.
 */

// ── getLighthouseScoreColor ───────────────────────────────────────────────────

/**
 * Returns a Tailwind text-color class for a Lighthouse performance score.
 *   >= 90 → green (good)
 *   >= 70 → yellow (needs improvement)
 *    < 70 → red (poor)
 */
export function getLighthouseScoreColor(score: number): string {
  try {
    const s = typeof score === 'number' ? score : 0;
    if (s >= 90) return 'text-green-600';
    if (s >= 70) return 'text-yellow-600';
    return 'text-red-600';
  } catch {
    return 'text-red-600';
  }
}

// ── getMobileDesktopGapLabel ──────────────────────────────────────────────────

/**
 * Returns a human-readable label for the mobile/desktop performance gap.
 *   null     → '—'
 *   gap <= 5 → 'Mobile/desktop comparable'
 *   gap <= 15 → 'Desktop {n}pts faster — mobile may need optimization'
 *   gap > 15 → 'Large mobile/desktop gap — consider mobile performance audit'
 *
 * gap = desktop.performance - mobile.performance
 * (positive = desktop faster — common and expected)
 */
export function getMobileDesktopGapLabel(gap: number | null): string {
  try {
    if (gap === null || gap === undefined) return '—';
    const g = typeof gap === 'number' ? gap : 0;
    if (g <= 5)  return 'Mobile/desktop comparable';
    if (g <= 15) return `Desktop ${Math.round(g)}pts faster — mobile may need optimization`;
    return 'Large mobile/desktop gap — consider mobile performance audit';
  } catch {
    return '—';
  }
}

// ── formatLighthouseScore ─────────────────────────────────────────────────────

/**
 * Formats a Lighthouse score as "{score}/100".
 * Returns '—' for null/undefined.
 * Never throws.
 */
export function formatLighthouseScore(score: number | null | undefined): string {
  try {
    if (score === null || score === undefined) return '—';
    return `${score}/100`;
  } catch {
    return '—';
  }
}
