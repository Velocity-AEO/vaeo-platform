'use client';

import { useState, useEffect } from 'react';
import LearnMoreLink from './LearnMoreLink';

// ── Types (inlined for Next.js bundler) ──────────────────────────────────────

interface DriftEvent {
  fix_id:            string;
  url:               string;
  issue_type:        string;
  drift_status:      'stable' | 'drifted' | 'unknown';
  days_since_fix:    number;
  probable_cause:    string | null;
}

interface DriftScanResult {
  scanned_at:          string;
  fixes_scanned:       number;
  stable_fixes:        number;
  drifted_fixes:       number;
  drift_rate:          number;
  drift_events:        DriftEvent[];
}

interface DriftScanPanelProps {
  site_id: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rateColor(rate: number): string {
  if (rate === 0) return 'text-green-600';
  if (rate < 10) return 'text-yellow-600';
  return 'text-red-600';
}

function statusLabel(s: string): string {
  if (s === 'drifted') return 'Drifted — requeued';
  if (s === 'stable') return 'Stable';
  return 'Unknown';
}

function causeLabel(c: string | null): string {
  const map: Record<string, string> = {
    theme_update: 'Theme update', plugin_update: 'Plugin update',
    cms_edit: 'Manual edit', cache_issue: 'Cache issue', cdn_issue: 'CDN issue',
  };
  return c ? (map[c] ?? 'Unknown cause') : 'Unknown cause';
}

function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch { return ''; }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DriftScanPanel({ site_id }: DriftScanPanelProps) {
  const [data, setData] = useState<DriftScanResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sites/${encodeURIComponent(site_id)}/drift`);
        if (!res.ok) { setLoading(false); return; }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch { /* empty state */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [site_id]);

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <h2 className="text-base font-semibold text-slate-700">Fix Stability Monitor<LearnMoreLink article_slug="what-is-fix-drift" /></h2>
      <p className="text-xs text-slate-400 mb-3">
        Detects when site updates overwrite your SEO fixes
      </p>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      )}

      {!loading && !data && (
        <p className="text-sm text-slate-400">No drift scan results yet</p>
      )}

      {!loading && data && (
        <>
          {/* Summary row */}
          <div className="flex items-center gap-4 mb-3 text-sm flex-wrap">
            <span className="text-green-600 font-medium">{data.stable_fixes} Stable</span>
            <span className="text-red-600 font-medium">{data.drifted_fixes} Drifted</span>
            <span className={`font-medium ${rateColor(data.drift_rate)}`}>
              {data.drift_rate}% drift rate
            </span>
          </div>

          {/* Alert banner */}
          {data.drifted_fixes > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-sm text-red-700">
              {data.drifted_fixes} {data.drifted_fixes === 1 ? 'fix was' : 'fixes were'} overwritten by a recent site update and {data.drifted_fixes === 1 ? 'has' : 'have'} been automatically re-queued.
            </div>
          )}

          {/* Drift events table */}
          {data.drifted_fixes > 0 && data.drift_events.length > 0 && (
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="py-1.5 pr-3">URL</th>
                    <th className="py-1.5 pr-3">Issue type</th>
                    <th className="py-1.5 pr-3">Probable cause</th>
                    <th className="py-1.5 pr-3">Days since fix</th>
                    <th className="py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.drift_events.filter(e => e.drift_status === 'drifted').map((e, i) => (
                    <tr key={e.fix_id ?? i} className="border-b border-slate-50">
                      <td className="py-1.5 pr-3 font-mono text-slate-600 truncate max-w-[200px]">{e.url}</td>
                      <td className="py-1.5 pr-3 text-slate-600">{e.issue_type}</td>
                      <td className="py-1.5 pr-3 text-slate-600">{causeLabel(e.probable_cause)}</td>
                      <td className="py-1.5 pr-3 text-slate-600">{e.days_since_fix}d</td>
                      <td className="py-1.5 text-red-600 font-medium">{statusLabel(e.drift_status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* All stable state */}
          {data.drifted_fixes === 0 && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-3">
              <span className="text-lg">✓</span>
              All fixes stable — no drift detected
            </div>
          )}

          {/* Last scan timestamp */}
          {data.scanned_at && (
            <p className="text-[11px] text-slate-400">Last checked: {relativeTime(data.scanned_at)}</p>
          )}
        </>
      )}
    </section>
  );
}
