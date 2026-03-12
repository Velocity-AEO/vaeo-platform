'use client';

import { useState } from 'react';

/* ── inline types ─────────────────────────────────────────────────────────── */

interface AgencyReportData {
  agency_id:            string;
  period:               string;
  generated_at:         string;
  total_sites:          number;
  total_fixes_applied:  number;
  total_issues_resolved: number;
  average_health_score: number | null;
  top_fix_types:        Array<{ fix_type: string; count: number }>;
  sites_improved:       number;
  sites_declined:       number;
  gsc_connected_count:  number;
}

/* ── helpers (inlined to avoid bundler issues) ──────────────────────────── */

function getPeriodLabel(p: string) {
  switch (p) {
    case 'last_7_days':  return 'Last 7 Days';
    case 'last_30_days': return 'Last 30 Days';
    case 'last_90_days': return 'Last 90 Days';
    default:             return p ?? 'Unknown';
  }
}

function getBarWidth(value: number, max: number) {
  if (!max || max <= 0 || value < 0) return 0;
  return Math.min(Math.round((value / max) * 100), 100);
}

function getHealthScoreColor(score: number | null) {
  if (score == null) return 'text-gray-400';
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

function getImprovementLabel(improved: number, declined: number, total: number) {
  if (total <= 0) return 'No sites';
  if (improved === total) return 'All sites improved';
  if (declined === 0) return `${improved} of ${total} sites improved`;
  return `${improved} improved, ${declined} declined`;
}

function generateDownloadContent(report: AgencyReportData) {
  if (!report) return '';
  const lines = [
    `Agency Report: ${report.agency_id}`,
    `Period: ${getPeriodLabel(report.period)}`,
    `Generated: ${report.generated_at}`,
    '',
    `Total Sites: ${report.total_sites}`,
    `Fixes Applied: ${report.total_fixes_applied}`,
    `Issues Resolved: ${report.total_issues_resolved}`,
    `Average Health Score: ${report.average_health_score ?? 'N/A'}`,
    `Sites Improved: ${report.sites_improved}`,
    `Sites Declined: ${report.sites_declined}`,
    `GSC Connected: ${report.gsc_connected_count}`,
    '',
    'Top Fix Types:',
  ];
  for (const t of (report.top_fix_types ?? [])) {
    lines.push(`  ${t.fix_type}: ${t.count}`);
  }
  return lines.join('\n');
}

/* ── component ────────────────────────────────────────────────────────────── */

export default function AgencyReportPage() {
  const [period, setPeriod] = useState<string>('last_30_days');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AgencyReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadReport(agencyId: string, p: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/${agencyId}/report?period=${p}`);
      if (!res.ok) throw new Error('Failed to load report');
      const data = await res.json();
      setReport(data);
    } catch {
      setError('Failed to load report');
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!report) return;
    const content = generateDownloadContent(report);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agency-report-${report.period}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const maxFix = report
    ? Math.max(...(report.top_fix_types ?? []).map(t => t.count), 0)
    : 0;

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Agency Report</h1>

          {/* Period selector */}
          <div className="flex gap-2">
            {(['last_7_days', 'last_30_days', 'last_90_days'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  period === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {getPeriodLabel(p)}
              </button>
            ))}
          </div>
        </div>

        {/* Load button (until real auto-fetch) */}
        {!report && !loading && (
          <button
            onClick={() => loadReport('demo', period)}
            className="mb-6 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Generate Report
          </button>
        )}

        {loading && <p className="text-gray-500">Loading report...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {report && (
          <>
            {/* Summary Cards */}
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                <p className="text-sm text-gray-500">Total Sites</p>
                <p className="text-2xl font-bold text-gray-900">{report.total_sites}</p>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                <p className="text-sm text-gray-500">Fixes Applied</p>
                <p className="text-2xl font-bold text-gray-900">{report.total_fixes_applied}</p>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                <p className="text-sm text-gray-500">Health Score</p>
                <p className={`text-2xl font-bold ${getHealthScoreColor(report.average_health_score)}`}>
                  {report.average_health_score ?? 'N/A'}
                </p>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                <p className="text-sm text-gray-500">GSC Connected</p>
                <p className="text-2xl font-bold text-gray-900">{report.gsc_connected_count}</p>
              </div>
            </div>

            {/* Improvement summary */}
            <div className="mb-6 rounded-xl bg-white p-4 shadow-sm border border-gray-100">
              <p className="text-sm text-gray-500">Site Improvement</p>
              <p className="text-lg font-semibold text-gray-900">
                {getImprovementLabel(report.sites_improved, report.sites_declined, report.total_sites)}
              </p>
            </div>

            {/* Top Fix Types bar chart */}
            {report.top_fix_types.length > 0 && (
              <div className="mb-6 rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                <h2 className="mb-3 text-lg font-semibold text-gray-900">Top Fix Types</h2>
                <div className="space-y-2">
                  {report.top_fix_types.map((t) => (
                    <div key={t.fix_type} className="flex items-center gap-3">
                      <span className="w-24 text-sm text-gray-600 truncate">{t.fix_type}</span>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${getBarWidth(t.count, maxFix)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-sm font-medium text-gray-700">{t.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Period + generated */}
            <div className="mb-6 rounded-xl bg-white p-4 shadow-sm border border-gray-100">
              <p className="text-sm text-gray-500">
                Period: {getPeriodLabel(report.period)} &middot; Generated: {new Date(report.generated_at).toLocaleString()}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleDownload}
                className="rounded-lg bg-gray-800 px-4 py-2 text-white hover:bg-gray-900"
              >
                Download Report
              </button>
              <button
                onClick={() => {
                  if (!report) return;
                  const content = generateDownloadContent(report);
                  navigator.clipboard.writeText(content);
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Copy to Clipboard
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
