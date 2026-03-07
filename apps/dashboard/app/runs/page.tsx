import Link from 'next/link';
import { getRecentRuns } from '@/lib/queries';
import StatusBadge from '@/components/StatusBadge';

const PAGE_SIZE = 20;

export default async function RunsPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const page = Math.max(1, Number(searchParams?.page ?? 1));
  // Overfetch one extra to detect if there's a next page
  const runs = await getRecentRuns(page * PAGE_SIZE + 1);

  const total   = runs.length;
  const hasNext = total > page * PAGE_SIZE;
  const hasPrev = page > 1;
  const pageRuns = runs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Runs</h1>
        <Link
          href="/runs/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + New Run
        </Link>
      </div>

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
            {pageRuns.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400 text-xs">
                  No runs yet.
                </td>
              </tr>
            )}
            {pageRuns.map((r) => (
              <tr key={r.run_id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 font-medium">
                  <Link href={`/runs/${r.run_id}`} className="text-blue-600 hover:underline">
                    {r.site_url}
                  </Link>
                </td>
                <td className="px-5 py-3 text-slate-500 uppercase text-xs">{r.cms_type}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={r.status} size="sm" />
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-xs">{r.urls_crawled ?? '—'}</td>
                <td className="px-5 py-3 text-right tabular-nums text-xs">{r.fixes_deployed}</td>
                <td className="px-5 py-3 text-slate-400 text-xs">
                  {new Date(r.started_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-slate-400">Page {page}</span>
          <div className="flex gap-2">
            {hasPrev && (
              <Link
                href={`/runs?page=${page - 1}`}
                className="px-3 py-1.5 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
              >
                ← Previous
              </Link>
            )}
            {hasNext && (
              <Link
                href={`/runs?page=${page + 1}`}
                className="px-3 py-1.5 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
