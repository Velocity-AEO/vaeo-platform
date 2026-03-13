'use client';

import { useState, useEffect } from 'react';

// ── Types (inlined for Next.js bundler) ──────────────────────────────────────

type TrendType =
  | 'improving' | 'degrading_gradual' | 'degrading_sudden'
  | 'stable' | 'volatile' | 'insufficient_data';

interface LighthouseTrend {
  url:                   string;
  metric:                string;
  trend_type:            TrendType;
  current_score:         number | null;
  change_7d:             number | null;
  projected_score_30d:   number | null;
  alert_required:        boolean;
  alert_reason:          string | null;
}

interface UrlTrend {
  url:                 string;
  trends:              LighthouseTrend[];
  requires_attention:  boolean;
}

interface SiteTrendResult {
  url_trends:                  UrlTrend[];
  sites_requiring_attention:   number;
  total_alerts:                number;
}

interface LighthouseTrendPanelProps {
  site_id: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const BADGE_MAP: Record<string, { label: string; color: string }> = {
  improving:          { label: '↑ Improving',       color: 'text-green-600 bg-green-50' },
  stable:             { label: '→ Stable',          color: 'text-slate-600 bg-slate-50' },
  degrading_gradual:  { label: '↓ Gradual decline', color: 'text-yellow-600 bg-yellow-50' },
  degrading_sudden:   { label: '↓ Sudden drop',     color: 'text-red-600 bg-red-50' },
  volatile:           { label: '~ Volatile',        color: 'text-orange-600 bg-orange-50' },
  insufficient_data:  { label: '— Not enough data', color: 'text-slate-400 bg-slate-50' },
};

function formatChange(n: number | null): string {
  if (n === null) return '—';
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : `${n}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function LighthouseTrendPanel({ site_id }: LighthouseTrendPanelProps) {
  const [data, setData] = useState<SiteTrendResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sites/${encodeURIComponent(site_id)}/lighthouse/trends`);
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
      <h2 className="text-base font-semibold text-slate-700">Performance Trends</h2>
      <p className="text-xs text-slate-400 mb-3">
        Lighthouse scores over time — mobile primary
      </p>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      )}

      {!loading && !data && (
        <p className="text-sm text-slate-400">
          Not enough data yet. Trends appear after 3+ sandbox runs.
        </p>
      )}

      {!loading && data && (
        <>
          {/* Alert banner */}
          {data.total_alerts > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-sm text-red-700">
              {data.total_alerts} {data.total_alerts === 1 ? 'page' : 'pages'} showing performance degradation
            </div>
          )}

          {/* URL list */}
          {data.url_trends.length > 0 ? (
            <div className="space-y-2">
              {data.url_trends.map((ut, i) => {
                const perf = ut.trends.find(t => t.metric === 'performance');
                const badge = BADGE_MAP[perf?.trend_type ?? 'insufficient_data'] ?? BADGE_MAP.insufficient_data;

                return (
                  <div key={i} className={`flex items-center justify-between flex-wrap gap-2 text-xs px-3 py-2 rounded-lg border ${ut.requires_attention ? 'border-red-200 bg-red-50/30' : 'border-slate-100'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-slate-600 truncate max-w-[200px]">{ut.url}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {perf?.current_score !== null && perf?.current_score !== undefined && (
                        <span className="font-semibold text-slate-700">{perf.current_score}</span>
                      )}
                      <span className={`${(perf?.change_7d ?? 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatChange(perf?.change_7d ?? null)} 7d
                      </span>
                      {perf?.trend_type?.startsWith('degrading') && perf.projected_score_30d !== null && (
                        <span className="text-red-600 font-medium">
                          Projected: {perf.projected_score_30d} in 30d
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Not enough data yet. Trends appear after 3+ sandbox runs.
            </p>
          )}
        </>
      )}
    </section>
  );
}
