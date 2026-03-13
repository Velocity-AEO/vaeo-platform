/**
 * apps/dashboard/lib/admin_link_graph_display.ts
 *
 * Display helpers for admin link graph dashboard. Never throws.
 */

// ── Health grade colors ─────────────────────────────────────────────────────

export function getGradeColor(grade: string): string {
  try {
    const map: Record<string, string> = {
      A: 'text-green-600',
      B: 'text-blue-600',
      C: 'text-yellow-600',
      D: 'text-orange-600',
      F: 'text-red-600',
    };
    return map[grade] ?? 'text-slate-600';
  } catch {
    return 'text-slate-600';
  }
}

export function getGradeBg(grade: string): string {
  try {
    const map: Record<string, string> = {
      A: 'bg-green-100 text-green-800',
      B: 'bg-blue-100 text-blue-800',
      C: 'bg-yellow-100 text-yellow-800',
      D: 'bg-orange-100 text-orange-800',
      F: 'bg-red-100 text-red-800',
    };
    return map[grade] ?? 'bg-slate-100 text-slate-800';
  } catch {
    return 'bg-slate-100 text-slate-800';
  }
}

// ── Build age formatting ────────────────────────────────────────────────────

export function formatBuildAge(hours: number | null): string {
  try {
    if (hours === null) return 'Never built';
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return 'Unknown';
  }
}

export function getBuildAgeColor(hours: number | null): string {
  try {
    if (hours === null) return 'text-red-600';
    if (hours <= 24) return 'text-green-600';
    if (hours <= 48) return 'text-yellow-600';
    return 'text-red-600';
  } catch {
    return 'text-slate-600';
  }
}

// ── Integrity issue severity ────────────────────────────────────────────────

export function getIntegritySeverityColor(severity: string): string {
  try {
    const map: Record<string, string> = {
      critical: 'text-red-600',
      warning: 'text-yellow-600',
      info: 'text-blue-600',
    };
    return map[severity] ?? 'text-slate-600';
  } catch {
    return 'text-slate-600';
  }
}

export function getIntegritySeverityBg(severity: string): string {
  try {
    const map: Record<string, string> = {
      critical: 'bg-red-100 text-red-800',
      warning: 'bg-yellow-100 text-yellow-800',
      info: 'bg-blue-100 text-blue-800',
    };
    return map[severity] ?? 'bg-slate-100 text-slate-800';
  } catch {
    return 'bg-slate-100 text-slate-800';
  }
}

// ── Integrity issue type labels ─────────────────────────────────────────────

export function getIntegrityIssueLabel(type: string): string {
  try {
    const map: Record<string, string> = {
      dangling_link: 'Dangling Link',
      orphaned_node: 'Orphaned Node',
      duplicate_edge: 'Duplicate Edge',
      self_loop: 'Self-Loop',
      missing_canonical_ref: 'Missing Canonical Reference',
      stale_data: 'Stale Data',
      empty_graph: 'Empty Graph',
    };
    return map[type] ?? 'Unknown Issue';
  } catch {
    return 'Unknown Issue';
  }
}

// ── Rebuild scope labels ────────────────────────────────────────────────────

export function getRebuildScopeLabel(scope: string): string {
  try {
    const map: Record<string, string> = {
      single: 'Single Site',
      stale: 'All Stale Sites',
      all: 'All Sites',
    };
    return map[scope] ?? 'Unknown';
  } catch {
    return 'Unknown';
  }
}

// ── Summary stat formatting ─────────────────────────────────────────────────

export function formatLargeNumber(n: number): string {
  try {
    if (typeof n !== 'number' || isNaN(n)) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  } catch {
    return '0';
  }
}
