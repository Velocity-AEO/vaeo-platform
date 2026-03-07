import Link from 'next/link';
import { getRecentRuns } from '@/lib/queries';
import StatusBadge from '@/components/StatusBadge';

export default async function RunsPage() {
  const runs = await getRecentRuns(100);

  return (
    <>
      <h1 className="text-xl font-semibold mb-6">Runs</h1>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
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
