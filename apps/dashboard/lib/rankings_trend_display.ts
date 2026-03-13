/**
 * apps/dashboard/lib/rankings_trend_display.ts
 *
 * Pure display logic for keyword movement trending.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type TrendDirection = 'improved' | 'declined' | 'stable' | 'new';

export interface KeywordTrendDisplay {
  keyword:          string;
  current_position: number;
  previous_position: number | null;
  position_change:  number;
  direction:        TrendDirection;
}

// ── Functions ────────────────────────────────────────────────────────────────

export function getDirectionLabel(direction: TrendDirection): string {
  try {
    switch (direction) {
      case 'improved': return 'Improved';
      case 'declined': return 'Declined';
      case 'stable':   return 'Stable';
      case 'new':      return 'New';
      default:         return 'Unknown';
    }
  } catch {
    return 'Unknown';
  }
}

export function getDirectionColor(direction: TrendDirection): string {
  try {
    switch (direction) {
      case 'improved': return 'text-green-600';
      case 'declined': return 'text-red-500';
      case 'stable':   return 'text-slate-400';
      case 'new':      return 'text-purple-500';
      default:         return 'text-slate-400';
    }
  } catch {
    return 'text-slate-400';
  }
}

export function getDirectionBgColor(direction: TrendDirection): string {
  try {
    switch (direction) {
      case 'improved': return 'bg-green-50 border-green-200';
      case 'declined': return 'bg-red-50 border-red-200';
      case 'stable':   return 'bg-slate-50 border-slate-200';
      case 'new':      return 'bg-purple-50 border-purple-200';
      default:         return 'bg-slate-50 border-slate-200';
    }
  } catch {
    return 'bg-slate-50 border-slate-200';
  }
}

export function getDirectionIcon(direction: TrendDirection): string {
  try {
    switch (direction) {
      case 'improved': return '\u2191';
      case 'declined': return '\u2193';
      case 'stable':   return '\u2014';
      case 'new':      return 'NEW';
      default:         return '\u2014';
    }
  } catch {
    return '\u2014';
  }
}

export function formatPositionChange(change: number): string {
  try {
    if (change === 0) return '\u2014';
    const abs = Math.abs(change);
    return change > 0 ? `+${abs}` : `-${abs}`;
  } catch {
    return '\u2014';
  }
}

export function formatMovementLabel(keyword: string, previous: number | null, current: number): string {
  try {
    if (previous === null) return `${keyword} is a new keyword at position ${current}`;
    if (previous === current) return `${keyword} held steady at position ${current}`;
    if (previous > current) {
      return `${keyword} moved from position ${previous} to position ${current}`;
    }
    return `${keyword} dropped from position ${previous} to position ${current}`;
  } catch {
    return keyword ?? '';
  }
}

export function getPeriodLabel(period: string): string {
  try {
    if (period === 'week') return 'Week over Week';
    if (period === 'month') return 'Month over Month';
    return period;
  } catch {
    return '';
  }
}

export function getSummaryText(improved: number, declined: number, total: number): string {
  try {
    if (total === 0) return 'No keyword data available';
    const parts: string[] = [];
    if (improved > 0) parts.push(`${improved} improved`);
    if (declined > 0) parts.push(`${declined} declined`);
    if (parts.length === 0) return `All ${total} keywords stable`;
    return parts.join(', ') + ` of ${total} keywords`;
  } catch {
    return '';
  }
}

export function sortTrendsByImpact(
  trends: KeywordTrendDisplay[],
  order: 'best' | 'worst' = 'best',
): KeywordTrendDisplay[] {
  try {
    const safe = [...(trends ?? [])];
    if (order === 'best') {
      return safe.sort((a, b) => b.position_change - a.position_change);
    }
    return safe.sort((a, b) => a.position_change - b.position_change);
  } catch {
    return [];
  }
}

export function getAvgChangeColor(avg: number): string {
  try {
    if (avg > 0) return 'text-green-600';
    if (avg < 0) return 'text-red-500';
    return 'text-slate-500';
  } catch {
    return 'text-slate-500';
  }
}
