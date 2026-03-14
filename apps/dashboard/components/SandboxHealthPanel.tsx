'use client';

import { useEffect, useState } from 'react';
import type { SandboxHealthMetrics } from '@tools/sandbox/sandbox_health_aggregator.js';
import {
  getPassRateLabel,
  getPassRateColor,
  getTrendIcon,
  formatFailureReason,
} from '../lib/sandbox_health_display.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface SandboxHealthPanelProps {
  site_id: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SandboxHealthPanel({ site_id }: SandboxHealthPanelProps) {
  const [metrics, setMetrics] = useState<SandboxHealthMetrics | null>(null);
  const [period, setPeriod] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!site_id) return;
    setLoading(true);
    fetch(`/api/sites/${encodeURIComponent(site_id)}/sandbox/health?period=${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMetrics(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [site_id, period]);

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <p className="text-sm text-slate-400">Loading sandbox health...</p>
      </div>
    );
  }

  if (!metrics || metrics.total_runs === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Sandbox Health</h3>
        <p className="text-xs text-slate-400">No sandbox runs yet</p>
      </div>
    );
  }

  const rateColor = getPassRateColor(metrics.pass_rate);
  const rateLabel = getPassRateLabel(metrics.pass_rate);
  const trendIcon = getTrendIcon(metrics.trend);
  const trendColor = metrics.trend === 'improving' ? 'text-green-500' : metrics.trend === 'degrading' ? 'text-red-500' : 'text-slate-400';

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Sandbox Health</h3>
        <div className="flex gap-1">
          {([7, 30] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-xs px-2 py-1 rounded ${period === p ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              {p} Days
            </button>
          ))}
        </div>
      </div>

      {/* Pass rate */}
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${rateColor}`}>{metrics.pass_rate}%</span>
        <span className="text-xs text-slate-500">{rateLabel}</span>
        <span className={`text-sm font-medium ${trendColor}`}>{trendIcon}</span>
      </div>

      {/* Metric row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCell label="Avg Mobile" value={metrics.avg_mobile_lighthouse != null ? `${metrics.avg_mobile_lighthouse}` : '—'} />
        <MetricCell label="Avg Delta" value={metrics.avg_lighthouse_delta != null ? `${metrics.avg_lighthouse_delta > 0 ? '+' : ''}${metrics.avg_lighthouse_delta}` : '—'} />
        <MetricCell label="Timeouts" value={`${metrics.timed_out_captures}`} />
        <MetricCell label="Partial" value={`${metrics.partial_captures}`} />
      </div>

      {/* Failure reasons */}
      {metrics.top_failure_reasons.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-600 mb-1">Top Failure Reasons</p>
          <div className="space-y-1">
            {metrics.top_failure_reasons.slice(0, 5).map(r => (
              <div key={r.reason} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">{formatFailureReason(r.reason)}</span>
                <span className="text-slate-400">{r.count} ({r.percentage}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Most problematic URL */}
      {metrics.most_problematic_url && (
        <div className="text-xs text-slate-500">
          Most failures:{' '}
          <a href={metrics.most_problematic_url} className="text-blue-600 hover:underline truncate inline-block max-w-[250px] align-bottom" target="_blank" rel="noreferrer">
            {metrics.most_problematic_url}
          </a>
        </div>
      )}
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2 text-center">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-700">{value}</p>
    </div>
  );
}
