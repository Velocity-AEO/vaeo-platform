'use client';

import { useEffect, useState } from 'react';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface DiffChange {
  field:          string;
  previous_value: unknown;
  current_value:  unknown;
  change_type:    'added' | 'removed' | 'changed' | 'degraded' | 'improved';
}

interface BaselineDiffRow {
  url:               string;
  severity:          'critical' | 'high' | 'medium' | 'low' | 'none';
  net_change:        'better' | 'worse' | 'neutral';
  changes:           DiffChange[];
  degradation_count: number;
  improvement_count: number;
  snapshot_date:     string;
  previous_date:     string;
}

interface DiffResponse {
  diffs:          BaselineDiffRow[];
  total:          number;
  degraded_count: number;
  critical_count: number;
  high_count:     number;
  last_captured:  string | null;
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  medium:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  low:      'bg-blue-100 text-blue-700 border-blue-200',
  none:     'bg-slate-100 text-slate-500 border-slate-200',
};

const NET_CHANGE_BADGE: Record<string, string> = {
  worse:   'text-red-600',
  better:  'text-green-600',
  neutral: 'text-slate-400',
};

const NET_CHANGE_LABEL: Record<string, string> = {
  worse:   '↓ Degraded',
  better:  '↑ Improved',
  neutral: '→ Unchanged',
};

const CHANGE_TYPE_ROW: Record<string, string> = {
  degraded: 'bg-red-50',
  improved: 'bg-green-50',
  added:    '',
  removed:  'bg-orange-50',
  changed:  '',
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.length > 0 ? v.join(', ') : '[]';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1)  return 'just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

/* ── DiffRow ───────────────────────────────────────────────────────────────── */

function DiffRow({ diff }: { diff: BaselineDiffRow }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden mb-2">
      {/* Summary row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <span className={`flex-1 text-xs font-mono text-slate-600 truncate`}>{diff.url}</span>
        <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${SEVERITY_BADGE[diff.severity] ?? SEVERITY_BADGE.none}`}>
          {diff.severity}
        </span>
        <span className={`flex-shrink-0 text-xs font-medium ${NET_CHANGE_BADGE[diff.net_change] ?? 'text-slate-400'}`}>
          {NET_CHANGE_LABEL[diff.net_change] ?? '—'}
        </span>
        <span className="flex-shrink-0 text-xs text-slate-400">
          {diff.changes.length} change{diff.changes.length !== 1 ? 's' : ''}
        </span>
        <span className="flex-shrink-0 text-slate-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Field-level diffs */}
      {expanded && diff.changes.length > 0 && (
        <div className="border-t border-slate-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-2 font-medium">Field</th>
                <th className="px-4 py-2 font-medium">Previous</th>
                <th className="px-4 py-2 font-medium">Current</th>
                <th className="px-4 py-2 font-medium">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {diff.changes.map((c, i) => (
                <tr key={i} className={CHANGE_TYPE_ROW[c.change_type] ?? ''}>
                  <td className="px-4 py-2 font-mono text-slate-700">{c.field}</td>
                  <td className="px-4 py-2 text-slate-500 max-w-[200px] truncate">{formatValue(c.previous_value)}</td>
                  <td className="px-4 py-2 text-slate-700 max-w-[200px] truncate">{formatValue(c.current_value)}</td>
                  <td className="px-4 py-2">
                    <span className={`font-medium ${
                      c.change_type === 'degraded' ? 'text-red-600' :
                      c.change_type === 'improved' ? 'text-green-600' :
                      'text-slate-500'
                    }`}>
                      {c.change_type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {expanded && diff.changes.length === 0 && (
        <div className="px-4 py-3 text-xs text-slate-400 border-t border-slate-200">
          No field-level changes detected.
        </div>
      )}
    </div>
  );
}

/* ── BaselineDiffPanel ─────────────────────────────────────────────────────── */

export default function BaselineDiffPanel({ site_id }: { site_id: string }) {
  const [data, setData]     = useState<DiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!site_id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sites/${site_id}/baseline/diff`);
        if (!res.ok) throw new Error('Failed to load baseline diff');
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError('Unable to load baseline data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [site_id]);

  if (loading) return null;
  if (error) return <p className="text-sm text-red-500">{error}</p>;

  const diffs         = data?.diffs ?? [];
  const criticalCount = data?.critical_count ?? 0;
  const highCount     = data?.high_count ?? 0;
  const lastCaptured  = data?.last_captured ?? null;

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      {/* Header */}
      <div className="mb-1">
        <h2 className="text-sm font-semibold text-slate-700">Site Baseline Monitor</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Weekly snapshot comparing your site against itself over time
        </p>
      </div>

      {/* Last captured */}
      {lastCaptured && (
        <p className="text-xs text-slate-400 mb-3">
          Last captured: {relativeTime(lastCaptured)}
        </p>
      )}

      {/* Critical/high alert banner */}
      {(criticalCount > 0 || highCount > 0) && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <span className="text-red-500 text-sm">⚠</span>
          <p className="text-sm text-red-700">
            <span className="font-semibold">{criticalCount + highCount} page{criticalCount + highCount !== 1 ? 's' : ''}</span>{' '}
            show significant changes since last week
          </p>
        </div>
      )}

      {/* No changes state */}
      {diffs.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
          <span className="text-green-500 text-base">✓</span>
          <span>No significant changes detected since last baseline</span>
        </div>
      )}

      {/* Diff rows */}
      {diffs.length > 0 && (
        <div className="mt-2">
          {diffs.map((diff, i) => (
            <DiffRow key={i} diff={diff} />
          ))}
        </div>
      )}
    </section>
  );
}
