/**
 * apps/dashboard/lib/velocity_display.ts
 *
 * Display helpers for link velocity trends.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

type VelocityTrendType =
  | 'gaining'
  | 'losing_gradual'
  | 'losing_sudden'
  | 'stable'
  | 'new_page'
  | 'insufficient_data';

interface LinkVelocityTrend {
  trend_type:      VelocityTrendType;
  is_hub_page:     boolean;
  alert_required:  boolean;
  current_inbound: number;
  change_7d:       number | null;
  authority_score: number | null;
}

// ── getVelocityTrendConfig ───────────────────────────────────────────────────

export function getVelocityTrendConfig(
  trend: VelocityTrendType,
): { label: string; color: string; icon: string } {
  try {
    switch (trend) {
      case 'gaining':           return { label: 'Gaining',          color: 'text-green-600',  icon: '↑' };
      case 'losing_sudden':     return { label: 'Sudden Loss',      color: 'text-red-600',    icon: '↓' };
      case 'losing_gradual':    return { label: 'Gradual Loss',     color: 'text-orange-500', icon: '↓' };
      case 'stable':            return { label: 'Stable',           color: 'text-slate-400',  icon: '→' };
      case 'new_page':          return { label: 'New',              color: 'text-blue-500',   icon: '+' };
      case 'insufficient_data': return { label: 'Not enough data',  color: 'text-slate-400',  icon: '—' };
      default:                  return { label: 'Unknown',          color: 'text-slate-400',  icon: '?' };
    }
  } catch {
    return { label: 'Unknown', color: 'text-slate-400', icon: '?' };
  }
}

// ── formatVelocityChange ─────────────────────────────────────────────────────

export function formatVelocityChange(
  change: number | null,
  pct:    number | null,
): string {
  try {
    if (change == null) return '—';
    if (change === 0) return 'No change';

    const pctStr = pct != null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : '';

    if (change > 0) return `+${change} links${pctStr}`;
    return `${change} links${pctStr}`;
  } catch {
    return '—';
  }
}

// ── getVelocityAlertLevel ────────────────────────────────────────────────────

export function getVelocityAlertLevel(
  trend: LinkVelocityTrend,
): 'critical' | 'warning' | 'none' {
  try {
    if (!trend) return 'none';
    if (trend.is_hub_page && trend.trend_type === 'losing_sudden') return 'critical';
    if (trend.alert_required && !trend.is_hub_page) return 'warning';
    return 'none';
  } catch {
    return 'none';
  }
}
