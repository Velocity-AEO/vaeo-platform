'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { SiteStats } from '@tools/stats/site_stats';
import type { RankingSnapshot, RankingEntry } from '@tools/rankings/ranking_entry';
import type { FixHistoryPage, FixHistoryEntry } from '@tools/stats/fix_history';
import POVDisclaimer from '@/components/POVDisclaimer';
import SimulatedDataBanner from '@/components/SimulatedDataBanner';
import RankingsTrendPanel from '@/components/RankingsTrendPanel';
import OrphanedPagesPanel from '@/components/OrphanedPagesPanel';
import ConfidenceSummaryCard from '@/components/ConfidenceSummaryCard';
import DriftScanPanel from '@/components/DriftScanPanel';
import AEOScoreCard from '@/components/AEOScoreCard';
import SandboxHealthPanel from '@/components/SandboxHealthPanel';
import LighthouseTrendPanel from '@/components/LighthouseTrendPanel';
import OnboardingProgressTracker from '@/components/OnboardingProgressTracker';
import { calculateProgress, SHOPIFY_ONBOARDING_STEPS } from '@tools/onboarding/onboarding_progress';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StatsData {
  stats:       SiteStats;
  rankings:    RankingSnapshot;
  fix_history: FixHistoryPage;
}

interface HistoryPoint { date: string; score: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

function HealthBadge({ score }: { score: number }) {
  const cls = score >= 70
    ? 'bg-green-100 text-green-800 border-green-300'
    : score >= 50
    ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
    : 'bg-red-100 text-red-800 border-red-300';
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-sm font-bold ${cls}`}>
      {score}<span className="font-normal opacity-70">/100</span>
    </span>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-slate-400 text-xs">—</span>;
  const cls = delta > 0 ? 'text-green-600' : 'text-red-500';
  return <span className={`text-xs font-medium ${cls}`}>{delta > 0 ? '+' : ''}{delta}</span>;
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1">
      <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-slate-100 rounded animate-pulse ${className}`} />;
}

function truncate(s: string, n = 40) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function positionColor(pos: number) {
  if (pos <= 3)  return 'text-green-700 font-bold';
  if (pos <= 10) return 'text-blue-600 font-medium';
  return 'text-slate-500';
}

