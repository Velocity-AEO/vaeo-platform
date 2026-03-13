/**
 * apps/dashboard/lib/sandbox_health_display.ts
 *
 * Display helpers for sandbox health metrics. Never throws.
 */

// ── getPassRateLabel ─────────────────────────────────────────────────────────

export function getPassRateLabel(rate: number): string {
  try {
    if (rate >= 95) return 'Excellent';
    if (rate >= 85) return 'Good';
    if (rate >= 70) return 'Acceptable';
    return 'Needs Attention';
  } catch {
    return 'Unknown';
  }
}

// ── getPassRateColor ─────────────────────────────────────────────────────────

export function getPassRateColor(rate: number): string {
  try {
    if (rate >= 85) return 'text-green-600';
    if (rate >= 70) return 'text-yellow-600';
    return 'text-red-600';
  } catch {
    return 'text-slate-500';
  }
}

// ── getTrendIcon ─────────────────────────────────────────────────────────────

export function getTrendIcon(trend: string): string {
  try {
    if (trend === 'improving') return '↑';
    if (trend === 'degrading') return '↓';
    return '→';
  } catch {
    return '→';
  }
}

// ── formatFailureReason ──────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  delta_verify_failed:       'Change not detected',
  lighthouse_regression:     'Performance drop',
  html_snapshot_failed:      'Snapshot error',
  viewport_capture_timeout:  'Capture timeout',
  viewport_qa_failed:        'Visual QA failed',
  regression_monitor_failed: 'Regression detected',
};

export function formatFailureReason(reason: string): string {
  try {
    if (!reason) return 'Unknown';
    return REASON_LABELS[reason] ?? reason;
  } catch {
    return 'Unknown';
  }
}
