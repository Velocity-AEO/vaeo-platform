'use client';

import { useEffect, useState } from 'react';
import {
  getLighthouseScoreColor,
  getMobileDesktopGapLabel,
  formatLighthouseScore,
} from '../lib/lighthouse_display';

/* ── inline types ──────────────────────────────────────────────────────────── */

interface LighthouseScore {
  performance:    number;
  accessibility:  number;
  best_practices: number;
  seo:            number;
  form_factor:    'mobile' | 'desktop';
}

interface SandboxResult {
  fix_type:                    string;
  url:                         string;
  passed:                      boolean;
  failure_reasons:             string[];
  verified_at:                 string;
  lighthouse_mobile?:          LighthouseScore;
  lighthouse_desktop?:         LighthouseScore;
  lighthouse_mobile_desktop_gap?: number;
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

function getFailureReasonLabel(reason: string): string {
  switch (reason) {
    case 'delta_verify_failed':   return 'Change not detected';
    case 'lighthouse_regression': return 'Performance drop';
    case 'html_snapshot_failed':  return 'Snapshot error';
    case 'after_snapshot_failed': return 'Post-fix snapshot error';
    default:                      return reason ?? 'Unknown';
  }
}

/* ── LighthouseScorePair ───────────────────────────────────────────────────── */

function LighthouseScorePair({ mobile, desktop, gap }: {
  mobile?:  LighthouseScore;
  desktop?: LighthouseScore;
  gap?:     number;
}) {
  if (!mobile) return <span className="text-slate-300 text-xs">—</span>;

  const mobileScore  = mobile.performance;
  const desktopScore = desktop?.performance ?? null;
  const gapLabel     = getMobileDesktopGapLabel(gap ?? null);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-400 w-14">Mobile</span>
        <span
          className={`font-bold ${getLighthouseScoreColor(mobileScore)}`}
          title="VAEO uses mobile score as primary — Google ranks based on mobile experience"
        >
          {formatLighthouseScore(mobileScore)}
        </span>
        {desktopScore !== null && (
          <>
            <span className="text-slate-300">|</span>
            <span className="text-slate-400 w-14">Desktop</span>
            <span className={`font-bold ${getLighthouseScoreColor(desktopScore)}`}>
              {formatLighthouseScore(desktopScore)}
            </span>
          </>
        )}
      </div>
      {desktopScore !== null && gap !== undefined && (
        <span className="text-xs text-slate-400 italic">{gapLabel}</span>
      )}
    </div>
  );
}

/* ── component ─────────────────────────────────────────────────────────────── */

export default function WPSandboxStatusPanel({ site_id }: { site_id: string }) {
  const [results, setResults] = useState<SandboxResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!site_id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sites/${site_id}/wp-sandbox`);
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        if (!cancelled) setResults(data.results ?? []);
      } catch {
        if (!cancelled) setError('Unable to load sandbox data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [site_id]);

  if (loading) return null;
  if (error) return <p className="text-sm text-red-500">{error}</p>;

  if (results.length === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">WP Sandbox Verification</h2>
        <p className="text-xs text-slate-400">No sandbox results yet</p>
      </section>
    );
  }

  const passed   = results.filter(r => r.passed).length;
  const total    = results.length;
  const passRate = Math.round((passed / total) * 100);

  const failureReasons = results.flatMap(r => r.failure_reasons);
  const reasonCounts = new Map<string, number>();
  for (const r of failureReasons) {
    reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
  }
  const topFailure = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700">WP Sandbox Verification</h2>
        <span
          className="text-xs text-slate-400 cursor-help border-b border-dotted border-slate-300"
          title="VAEO uses mobile score as primary — Google ranks based on mobile experience"
        >
          Mobile-first ℹ
        </span>
      </div>

      {/* Summary row */}
      <div className="flex flex-col sm:flex-row gap-4 text-sm mb-4">
        <div>
          <span className="text-slate-500">Verified: </span>
          <span className="font-bold text-slate-800">{passed} of {total} fixes</span>
          <span className="ml-1 text-slate-400">({passRate}%)</span>
        </div>
        {topFailure && (
          <div>
            <span className="text-slate-500">Most common issue: </span>
            <span className="font-medium text-red-600">{getFailureReasonLabel(topFailure)}</span>
          </div>
        )}
      </div>

      {/* Results table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-3 py-2 font-medium">Fix Type</th>
              <th className="px-3 py-2 font-medium hidden sm:table-cell">URL</th>
              <th className="px-3 py-2 font-medium text-center">Passed</th>
              <th className="px-3 py-2 font-medium">
                Lighthouse
                <span className="ml-1 font-normal text-slate-400 normal-case">(Mobile | Desktop)</span>
              </th>
              <th className="px-3 py-2 font-medium">Failure Reasons</th>
              <th className="px-3 py-2 font-medium text-right hidden sm:table-cell">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-700">{r.fix_type}</td>
                <td className="px-3 py-2 text-xs text-slate-400 font-mono truncate max-w-[200px] hidden sm:table-cell">
                  {r.url}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={r.passed ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                    {r.passed ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <LighthouseScorePair
                    mobile={r.lighthouse_mobile}
                    desktop={r.lighthouse_desktop}
                    gap={r.lighthouse_mobile_desktop_gap}
                  />
                </td>
                <td className="px-3 py-2">
                  {r.failure_reasons.length === 0 ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {r.failure_reasons.map((reason, j) => (
                        <span key={j} className="inline-flex px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs border border-red-100">
                          {getFailureReasonLabel(reason)}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-xs text-slate-400 hidden sm:table-cell">
                  {new Date(r.verified_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
