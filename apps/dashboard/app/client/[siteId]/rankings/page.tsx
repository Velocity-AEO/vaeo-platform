'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface GSCStatus {
  data_source: 'gsc_live' | 'simulated';
  last_synced_at: string | null;
  ranking_count: number;
  status_message: string;
}

interface RankingEntry {
  keyword: string;
  position: number;
  previous_position: number | null;
  clicks: number;
  impressions: number;
  url: string;
}

function formatPosition(pos: number): string {
  if (pos == null || isNaN(pos)) return '—';
  return pos.toFixed(1);
}

function getChange(current: number, previous: number | null): { delta: number; direction: 'up' | 'down' | 'same' } {
  if (previous == null) return { delta: 0, direction: 'same' };
  const d = previous - current;
  if (d > 0) return { delta: d, direction: 'up' };
  if (d < 0) return { delta: Math.abs(d), direction: 'down' };
  return { delta: 0, direction: 'same' };
}

function changeClasses(dir: 'up' | 'down' | 'same'): string {
  if (dir === 'up') return 'text-green-600';
  if (dir === 'down') return 'text-red-600';
  return 'text-gray-400';
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

export default function RankingsPage() {
  const params = useParams();
  const siteId = params?.siteId as string;

  const [gscStatus, setGscStatus] = useState<GSCStatus | null>(null);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;
    Promise.all([
      fetch(`/api/sites/${siteId}/gsc-status`).then((r) => r.json()).catch(() => null),
      fetch(`/api/sites/${siteId}/rankings`).then((r) => r.json()).catch(() => []),
    ]).then(([status, ranks]) => {
      setGscStatus(status);
      const sorted = Array.isArray(ranks)
        ? [...ranks].sort((a: RankingEntry, b: RankingEntry) => (a.position ?? 0) - (b.position ?? 0))
        : [];
      setRankings(sorted);
      setLoading(false);
    });
  }, [siteId]);

  if (loading) {
    return (
      <div className="px-4 py-6 md:px-6 w-full max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Rankings</h1>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const isLive = gscStatus?.data_source === 'gsc_live';

  return (
    <div className="px-4 py-6 md:px-6 w-full max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rankings</h1>
        <div className="flex items-center gap-3">
          {isLive ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Live GSC Data
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              Estimated Data
            </span>
          )}
          {isLive && gscStatus?.last_synced_at && (
            <span className="text-xs text-gray-500">
              Last synced: {new Date(gscStatus.last_synced_at).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {!isLive && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          Rankings shown are estimated. Connect Google Search Console for live data.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="pb-2 pr-4 font-medium">Keyword</th>
              <th className="pb-2 pr-4 font-medium">Position</th>
              <th className="pb-2 pr-4 font-medium">Change</th>
              <th className="pb-2 pr-4 font-medium">Clicks</th>
              <th className="pb-2 pr-4 font-medium hidden sm:table-cell">Impressions</th>
              <th className="pb-2 font-medium">URL</th>
            </tr>
          </thead>
          <tbody>
            {rankings.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  No ranking data available yet.
                </td>
              </tr>
            )}
            {rankings.map((r, i) => {
              const change = getChange(r.position, r.previous_position);
              return (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <span className="sm:hidden">{truncate(r.keyword, 20)}</span>
                    <span className="hidden sm:inline">{r.keyword}</span>
                  </td>
                  <td className="py-2 pr-4 font-medium">{formatPosition(r.position)}</td>
                  <td className={`py-2 pr-4 ${changeClasses(change.direction)}`}>
                    {change.direction === 'up' && `▲ ${change.delta.toFixed(1)}`}
                    {change.direction === 'down' && `▼ ${change.delta.toFixed(1)}`}
                    {change.direction === 'same' && '—'}
                  </td>
                  <td className="py-2 pr-4">{r.clicks ?? 0}</td>
                  <td className="py-2 pr-4 hidden sm:table-cell">{r.impressions ?? 0}</td>
                  <td className="py-2 text-gray-500 truncate max-w-[200px]">{r.url}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
