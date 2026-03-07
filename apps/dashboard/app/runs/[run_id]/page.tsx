import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getRunActions, getRunSnapshot } from '@/lib/queries';
import StatusBadge from '@/components/StatusBadge';
import ActionQueueTable from './ActionQueueTable';

export default async function RunDetailPage({ params }: { params: { run_id: string } }) {
  const [snap, actions] = await Promise.all([
    getRunSnapshot(params.run_id),
    getRunActions(params.run_id),
  ]);

  if (!snap) notFound();

  const tenantId = snap.tenant_id ?? '';

  const counts = actions.reduce<Record<string, number>>((acc, a) => {
    acc[a.execution_status] = (acc[a.execution_status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <div className="mb-6">
        <Link href="/" className="text-xs text-slate-400 hover:text-slate-600">← Dashboard</Link>
        <h1 className="text-xl font-semibold mt-1">{snap.site_id}</h1>
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
          <span>Run: <code className="font-mono bg-slate-100 px-1 rounded">{snap.run_id}</code></span>
          <StatusBadge status={snap.status} size="sm" />
          <span>{new Date(snap.started_at).toLocaleString()}</span>
          {snap.urls_crawled != null && <span>{snap.urls_crawled} URLs crawled</span>}
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {Object.entries(counts).map(([status, count]) => (
          <span key={status} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-slate-200 text-xs text-slate-600">
            <StatusBadge status={status} size="sm" />
            <span className="font-semibold">{count}</span>
          </span>
        ))}
        {actions.length === 0 && (
          <span className="text-xs text-slate-400">No actions in queue for this run.</span>
        )}
      </div>

      <ActionQueueTable actions={actions} tenantId={tenantId} />
    </>
  );
}
