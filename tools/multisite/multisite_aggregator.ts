/**
 * tools/multisite/multisite_aggregator.ts
 *
 * Aggregates per-site health snapshots into a multi-site summary.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SiteSnapshot {
  site_id:           string;
  domain:            string;
  platform:          'shopify' | 'wordpress';
  health_score:      number | null;
  fixes_applied_7d:  number;
  fixes_failed_7d:   number;
  open_issues:       number;
  last_run_at:       string | null;
  gsc_connected:     boolean;
  sandbox_pass_rate: number | null;
  plan:              string;
  status:            'healthy' | 'needs_attention' | 'critical' | 'no_data';
}

export interface MultisiteSummary {
  account_id:              string;
  total_sites:             number;
  healthy_sites:           number;
  needs_attention_sites:   number;
  critical_sites:          number;
  no_data_sites:           number;
  total_fixes_applied_7d:  number;
  total_open_issues:       number;
  average_health_score:    number | null;
  snapshots:               SiteSnapshot[];
  generated_at:            string;
}

// ── classifySiteStatus ────────────────────────────────────────────────────────

export function classifySiteStatus(
  health_score: number | null,
  open_issues:  number,
  last_run_at:  string | null,
): SiteSnapshot['status'] {
  try {
    if (!last_run_at) return 'no_data';
    if (health_score !== null && health_score >= 80 && open_issues <= 5) return 'healthy';
    if ((health_score !== null && health_score >= 60) || open_issues <= 15) return 'needs_attention';
    return 'critical';
  } catch {
    return 'no_data';
  }
}

// ── calculateAverageHealthScore ───────────────────────────────────────────────

export function calculateAverageHealthScore(snapshots: SiteSnapshot[]): number | null {
  try {
    const arr = Array.isArray(snapshots) ? snapshots : [];
    const scores = arr.map((s) => s.health_score).filter((v): v is number => v !== null);
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  } catch {
    return null;
  }
}

// ── sortSnapshotsByPriority ───────────────────────────────────────────────────

const STATUS_ORDER: Record<SiteSnapshot['status'], number> = {
  critical:         0,
  needs_attention:  1,
  healthy:          2,
  no_data:          3,
};

export function sortSnapshotsByPriority(snapshots: SiteSnapshot[]): SiteSnapshot[] {
  try {
    const arr = Array.isArray(snapshots) ? [...snapshots] : [];
    return arr.sort((a, b) => {
      const orderDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (orderDiff !== 0) return orderDiff;
      return (b.open_issues ?? 0) - (a.open_issues ?? 0);
    });
  } catch {
    return [];
  }
}

// ── buildMultisiteSummary ─────────────────────────────────────────────────────

export async function buildMultisiteSummary(
  account_id: string,
  site_ids:   string[],
  deps?:      { loadSnapshotFn?: (site_id: string) => Promise<SiteSnapshot> },
): Promise<MultisiteSummary> {
  const generated_at = new Date().toISOString();

  try {
    const ids        = Array.isArray(site_ids) ? site_ids : [];
    const loadFn     = deps?.loadSnapshotFn ?? defaultLoadSnapshot;
    const snapshots  = await Promise.all(ids.map((id) => loadFn(id).catch(() => errorSnapshot(id))));
    const sorted     = sortSnapshotsByPriority(snapshots);

    return {
      account_id,
      total_sites:            sorted.length,
      healthy_sites:          sorted.filter((s) => s.status === 'healthy').length,
      needs_attention_sites:  sorted.filter((s) => s.status === 'needs_attention').length,
      critical_sites:         sorted.filter((s) => s.status === 'critical').length,
      no_data_sites:          sorted.filter((s) => s.status === 'no_data').length,
      total_fixes_applied_7d: sorted.reduce((s, x) => s + (x.fixes_applied_7d ?? 0), 0),
      total_open_issues:      sorted.reduce((s, x) => s + (x.open_issues ?? 0), 0),
      average_health_score:   calculateAverageHealthScore(sorted),
      snapshots:              sorted,
      generated_at,
    };
  } catch {
    return {
      account_id,
      total_sites:            0,
      healthy_sites:          0,
      needs_attention_sites:  0,
      critical_sites:         0,
      no_data_sites:          0,
      total_fixes_applied_7d: 0,
      total_open_issues:      0,
      average_health_score:   null,
      snapshots:              [],
      generated_at,
    };
  }
}

// ── Defaults ──────────────────────────────────────────────────────────────────

async function defaultLoadSnapshot(site_id: string): Promise<SiteSnapshot> {
  return errorSnapshot(site_id);
}

function errorSnapshot(site_id: string): SiteSnapshot {
  return {
    site_id,
    domain:            '',
    platform:          'shopify',
    health_score:      null,
    fixes_applied_7d:  0,
    fixes_failed_7d:   0,
    open_issues:       0,
    last_run_at:       null,
    gsc_connected:     false,
    sandbox_pass_rate: null,
    plan:              '',
    status:            'no_data',
  };
}