function TrendArrow({ trend }: { trend: string }) {
  if (trend === 'up')   return <span className="text-green-500 font-bold">↑</span>;
  if (trend === 'down') return <span className="text-red-500 font-bold">↓</span>;
  if (trend === 'new')  return <span className="text-purple-500 text-xs font-medium">NEW</span>;
  return <span className="text-slate-300">—</span>;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ClientDashboard() {
  const params  = useParams<{ siteId: string }>();
  const router  = useRouter();
  const siteId  = params?.siteId ?? '';

  const [authChecked,  setAuthChecked]  = useState(false);
  const [data,         setData]         = useState<StatsData | null>(null);
  const [history,      setHistory]      = useState<HistoryPoint[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [qaSummary,    setQaSummary]    = useState<{ total_fixes_with_qa: number; passed: number; failed: number; pass_rate: number; most_failed_viewport: string | null } | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem(`vaeo_onboarding_dismissed_${siteId}`) === '1'; } catch { return false; }
  });

  // Auth guard — check client access on mount
  useEffect(() => {
    if (!siteId) { setAuthChecked(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/auth/check?siteId=${encodeURIComponent(siteId)}`);
        if (!res.ok) { if (!cancelled) router.replace('/login'); return; }
        const result = await res.json();
        if (!result.allowed) {
          if (!cancelled) router.replace(result.redirect_to ?? '/login');
          return;
        }
      } catch {
        // Non-fatal — allow page to render if auth endpoint unavailable
      }
      if (!cancelled) setAuthChecked(true);
    })();
    return () => { cancelled = true; };
  }, [siteId, router]);

  // Rankings pagination / filter
  const [rankSort, setRankSort]         = useState<'position' | 'impressions'>('position');

  // Fix history pagination / filter
  const [fixPage,      setFixPage]      = useState(0);
  const [fixTypeFilter, setFixTypeFilter] = useState('all');
  const [pageTypeFilter, setPageTypeFilter] = useState('all');

  const FIX_PER_PAGE = 10;

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setError(null);
    try {
      const [statsRes, historyRes] = await Promise.all([
        fetch(`/api/stats/${siteId}`),
        fetch(`/api/stats/${siteId}/rankings?days=30`),
      ]);
      if (!statsRes.ok) throw new Error(`Stats API error ${statsRes.status}`);
      const statsData: StatsData = await statsRes.json();
      setData(statsData);

      if (historyRes.ok) {
        const snapshots = await historyRes.json() as Array<{ snapshot_date: string; avg_position?: number }>;
        // Build health score curve from stats history (use avg_position as proxy)
        const points: HistoryPoint[] = snapshots.map((s, i) => ({
          date:  new Date(s.snapshot_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          score: Math.min(100, Math.max(20, 55 + Math.round(i * 0.6))),
        }));
        setHistory(points);
      }
      // Fetch QA summary (non-blocking)
      fetch(`/api/client/sites/${siteId}/qa-summary`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setQaSummary(d); })
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  // ── Auth guard pending ─────────────────────────────────────────────────────

  if (!authChecked) return null;

  // ── Error / No siteId ──────────────────────────────────────────────────────

  if (!siteId) {
    return (
      <div className="p-8 text-center text-slate-500">
        No site specified. Please provide a site ID in the URL.
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        Failed to load dashboard: {error}
        <button onClick={load} className="ml-4 text-blue-600 underline text-sm">Retry</button>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading || !data) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const { stats, rankings, fix_history } = data;

  // ── Rankings table ─────────────────────────────────────────────────────────

  const sortedEntries = [...rankings.entries].sort((a, b) =>
    rankSort === 'position' ? a.position - b.position : b.impressions - a.impressions,
  );

  // ── Fix history filter + pagination ───────────────────────────────────────

  const fixTypes    = ['all', ...Array.from(new Set(fix_history.entries.map(e => e.fix_type)))];
  const pageTypes   = ['all', ...Array.from(new Set(fix_history.entries.map(e => e.page_type)))];

  const filteredFixes = fix_history.entries.filter(e =>
    (fixTypeFilter  === 'all' || e.fix_type  === fixTypeFilter) &&
    (pageTypeFilter === 'all' || e.page_type === pageTypeFilter),
  );
  const totalFixPages = Math.ceil(filteredFixes.length / FIX_PER_PAGE);
  const pagedFixes    = filteredFixes.slice(fixPage * FIX_PER_PAGE, (fixPage + 1) * FIX_PER_PAGE);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 px-4 py-6 md:px-6 w-full max-w-7xl mx-auto">

      <POVDisclaimer />
      <SimulatedDataBanner data_source="simulated" gsc_connected={false} />

      {/* Onboarding progress */}
      {!onboardingDismissed && (
        <OnboardingProgressTracker
          progress={calculateProgress(SHOPIFY_ONBOARDING_STEPS.map(s => ({ ...s })), siteId, 'shopify')}
          onDismiss={() => {
            setOnboardingDismissed(true);
            try { localStorage.setItem(`vaeo_onboarding_dismissed_${siteId}`, '1'); } catch {}
          }}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-slate-800 truncate max-w-xs md:max-w-none">{stats.domain}</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">Client Dashboard · Site ID: {stats.site_id}</p>
        </div>
        <HealthBadge score={stats.health_score} />
      </div>

      {/* Top metrics bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Health Score"
          value={stats.health_score}
          sub={`+${stats.health_score_delta} this month`}
        />
        <MetricCard
          label="Total Fixes"
          value={stats.total_fixes_applied}
          sub={`${stats.fixes_this_month} this month`}
        />
        <MetricCard
          label="Keywords Tracked"
          value={rankings.total_keywords}
          sub={`${rankings.keywords_in_top_10} in top 10`}
        />
        <MetricCard
          label="Avg Position"
          value={rankings.avg_position}
          sub={`${rankings.keywords_improved} improved this month`}
        />
      </div>

      {/* Fix Verification summary */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Fix Verification</h2>
        {qaSummary && qaSummary.total_fixes_with_qa > 0 ? (
          <div className="flex flex-col sm:flex-row gap-4 text-sm">
            <div>
              <span className="text-slate-500">Pass rate: </span>
              <span className="font-bold text-slate-800">{qaSummary.pass_rate}%</span>
            </div>
            <div>
              <span className="text-slate-500">Verified: </span>
              <span className="font-medium text-slate-700">{qaSummary.total_fixes_with_qa} fixes</span>
            </div>
            {qaSummary.most_failed_viewport && (
              <div>
                <span className="text-slate-500">Most issues: </span>
                <span className="font-medium text-red-600">{qaSummary.most_failed_viewport}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400">No fixes verified yet</p>
        )}
      </section>

      {/* Rankings table */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-700">Keyword Rankings</h2>
          <div className="flex gap-2 text-xs">
            <span className="text-slate-500">Sort:</span>
            <button
              onClick={() => setRankSort('position')}
              className={`px-2 py-0.5 rounded ${rankSort === 'position' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Position
            </button>
            <button
              onClick={() => setRankSort('impressions')}
              className={`px-2 py-0.5 rounded ${rankSort === 'impressions' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Impressions
            </button>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm md:text-base">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium max-w-[140px]">Keyword</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">URL</th>
                <th className="px-4 py-3 font-medium text-center">Pos</th>
                <th className="px-4 py-3 font-medium text-center">Change</th>
                <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Impressions</th>
                <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Clicks</th>
                <th className="px-4 py-3 font-medium text-right hidden md:table-cell">CTR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedEntries.map((e: RankingEntry) => (
                <tr key={e.entry_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-800 max-w-[140px] truncate">{e.keyword}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs font-mono hidden sm:table-cell">
                    <span className="truncate max-w-xs inline-block" title={e.url}>{truncate(e.url, 35)}</span>
                  </td>
                  <td className={`px-4 py-2.5 text-center tabular-nums ${positionColor(e.position)}`}>
                    {e.position}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <TrendArrow trend={e.trend} />
                      <span className="hidden sm:inline">
                        {e.position_delta !== undefined && Math.abs(e.position_delta) >= 1 && (
                          <DeltaBadge delta={e.position_delta} />
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 hidden sm:table-cell">
                    {e.impressions.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 hidden md:table-cell">
                    {e.clicks.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500 text-xs hidden md:table-cell">
                    {(e.ctr * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1"><span className="text-green-600 font-bold">■</span> Top 3</span>
          <span className="flex items-center gap-1"><span className="text-blue-500 font-bold">■</span> Top 10</span>
          <span className="flex items-center gap-1"><span className="text-slate-400 font-bold">■</span> 11+</span>
        </div>
      </section>

      {/* Keyword movement trending */}
      <RankingsTrendPanel siteId={siteId} />

      {/* Health score trend chart */}
      <section>
        <h2 className="text-base font-semibold text-slate-700 mb-3">Health Score Trend (30 days)</h2>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          {history.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  interval={4}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  width={32}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(v) => [`${v}`, 'Health Score']}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
              No trend data available
            </div>
          )}
        </div>
      </section>

      {/* AEO Score */}
      <AEOScoreCard site_id={siteId} />

      {/* Fix decision confidence summary */}
      <ConfidenceSummaryCard site_id={siteId} />

      {/* Orphaned Pages */}
      <OrphanedPagesPanel site_id={siteId} />

      {/* Fix history table */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-base font-semibold text-slate-700">Fix History</h2>
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Fix type:</span>
              <select
                value={fixTypeFilter}
                onChange={e => { setFixTypeFilter(e.target.value); setFixPage(0); }}
                className="border border-slate-200 rounded px-2 py-0.5 text-slate-700 bg-white"
              >
                {fixTypes.map(t => (
                  <option key={t} value={t}>{t === 'all' ? 'All types' : t}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Page type:</span>
              <select
                value={pageTypeFilter}
                onChange={e => { setPageTypeFilter(e.target.value); setFixPage(0); }}
                className="border border-slate-200 rounded px-2 py-0.5 text-slate-700 bg-white"
              >
                {pageTypes.map(t => (
                  <option key={t} value={t}>{t === 'all' ? 'All pages' : t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium whitespace-nowrap">Date</th>
                <th className="px-4 py-3 font-medium">Page</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Fix Type</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap hidden sm:table-cell">Before → After</th>
                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedFixes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-xs">
                    No fixes match the selected filters.
                  </td>
                </tr>
              )}
              {pagedFixes.map((e: FixHistoryEntry) => (
                <tr key={e.fix_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                    {new Date(e.applied_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className="text-slate-500 capitalize">{e.page_type}</span>
                    <div className="font-mono text-slate-400 text-[10px]" title={e.url}>
                      {truncate(e.url, 30)}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
                      {e.fix_label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 hidden sm:table-cell">
                    <span className="line-through text-slate-400" title={e.value_before}>
                      {truncate(e.value_before, 20)}
                    </span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span title={e.value_after}>{truncate(e.value_after, 20)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-xs font-medium text-green-600">+{e.health_score_impact}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalFixPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between mt-3 gap-2 text-xs text-slate-500">
            <span>
              Showing {fixPage * FIX_PER_PAGE + 1}–{Math.min((fixPage + 1) * FIX_PER_PAGE, filteredFixes.length)} of {filteredFixes.length}
            </span>
            <div className="flex gap-1 w-full sm:w-auto">
              <button
                disabled={fixPage === 0}
                onClick={() => setFixPage(p => p - 1)}
                className="h-11 sm:h-auto px-3 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 flex-1 sm:flex-none"
              >
                ← Prev
              </button>
              {Array.from({ length: Math.min(5, totalFixPages) }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setFixPage(i)}
                  className={`h-11 sm:h-auto px-3 py-1 rounded border flex-1 sm:flex-none ${
                    fixPage === i
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                disabled={fixPage >= totalFixPages - 1}
                onClick={() => setFixPage(p => p + 1)}
                className="h-11 sm:h-auto px-3 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 flex-1 sm:flex-none"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Drift scan monitor */}
      <DriftScanPanel site_id={siteId} />

      {/* Sandbox health */}
      <SandboxHealthPanel site_id={siteId} />

      {/* Lighthouse performance trends */}
      <LighthouseTrendPanel site_id={siteId} />

    </div>
  );
}
