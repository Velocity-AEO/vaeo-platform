'use client';

import { useEffect, useState } from 'react';
import type { PlatformSandboxHealth } from '@tools/sandbox/sandbox_health_aggregator.js';
import {
  getPassRateLabel,
  getPassRateColor,
  formatFailureReason,
} from '../../../lib/sandbox_health_display.js';

export default function AdminSandboxDashboard() {
  const [health, setHealth] = useState<PlatformSandboxHealth | null>(null);
  const [period, setPeriod] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/sandbox/health?period=${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setHealth(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <p className="text-sm text-slate-400">Loading platform sandbox health...</p>
      </div>
    );
  }

  if (!health || health.total_runs === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-lg font-bold text-slate-800 mb-4">Sandbox Health — Platform</h1>
        <p className="text-sm text-slate-400">No sandbox runs recorded.</p>
      </div>
    );
  }

  const rateColor = getPassRateColor(health.overall_pass_rate);
  const rateLabel = getPassRateLabel(health.overall_pass_rate);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">Sandbox Health — Platform</h1>
        <div className="flex gap-2">
          {([7, 30] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-xs px-3 py-1.5 rounded ${period === p ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              {p} Days
            </button>
          ))}
          <a
            href={`/api/admin/sandbox/health?period=${period}`}
            download={`sandbox-health-${period}d.json`}
            className="text-xs px-3 py-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
          >
            Export JSON
          </a>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-400">Pass Rate</p>
          <p className={`text-2xl font-bold ${rateColor}`}>{health.overall_pass_rate}%</p>
          <p className="text-[10px] text-slate-400">{rateLabel}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-400">Total Runs</p>
          <p className="text-2xl font-bold text-slate-700">{health.total_runs}</p>
          <p className="text-[10px] text-slate-400">{health.total_sites} sites</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-400">Avg Mobile</p>
          <p className="text-2xl font-bold text-slate-700">{health.avg_mobile_lighthouse ?? '—'}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-400">Below 70</p>
          <p className={`text-2xl font-bold ${health.sites_below_70_mobile > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {health.sites_below_70_mobile}
          </p>
          <p className="text-[10px] text-slate-400">sites</p>
        </div>
      </div>

      {/* Failure reasons */}
      {health.top_failure_reasons.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Top Failure Reasons</h2>
          <div className="space-y-2">
            {health.top_failure_reasons.map(r => (
              <div key={r.reason} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{formatFailureReason(r.reason)}</span>
                <span className="text-slate-400 font-mono">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notable sites */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {health.healthiest_site && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs text-green-600 font-medium">Healthiest Site</p>
            <p className="text-sm font-semibold text-green-800 mt-1">{health.healthiest_site}</p>
          </div>
        )}
        {health.most_problematic_site && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-xs text-red-600 font-medium">Most Problematic</p>
            <p className="text-sm font-semibold text-red-800 mt-1">{health.most_problematic_site}</p>
          </div>
        )}
      </div>
    </div>
  );
}
