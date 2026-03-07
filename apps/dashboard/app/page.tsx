import Link from 'next/link';
import { getDashboardStats, getRecentRuns } from '@/lib/queries';
import StatusBadge from '@/components/StatusBadge';

function StatCard({
  label,
  value,
  highlight,
  danger,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  danger?: boolean;
}) {
  const base = 'rounded-xl border p-5 flex flex-col gap-1';
  const color =
    danger && value > 0
      ? 'border-red-200 bg-red-50'
      : highlight && value > 0
      ? 'border-yellow-200 bg-yellow-50'
      : 'border-slate-200 bg-white';
  const numColor =
    danger && value > 0
      ? 'text-red-700'
      : highlight && value > 0
      ? 'text-yellow-700'
      : 'text-slate-800';
  return (
    <div className={`${base} ${color}`}>
      <span className={`text-3xl font-bold tabular-nums ${numColor}`}>{value}</span>
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}

export default async function DashboardPage() {
  const [stats, runs] = await Promise.all([getDashboardStats(), getRecentRuns(20)]);

  return (
    <>
      <h1 className="text-xl font-semibold mb-6">Overview</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        <StatCard label="Runs today"           value={stats.total_runs_today} />
        <StatCard label="Fixes deployed today" value={stats.fixes_deployed_today} />
        <StatCard label="Pending approval"     value={stats.fixes_pending_approval} highlight />
        <StatCard label="Failed fixes (24h)"    value={stats.active_regressions}    danger />
      </div>

      {/* Recent runs table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-medium text-sm">Recent Runs</h2>
          <Link href="/runs" className="text-xs text-blue-600 hover:underline">View all →</Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Site</th>
              <th className="px-5 py-3 font-medium">CMS</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium text-right">URLs</th>
              <th className="px-5 py-3 font-medium text-right">Fixes deployed</th>
              <th className="px-5 py-3 font-medium">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400 text-xs">
                  No runs yet.
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r.run_id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 font-medium">
                  <Link href={`/runs/${r.run_id}`} className="text-blue-600 hover:underline">
                    {r.site_url}
                  </Link>
                </td>
                <td className="px-5 py-3 text-slate-500 uppercase text-xs">{r.cms_type}</td>
                <td className="px-5 py-3"><StatusBadge status={r.status} size="sm" /></td>
                <td className="px-5 py-3 text-right tabular-nums">{r.urls_crawled ?? '—'}</td>
                <td className="px-5 py-3 text-right tabular-nums">{r.fixes_deployed}</td>
                <td className="px-5 py-3 text-slate-400 text-xs">
                  {new Date(r.started_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
