'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────────────

interface KeywordRanking {
  keyword: string;
  position_before: number;
  position_after: number;
  position_delta: number;
}

interface ValueMetrics {
  fixes_applied: number;
  estimated_traffic_gain: number;
  estimated_revenue_impact: number;
  health_score_gain: number;
  time_saved_hours: number;
  pages_fixed: number;
  issues_resolved: number;
  schema_coverage_gain_pct: number;
  keywords_moved_to_top_10: number;
  avg_position_improvement: number;
}

interface BeforeAfterComparison {
  comparison_id: string;
  url: string;
  fix_type: string;
  fix_label: string;
  before_value: string;
  after_value: string;
  quality_score_before: number;
  quality_score_after: number;
  quality_delta: number;
}

interface ValueReport {
  report_id: string;
  site_id: string;
  domain: string;
  period_label: string;
  headline: string;
  summary_paragraph: string;
  metrics: ValueMetrics;
  top_comparisons: BeforeAfterComparison[];
  ranking_snapshot: { keywords: KeywordRanking[] };
  generated_at: string;
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ProofOfValuePage() {
  const params = useParams();
  const siteId = params.siteId as string;
  const [report, setReport] = useState<ValueReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/value/${siteId}`)
      .then((r) => r.json())
      .then((data) => { setReport(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [siteId]);

  async function copyAsText() {
    const res = await fetch(`/api/value/${siteId}?format=text`);
    const text = await res.text();
    navigator.clipboard.writeText(text);
  }

  function downloadJson() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proof-of-value-${siteId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-72" />
        <div className="h-32 bg-gray-200 rounded" />
        <div className="h-64 bg-gray-200 rounded" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Failed to load report.</p>
        <Link href={`/client/${siteId}`} className="text-blue-600 hover:underline text-sm mt-2 inline-block">Back to site</Link>
      </div>
    );
  }

  const m = report.metrics;
  const improved = report.ranking_snapshot.keywords.filter((k) => k.position_delta > 0);
  const headlineBg = m.estimated_revenue_impact > 1000 ? 'bg-green-50 border-green-200' : m.health_score_gain >= 10 ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200';

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proof of Value</h1>
          <p className="text-gray-500 text-sm mt-0.5">{report.domain} — {report.period_label}</p>
        </div>
        <Link href={`/client/${siteId}`} className="text-blue-600 hover:underline text-sm">Back to site</Link>
      </div>

      {/* Headline banner */}
      <div className={`border rounded-xl p-6 ${headlineBg}`}>
        <p className="text-xl font-bold">{report.headline}</p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-5">
          <div className="text-2xl font-bold text-blue-600">+{Math.round(m.estimated_traffic_gain)}</div>
          <div className="text-xs text-gray-500 mt-1">Est. Visitors/Month</div>
        </div>
        <div className="bg-white border rounded-lg p-5">
          <div className="text-2xl font-bold text-green-600">${Math.round(m.estimated_revenue_impact)}</div>
          <div className="text-xs text-gray-500 mt-1">Revenue Impact (Est.)</div>
        </div>
        <div className="bg-white border rounded-lg p-5">
          <div className="text-2xl font-bold text-purple-600">{m.time_saved_hours}h</div>
          <div className="text-xs text-gray-500 mt-1">Hours of Manual Work Saved</div>
        </div>
        <div className="bg-white border rounded-lg p-5">
          <div className="text-2xl font-bold text-amber-600">+{m.health_score_gain}</div>
          <div className="text-xs text-gray-500 mt-1">Health Score Points</div>
        </div>
      </div>

      {/* Before/After showcase */}
      {report.top_comparisons.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Top Improvements</h2>
          <div className="space-y-3">
            {report.top_comparisons.map((c) => (
              <div key={c.comparison_id} className="bg-white border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">{c.fix_label}</span>
                  <span className="text-xs text-gray-400 truncate">{c.url}</span>
                  <span className="ml-auto px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium">+{c.quality_delta} quality</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <div className="text-[10px] text-red-600 font-medium uppercase mb-1">Before (score: {c.quality_score_before})</div>
                    <p className="text-sm text-red-900">{c.before_value || <span className="italic text-red-400">(empty)</span>}</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded p-3">
                    <div className="text-[10px] text-green-600 font-medium uppercase mb-1">After (score: {c.quality_score_after})</div>
                    <p className="text-sm text-green-900">{c.after_value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Rankings impact */}
      {improved.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Ranking Improvements</h2>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Keyword</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Before</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">After</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Improvement</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {improved.map((k) => (
                  <tr key={k.keyword} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{k.keyword}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{k.position_before}</td>
                    <td className="px-4 py-2 text-right font-medium">{k.position_after}</td>
                    <td className="px-4 py-2 text-right">
                      <span className="text-green-600 font-medium">+{k.position_delta}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Summary */}
      <section className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-2">Summary</h2>
        <p className="text-gray-700 leading-relaxed">{report.summary_paragraph}</p>
      </section>

      {/* Export buttons */}
      <div className="flex gap-3">
        <button
          onClick={copyAsText}
          className="px-4 py-2 border rounded text-sm font-medium hover:bg-gray-50"
        >
          Copy as Text
        </button>
        <button
          onClick={downloadJson}
          className="px-4 py-2 border rounded text-sm font-medium hover:bg-gray-50"
        >
          Download JSON
        </button>
      </div>

      <p className="text-xs text-gray-400">Generated {new Date(report.generated_at).toLocaleString()} — Velocity AEO</p>
    </div>
  );
}
