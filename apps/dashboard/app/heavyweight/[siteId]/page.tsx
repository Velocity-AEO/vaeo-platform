'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LighthouseScore {
  performance:    number;
  seo:            number;
  accessibility:  number;
  best_practices: number;
  lcp_ms:         number;
  cls:            number;
}

interface ScoreComparison {
  performance_delta: number;
  seo_delta:         number;
  lcp_delta_ms:      number;
  cls_delta:         number;
  grade_before:      string;
  grade_after:       string;
}

interface HeavyweightRun {
  run_id:            string;
  site_id:           string;
  url:               string;
  status:            string;
  score_before:      LighthouseScore;
  score_after?:      LighthouseScore;
  detected_apps:     string[];
  fix_types_applied: string[];
  comparison?:       ScoreComparison;
  duration_ms:       number;
  started_at:        string;
  completed_at?:     string;
  recommendation?:   string;
  safe_to_deploy?:   boolean;
}

interface AppImpact {
  app_name:           string;
  load_cost_ms:       number;
  performance_impact: string;
  affects_lcp:        boolean;
  affects_cls:        boolean;
  replaceable_by_vaeo: boolean;
  monthly_cost_usd:   number;
  recommendation:     string;
}

interface PerformanceAnalysis {
  total_third_party_load_ms:    number;
  vaeo_fixable_savings_ms:      number;
  vaeo_replaceable_savings_usd: number;
  top_offenders:                AppImpact[];
  analysis_summary:             string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreBg(n: number): string {
  return n >= 90 ? 'text-green-700 bg-green-50 border-green-200'
    : n >= 70 ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
    : 'text-red-700 bg-red-50 border-red-200';
}

function deltaBg(n: number): string {
  return n > 0 ? 'text-green-600' : n < 0 ? 'text-red-600' : 'text-slate-400';
}

function impactBg(impact: string): string {
  return impact === 'critical' ? 'bg-red-100 text-red-800 border-red-200'
    : impact === 'high' ? 'bg-orange-100 text-orange-800 border-orange-200'
    : impact === 'medium' ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
    : 'bg-slate-100 text-slate-600 border-slate-200';
}

function ms(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
}

// ── Score card ────────────────────────────────────────────────────────────────

function ScoreCard({ label, before, after }: { label: string; before: number; after?: number }) {
  const delta = after !== undefined ? after - before : undefined;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-center">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="flex items-center justify-center gap-2">
        <span className={`text-lg font-bold tabular-nums px-2 py-0.5 rounded border text-sm ${scoreBg(before)}`}>
          {before}
        </span>
        {after !== undefined && (
          <>
            <span className="text-slate-300 text-xs">→</span>
            <span className={`text-lg font-bold tabular-nums px-2 py-0.5 rounded border text-sm ${scoreBg(after)}`}>
              {after}
            </span>
          </>
        )}
      </div>
      {delta !== undefined && (
        <div className={`text-xs font-medium mt-1 tabular-nums ${deltaBg(delta)}`}>
          {delta > 0 ? '+' : ''}{delta}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HeavyweightSandboxPage() {
  const params  = useParams();
  const siteId  = params.siteId as string;
  const [run, setRun]           = useState<HeavyweightRun | null>(null);
  const [analysis, setAnalysis] = useState<PerformanceAnalysis | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res  = await fetch(`/api/heavyweight/${siteId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { run: HeavyweightRun; analysis: PerformanceAnalysis };
        setRun(data.run);
        setAnalysis(data.analysis);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [siteId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center text-slate-400 text-sm">
        Loading sandbox results…
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center text-red-500 text-sm">
        {error ?? 'No data available.'}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Heavyweight Sandbox</h1>
          <p className="text-sm text-slate-500 mt-0.5">{run.url}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {run.safe_to_deploy !== undefined && (
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
              run.safe_to_deploy
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              {run.safe_to_deploy ? 'Safe to Deploy' : 'Regression Detected'}
            </span>
          )}
          <Link
            href={`/heavyweight/case-study/${siteId}`}
            className="px-3 py-1.5 text-xs bg-slate-800 text-white rounded hover:bg-slate-700 transition-colors"
          >
            View Case Study
          </Link>
        </div>
      </div>

      {/* Recommendation */}
      {run.recommendation && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          run.safe_to_deploy
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {run.recommendation}
        </div>
      )}

      {/* Score comparison */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Score Comparison</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ScoreCard label="Performance" before={run.score_before.performance} after={run.score_after?.performance} />
          <ScoreCard label="SEO"         before={run.score_before.seo}         after={run.score_after?.seo} />
          <ScoreCard label="Accessibility" before={run.score_before.accessibility} after={run.score_after?.accessibility} />
          <ScoreCard label="Best Practices" before={run.score_before.best_practices} after={run.score_after?.best_practices} />
        </div>
      </div>

      {/* CWV row */}
      {run.score_after && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <div className="text-xs text-slate-500 mb-1">LCP</div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium tabular-nums text-slate-700">{ms(run.score_before.lcp_ms)}</span>
              <span className="text-slate-300 text-xs">→</span>
              <span className="text-sm font-medium tabular-nums text-green-700">{ms(run.score_after.lcp_ms)}</span>
              {run.comparison && (
                <span className="text-xs text-green-600 font-medium">
                  −{ms(run.comparison.lcp_delta_ms)}
                </span>
              )}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <div className="text-xs text-slate-500 mb-1">CLS</div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium tabular-nums text-slate-700">{run.score_before.cls.toFixed(3)}</span>
              <span className="text-slate-300 text-xs">→</span>
              <span className="text-sm font-medium tabular-nums text-green-700">{run.score_after.cls.toFixed(3)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Apps detected + fixes applied */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Apps Detected ({run.detected_apps.length})
          </h2>
          {run.detected_apps.length === 0 ? (
            <p className="text-xs text-slate-400">No third-party apps detected.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {run.detected_apps.map((app) => (
                <span key={app} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded border border-slate-200">
                  {app}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Fixes Applied ({run.fix_types_applied.length})
          </h2>
          {run.fix_types_applied.length === 0 ? (
            <p className="text-xs text-slate-400">No fixes applied.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {run.fix_types_applied.map((f) => (
                <span key={f} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded border border-blue-200">
                  {f.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Performance analysis */}
      {analysis && analysis.top_offenders.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Top Performance Offenders</h2>
            <span className="text-xs text-slate-500">
              {ms(analysis.total_third_party_load_ms)} total third-party load
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
                <th className="px-5 py-2 font-medium">App</th>
                <th className="px-5 py-2 font-medium">Impact</th>
                <th className="px-5 py-2 font-medium tabular-nums">Load cost</th>
                <th className="px-5 py-2 font-medium">Affects LCP</th>
                <th className="px-5 py-2 font-medium">Replaceable</th>
                <th className="px-5 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analysis.top_offenders.map((app) => (
                <tr key={app.app_name} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{app.app_name}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded border text-xs font-medium ${impactBg(app.performance_impact)}`}>
                      {app.performance_impact}
                    </span>
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-600 text-xs">{ms(app.load_cost_ms)}</td>
                  <td className="px-5 py-3 text-xs">
                    {app.affects_lcp ? <span className="text-red-600 font-medium">Yes</span> : <span className="text-slate-400">No</span>}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {app.replaceable_by_vaeo ? (
                      <span className="text-green-600 font-medium">VAEO</span>
                    ) : (
                      <span className="text-slate-400">No</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{app.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(analysis.vaeo_fixable_savings_ms > 0 || analysis.vaeo_replaceable_savings_usd > 0) && (
            <div className="px-5 py-3 border-t border-slate-100 bg-green-50 flex items-center gap-6 text-xs text-green-800">
              <span>
                VAEO can save <strong>{ms(analysis.vaeo_fixable_savings_ms)}</strong> load time
              </span>
              {analysis.vaeo_replaceable_savings_usd > 0 && (
                <span>
                  + <strong>${analysis.vaeo_replaceable_savings_usd}/mo</strong> in app spend
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Run metadata */}
      <div className="text-xs text-slate-400 flex items-center gap-4">
        <span>Run ID: {run.run_id}</span>
        <span>Duration: {ms(run.duration_ms)}</span>
        {run.completed_at && (
          <span>Completed: {new Date(run.completed_at).toLocaleString()}</span>
        )}
      </div>

    </div>
  );
}
