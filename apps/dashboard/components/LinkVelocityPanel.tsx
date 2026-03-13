'use client';

import { useEffect, useState } from 'react';
import {
  getVelocityTrendConfig,
  formatVelocityChange,
  getVelocityAlertLevel,
} from '../lib/velocity_display.js';

interface VelocityTrend {
  url: string;
  title: string | null;
  current_inbound: number;
  change_7d: number | null;
  change_30d: number | null;
  pct_change_7d: number | null;
  pct_change_30d: number | null;
  trend_type: string;
  is_hub_page: boolean;
  alert_required: boolean;
  alert_reason: string | null;
  authority_score: number | null;
}

interface VelocitySummary {
  total_pages: number;
  pages_gaining: number;
  pages_losing_sudden: number;
  pages_losing_gradual: number;
  pages_stable: number;
  hub_pages_losing: number;
  total_alerts: number;
  top_gaining: VelocityTrend[];
  top_losing: VelocityTrend[];
}

interface VelocityData {
  summary: VelocitySummary;
  trends: VelocityTrend[];
}

export default function LinkVelocityPanel({ site_id }: { site_id: string }) {
  const [data, setData] = useState<VelocityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertsOnly, setAlertsOnly] = useState(false);

  useEffect(() => {
    if (!site_id) return;
    setLoading(true);
    fetch(`/api/sites/${site_id}/link-graph/velocity`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [site_id]);

  if (loading) {
    return <p className="text-sm text-slate-400 py-4">Loading velocity data...</p>;
  }

  if (!data || data.summary.total_pages === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-slate-400">
          Velocity data builds over time — check back after the next weekly snapshot
        </p>
      </div>
    );
  }

  const { summary, trends } = data;
  const filteredTrends = alertsOnly ? trends.filter(t => t.alert_required) : trends;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Link Authority Velocity</h2>
        <p className="text-xs text-slate-400">Tracks how internal link authority is changing week over week</p>
      </div>

      {/* Summary row */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-1 text-xs">
          <span className="text-green-600 font-bold">{summary.pages_gaining}</span>
          <span className="text-slate-500">Gaining ↑</span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-red-600 font-bold">{summary.pages_losing_sudden}</span>
          <span className="text-slate-500">Sudden Loss ↓</span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-orange-500 font-bold">{summary.pages_losing_gradual}</span>
          <span className="text-slate-500">Gradual Loss ↓</span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-400 font-bold">{summary.pages_stable}</span>
          <span className="text-slate-500">Stable →</span>
        </div>
      </div>

      {/* Hub alert banner */}
      {summary.hub_pages_losing > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs font-medium text-red-700">
            {summary.hub_pages_losing} hub page{summary.hub_pages_losing > 1 ? 's are' : ' is'} losing inbound links — review immediately
          </p>
        </div>
      )}

      {/* Top Gaining */}
      {summary.top_gaining.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-700 mb-2">Pages gaining authority</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b">
                  <th className="pb-2 pr-3">URL</th>
                  <th className="pb-2 pr-3">Current</th>
                  <th className="pb-2 pr-3">Change</th>
                  <th className="pb-2">Trend</th>
                </tr>
              </thead>
              <tbody>
                {summary.top_gaining.map(t => {
                  const cfg = getVelocityTrendConfig(t.trend_type as any);
                  return (
                    <tr key={t.url} className="border-b border-slate-100 text-slate-600">
                      <td className="py-2 pr-3 truncate max-w-xs">{t.url.replace(/^https?:\/\//, '')}</td>
                      <td className="py-2 pr-3">{t.current_inbound}</td>
                      <td className="py-2 pr-3 text-green-600">{formatVelocityChange(t.change_7d, t.pct_change_7d)}</td>
                      <td className="py-2"><span className={cfg.color}>{cfg.icon} {cfg.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Losing */}
      {summary.top_losing.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-700 mb-2">Pages losing authority</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b">
                  <th className="pb-2 pr-3">URL</th>
                  <th className="pb-2 pr-3">Current</th>
                  <th className="pb-2 pr-3">Change</th>
                  <th className="pb-2 pr-3">Trend</th>
                  <th className="pb-2">Hub</th>
                </tr>
              </thead>
              <tbody>
                {summary.top_losing.map(t => {
                  const cfg = getVelocityTrendConfig(t.trend_type as any);
                  return (
                    <tr key={t.url} className="border-b border-slate-100 text-slate-600">
                      <td className="py-2 pr-3 truncate max-w-xs">{t.url.replace(/^https?:\/\//, '')}</td>
                      <td className="py-2 pr-3">{t.current_inbound}</td>
                      <td className="py-2 pr-3 text-red-600">{formatVelocityChange(t.change_7d, t.pct_change_7d)}</td>
                      <td className="py-2"><span className={cfg.color}>{cfg.icon} {cfg.label}</span></td>
                      <td className="py-2">{t.is_hub_page ? <span className="text-indigo-600 font-medium">Hub</span> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full trends */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-slate-700">All Pages</h3>
          <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={alertsOnly}
              onChange={() => setAlertsOnly(!alertsOnly)}
              className="rounded"
            />
            Alerts only
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b">
                <th className="pb-2 pr-3">URL</th>
                <th className="pb-2 pr-3">Inbound</th>
                <th className="pb-2 pr-3">7d</th>
                <th className="pb-2 pr-3">30d</th>
                <th className="pb-2 pr-3">Authority</th>
                <th className="pb-2">Trend</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrends.map(t => {
                const cfg = getVelocityTrendConfig(t.trend_type as any);
                const level = getVelocityAlertLevel(t as any);
                return (
                  <tr
                    key={t.url}
                    className={`border-b border-slate-100 text-slate-600 ${
                      level === 'critical' ? 'bg-red-50' : level === 'warning' ? 'bg-yellow-50' : ''
                    }`}
                  >
                    <td className="py-2 pr-3 truncate max-w-xs">
                      {t.url.replace(/^https?:\/\//, '')}
                      {t.is_hub_page && <span className="ml-1 text-indigo-500 text-[10px]">Hub</span>}
                    </td>
                    <td className="py-2 pr-3">{t.current_inbound}</td>
                    <td className="py-2 pr-3">{formatVelocityChange(t.change_7d, t.pct_change_7d)}</td>
                    <td className="py-2 pr-3">{formatVelocityChange(t.change_30d, t.pct_change_30d)}</td>
                    <td className="py-2 pr-3">{t.authority_score ?? '—'}</td>
                    <td className="py-2"><span className={cfg.color}>{cfg.icon} {cfg.label}</span></td>
                  </tr>
                );
              })}
              {filteredTrends.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-slate-400 text-center">
                  {alertsOnly ? 'No alerts' : 'No velocity data available'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
