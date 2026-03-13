'use client';

import { useEffect, useState } from 'react';
import LearnMoreLink from './LearnMoreLink';
import {
  getDirectionColor,
  getDirectionIcon,
  formatPositionChange,
  formatMovementLabel,
  getPeriodLabel,
  getSummaryText,
  getAvgChangeColor,
} from '../lib/rankings_trend_display';

// ── Types ────────────────────────────────────────────────────────────────────

interface KeywordTrend {
  keyword:            string;
  url:                string;
  current_position:   number;
  previous_position:  number | null;
  position_change:    number;
  direction:          'improved' | 'declined' | 'stable' | 'new';
  period:             'week' | 'month';
  current_clicks:     number;
  current_impressions: number;
  current_ctr:        number;
}

interface TrendSummary {
  site_id:             string;
  period:              'week' | 'month';
  total_keywords:      number;
  improved_count:      number;
  declined_count:      number;
  stable_count:        number;
  new_count:           number;
  avg_position_change: number;
  top_movers:          KeywordTrend[];
  top_losers:          KeywordTrend[];
  trends:              KeywordTrend[];
  calculated_at:       string;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RankingsTrendPanel({ siteId }: { siteId: string }) {
  const [period, setPeriod]     = useState<'week' | 'month'>('week');
  const [data, setData]        = useState<TrendSummary | null>(null);
  const [loading, setLoading]  = useState(true);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    setLoading(true);

    fetch(`/api/sites/${siteId}/rankings/trends?period=${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [siteId, period]);

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="bg-slate-100 rounded animate-pulse h-48" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-400">
        No keyword trend data available
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-base font-semibold text-slate-700">Keyword Movement<LearnMoreLink article_slug="reading-your-rankings" /></h2>
        <div className="flex gap-2 text-xs">
          <button
            onClick={() => setPeriod('week')}
            className={`px-3 py-1 rounded-full border ${period === 'week' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 text-slate-500 hover:text-slate-700'}`}
          >
            Week
          </button>
          <button
            onClick={() => setPeriod('month')}
            className={`px-3 py-1 rounded-full border ${period === 'month' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 text-slate-500 hover:text-slate-700'}`}
          >
            Month
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        {/* Summary cards */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-xs text-slate-500">{getPeriodLabel(period)}</span>
            <span className={`text-sm font-bold ${getAvgChangeColor(data.avg_position_change)}`}>
              {data.avg_position_change > 0 ? '+' : ''}{data.avg_position_change} avg
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
            <span className="text-green-600 font-bold text-sm">{data.improved_count}</span>
            <span className="text-xs text-green-700">improved</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
            <span className="text-red-500 font-bold text-sm">{data.declined_count}</span>
            <span className="text-xs text-red-600">declined</span>
          </div>
          {data.new_count > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
              <span className="text-purple-600 font-bold text-sm">{data.new_count}</span>
              <span className="text-xs text-purple-700">new</span>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400">
          {getSummaryText(data.improved_count, data.declined_count, data.total_keywords)}
        </p>

        {/* Top movers */}
        {data.top_movers.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Top Movers</h3>
            <div className="space-y-1">
              {data.top_movers.map((t) => (
                <div key={t.keyword} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`font-bold ${getDirectionColor(t.direction)}`}>
                      {getDirectionIcon(t.direction)}
                    </span>
                    <span className="text-slate-700 truncate" title={formatMovementLabel(t.keyword, t.previous_position, t.current_position)}>
                      {t.keyword}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-slate-400">
                      {t.previous_position ?? '—'} → {t.current_position}
                    </span>
                    <span className={`text-xs font-bold ${getDirectionColor(t.direction)}`}>
                      {formatPositionChange(t.position_change)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top losers */}
        {data.top_losers.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Biggest Drops</h3>
            <div className="space-y-1">
              {data.top_losers.map((t) => (
                <div key={t.keyword} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`font-bold ${getDirectionColor(t.direction)}`}>
                      {getDirectionIcon(t.direction)}
                    </span>
                    <span className="text-slate-700 truncate">
                      {t.keyword}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-slate-400">
                      {t.previous_position ?? '—'} → {t.current_position}
                    </span>
                    <span className={`text-xs font-bold ${getDirectionColor(t.direction)}`}>
                      {formatPositionChange(t.position_change)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
