'use client';

import { useEffect, useState } from 'react';

interface QACheckResult {
  check_id: string;
  name: string;
  category: string;
  severity: string;
  passed: boolean;
  message: string;
  detail?: string;
  recommendation?: string;
  checked_at: string;
}

interface QAReport {
  report_id: string;
  site_id?: string;
  passed: boolean;
  blocker_count: number;
  warning_count: number;
  info_count: number;
  passed_count: number;
  failed_count: number;
  results: QACheckResult[];
  summary: string;
  generated_at: string;
  duration_ms: number;
}

const CATEGORIES = ['pipeline', 'data', 'integration', 'configuration', 'security'] as const;

function StatusIcon({ result }: { result: QACheckResult }) {
  if (result.passed) {
    return <span className="text-green-400 text-lg">&#10003;</span>;
  }
  if (result.severity === 'blocker') {
    return <span className="text-red-400 text-lg">&#10007;</span>;
  }
  if (result.severity === 'warning') {
    return <span className="text-amber-400 text-lg">&#9888;</span>;
  }
  return <span className="text-slate-400 text-lg">&#9432;</span>;
}

export default function QAPage() {
  const [report, setReport] = useState<QAReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('pipeline');

  async function loadReport() {
    setLoading(true);
    try {
      const res = await fetch('/api/qa');
      if (res.ok) setReport(await res.json());
    } catch { /* non-fatal */ }
    setLoading(false);
  }

  async function rerun() {
    setLoading(true);
    try {
      const res = await fetch('/api/qa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (res.ok) setReport(await res.json());
    } catch { /* non-fatal */ }
    setLoading(false);
  }

  function downloadReport() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qa-report-${report.report_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => { loadReport(); }, []);

  if (loading && !report) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Running QA checks...</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          Failed to load QA report.
        </div>
      </div>
    );
  }

  const filtered = report.results.filter((r) => r.category === activeTab);

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">QA System &mdash; Platform Guidance</h1>
          <p className="text-sm text-slate-400 mt-1">
            This system verifies all VAEO components are configured and operational before running fixes on live stores.
          </p>
        </div>

        {/* Overall result banner */}
        {report.blocker_count > 0 ? (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-center">
            <span className="text-red-400 font-semibold text-lg">
              Not Ready &mdash; {report.blocker_count} blocker(s) must be resolved
            </span>
          </div>
        ) : report.warning_count > 0 ? (
          <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4 text-center">
            <span className="text-amber-400 font-semibold text-lg">
              Ready with warnings &mdash; review recommended
            </span>
          </div>
        ) : (
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-center">
            <span className="text-green-400 font-semibold text-lg">
              Platform Ready &mdash; All checks passed
            </span>
          </div>
        )}

        {/* Category tabs */}
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium capitalize transition-colors ${
                activeTab === cat
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Check cards */}
        <div className="space-y-3">
          {filtered.map((r) => (
            <div
              key={r.check_id}
              className={`bg-slate-800 rounded-lg p-4 border-l-4 ${
                r.passed ? 'border-green-500' :
                r.severity === 'blocker' ? 'border-red-500' :
                r.severity === 'warning' ? 'border-amber-500' : 'border-slate-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <StatusIcon result={r} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">{r.name}</div>
                  <div className="text-xs text-slate-400">{r.message}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                  r.passed ? 'bg-green-900/50 text-green-400' :
                  r.severity === 'blocker' ? 'bg-red-900/50 text-red-400' :
                  r.severity === 'warning' ? 'bg-amber-900/50 text-amber-400' :
                  'bg-slate-700 text-slate-400'
                }`}>
                  {r.passed ? 'PASS' : r.severity.toUpperCase()}
                </span>
              </div>
              {!r.passed && r.recommendation && (
                <div className="mt-2 bg-amber-900/20 border border-amber-800/50 rounded p-2 text-xs text-amber-300">
                  {r.recommendation}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-slate-500 py-8">No checks in this category.</div>
          )}
        </div>

        {/* Summary bar */}
        <div className="bg-slate-800 rounded-lg p-4 flex items-center justify-between">
          <div className="text-sm text-slate-300">
            <span className="text-green-400 font-medium">{report.passed_count} passed</span>
            {' / '}
            <span className="text-red-400 font-medium">{report.blocker_count} blockers</span>
            {' / '}
            <span className="text-amber-400 font-medium">{report.warning_count} warnings</span>
            {' / '}
            <span className="text-slate-400 font-medium">{report.info_count} info</span>
          </div>
          <div className="text-xs text-slate-500">{report.duration_ms}ms</div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={rerun}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm px-4 py-2 rounded transition-colors"
          >
            {loading ? 'Running...' : 'Re-run QA'}
          </button>
          <button
            onClick={downloadReport}
            className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded transition-colors"
          >
            Export Report
          </button>
        </div>
      </div>
    </div>
  );
}
