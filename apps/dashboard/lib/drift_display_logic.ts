/**
 * apps/dashboard/lib/drift_display_logic.ts
 *
 * Display helpers for drift scan results.
 * Never throws.
 */

// ── Types (inlined) ──────────────────────────────────────────────────────────

type DriftStatus = 'stable' | 'drifted' | 'unknown';

interface DriftScanResult {
  fixes_scanned:  number;
  stable_fixes:   number;
  drifted_fixes:  number;
  drift_rate:     number;
}

// ── getDriftRateColor ────────────────────────────────────────────────────────

export function getDriftRateColor(rate: number): string {
  try {
    if (typeof rate !== 'number' || isNaN(rate)) return 'text-slate-500';
    if (rate === 0) return 'text-green-600';
    if (rate < 10) return 'text-yellow-600';
    return 'text-red-600';
  } catch {
    return 'text-slate-500';
  }
}

// ── getDriftStatusLabel ──────────────────────────────────────────────────────

export function getDriftStatusLabel(status: DriftStatus | string): string {
  try {
    const map: Record<string, string> = {
      stable:  'Stable',
      drifted: 'Drifted — requeued',
      unknown: 'Unknown',
    };
    return map[status as string] ?? 'Unknown';
  } catch {
    return 'Unknown';
  }
}

// ── getDriftCauseLabel ───────────────────────────────────────────────────────

export function getDriftCauseLabel(cause: string | null): string {
  try {
    if (!cause) return 'Unknown cause';
    const map: Record<string, string> = {
      theme_update:  'Theme update',
      plugin_update: 'Plugin update',
      cms_edit:      'Manual edit',
      cache_issue:   'Cache issue',
      cdn_issue:     'CDN issue',
    };
    return map[cause] ?? 'Unknown cause';
  } catch {
    return 'Unknown cause';
  }
}

// ── formatDriftSummaryHeadline ───────────────────────────────────────────────

export function formatDriftSummaryHeadline(result: DriftScanResult): string {
  try {
    if (!result) return 'No drift data available';
    const total = result.fixes_scanned ?? 0;
    const drifted = result.drifted_fixes ?? 0;

    if (drifted === 0) return `All ${total} fixes are stable`;
    if (drifted === 1) return '1 fix was overwritten — requeued';
    return `${drifted} fixes were overwritten — requeued`;
  } catch {
    return 'No drift data available';
  }
}
