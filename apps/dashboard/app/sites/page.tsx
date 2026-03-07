import Link from 'next/link';
import { getAllSites } from '@/lib/queries';

function HealthBadge({ score }: { score: { total: number; grade: string } }) {
  const color =
    score.total >= 70 ? 'text-green-700 bg-green-50 border-green-200'
    : score.total >= 50 ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
    : 'text-red-700 bg-red-50 border-red-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium tabular-nums ${color}`}>
      {score.total}
      <span className="opacity-60">/ {score.grade}</span>
    </span>
  );
}

export default async function SitesPage() {
  const sites = await getAllSites();

  return (
    <>
      <h1 className="text-xl font-semibold mb-6">Sites</h1>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Site</th>
              <th className="px-5 py-3 font-medium">CMS</th>
              <th className="px-5 py-3 font-medium">Health</th>
              <th className="px-5 py-3 font-medium text-right">Issues</th>
              <th className="px-5 py-3 font-medium">Last run</th>
              <th className="px-5 py-3 font-medium">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sites.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400 text-xs">
                  No sites registered.
                </td>
              </tr>
            )}
            {sites.map((s) => (
              <tr key={s.site_id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 font-medium">
                  {s.last_run_id ? (
                    <Link href={`/runs/${s.last_run_id}`} className="text-blue-600 hover:underline">
                      {s.site_url}
                    </Link>
                  ) : (
                    <span className="text-slate-700">{s.site_url}</span>
                  )}
                </td>
                <td className="px-5 py-3 text-slate-500 uppercase text-xs">{s.cms_type}</td>
                <td className="px-5 py-3">
                  <HealthBadge score={s.health_score} />
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-xs">
                  {s.total_issues > 0 ? (
                    <Link href="/queue" className="text-blue-600 hover:underline font-medium">
                      {s.total_issues}
                    </Link>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-xs text-slate-400">
                  {s.last_run_at ? new Date(s.last_run_at).toLocaleString() : '—'}
                </td>
                <td className="px-5 py-3 text-xs text-slate-400">
                  {new Date(s.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
