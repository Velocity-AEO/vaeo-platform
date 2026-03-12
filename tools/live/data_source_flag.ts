/**
 * tools/live/data_source_flag.ts
 *
 * Utility for summarizing whether fix decisions were driven by
 * live GSC data or the deterministic simulator.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type FixDataSource = 'gsc_live' | 'simulated';

export interface DataSourceSummary {
  total_fixes:      number;
  gsc_live_fixes:   number;
  simulated_fixes:  number;
  gsc_live_percent: number;
}

// ── summarizeDataSource ───────────────────────────────────────────────────────

export function summarizeDataSource(
  fixes: Array<{ data_source?: string }>,
): DataSourceSummary {
  try {
    const safe = Array.isArray(fixes) ? fixes : [];
    const total        = safe.length;
    const gsc_live     = safe.filter(f => f?.data_source === 'gsc_live').length;
    const simulated    = safe.filter(f => f?.data_source === 'simulated').length;
    const gsc_pct      = total > 0 ? Math.round((gsc_live / total) * 100) : 0;

    return {
      total_fixes:      total,
      gsc_live_fixes:   gsc_live,
      simulated_fixes:  simulated,
      gsc_live_percent: gsc_pct,
    };
  } catch {
    return {
      total_fixes:      0,
      gsc_live_fixes:   0,
      simulated_fixes:  0,
      gsc_live_percent: 0,
    };
  }
}
