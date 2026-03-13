/**
 * apps/dashboard/lib/lighthouse_trend_display.ts
 *
 * Display helpers for Lighthouse trend data.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

type TrendType =
  | 'improving'
  | 'degrading_gradual'
  | 'degrading_sudden'
  | 'stable'
  | 'volatile'
  | 'insufficient_data';

// ── getTrendBadgeConfig ──────────────────────────────────────────────────────

export function getTrendBadgeConfig(
  trend: TrendType | string,
): { label: string; color: string } {
  try {
    const map: Record<string, { label: string; color: string }> = {
      improving:          { label: '↑ Improving',         color: 'text-green-600 bg-green-50' },
      stable:             { label: '→ Stable',            color: 'text-slate-600 bg-slate-50' },
      degrading_gradual:  { label: '↓ Gradual decline',   color: 'text-yellow-600 bg-yellow-50' },
      degrading_sudden:   { label: '↓ Sudden drop',       color: 'text-red-600 bg-red-50' },
      volatile:           { label: '~ Volatile',          color: 'text-orange-600 bg-orange-50' },
      insufficient_data:  { label: '— Not enough data',   color: 'text-slate-400 bg-slate-50' },
    };
    return map[trend as string] ?? { label: '— Unknown', color: 'text-slate-400 bg-slate-50' };
  } catch {
    return { label: '— Unknown', color: 'text-slate-400 bg-slate-50' };
  }
}

// ── formatScoreChange ────────────────────────────────────────────────────────

export function formatScoreChange(change: number | null): string {
  try {
    if (change === null || change === undefined) return '—';
    if (change === 0) return '0';
    if (change > 0) return `+${change}`;
    return `${change}`;
  } catch {
    return '—';
  }
}

// ── getProjectedScoreWarning ─────────────────────────────────────────────────

export function getProjectedScoreWarning(projected: number | null): string | null {
  try {
    if (projected === null || projected === undefined) return null;
    if (projected < 50) return 'Critical — will drop below 50';
    if (projected < 70) return 'Warning — will drop below 70';
    return null;
  } catch {
    return null;
  }
}
