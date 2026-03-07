import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getRunSummary, getRunActions } from '@/lib/queries';
import StatusBadge from '@/components/StatusBadge';
import ActionQueueTable from './ActionQueueTable';

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  variant = 'default',
}: {
  label: string;
  value: number | string;
  variant?: 'default' | 'success' | 'warn' | 'danger';
}) {
  const variantClass = {
    default: 'border-slate-200 bg-white',
    success: 'border-green-200 bg-green-50',
    warn:    'border-yellow-200 bg-yellow-50',
    danger:  'border-red-200 bg-red-50',
  }[variant];

  const valueClass = {
    default: 'text-slate-800',
    success: 'text-green-700',
    warn:    'text-yellow-700',
    danger:  'text-red-700',
  }[variant];

  return (
    <div className={`rounded-xl border p-5 flex flex-col gap-1 ${variantClass}`}>
      <span className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</span>
      <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function RunDetailPage({ params }: { params: { run_id: string } }) {
  const [snap, actions] = await Promise.all([
    getRunSummary(params.run_id),
    getRunActions(params.run_id),
  ]);

  if (!snap) notFound();

  const tenantId = actions[0]?.tenant_id ?? '';

  // Derive summary counts from the fetched actions
  const issuesFound = actions.length;
  const deployed    = actions.filter((a) => a.execution_status === 'deployed').length;
  const pending     = actions.filter((a) =>
    a.execution_status === 'pending_approval' ||
    (a.execution_status === 'queued' && a.approval_required),
  ).length;
  const failed      = actions.filter((a) => a.execution_status === 'failed').length;

  // Truncate run_id for display
  const shortRunId = params.run_id.slice(0, 8) + '…';

  return (
    <>
      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <Link
          href="/runs"
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors mb-2"
        >
          ← Runs
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{snap.site_url}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
              <span className="text-xs text-slate-500">
                Run{' '}
                <code
                  className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 cursor-pointer select-all"
                  title={params.run_id}
                >
                  {shortRunId}
                </code>
              </span>
              <StatusBadge status={snap.status} size="sm" />
              <span className="text-xs text-slate-400">
                {new Date(snap.started_at).toLocaleString()}
              </span>
              <span className="text-xs text-slate-400 uppercase tracking-wide">
                {snap.cms_type}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary stats ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        <StatCard label="URLs crawled"    value={snap.urls_crawled} />
        <StatCard label="Issues found"    value={issuesFound} />
        <StatCard label="Deployed"        value={deployed}    variant={deployed > 0 ? 'success' : 'default'} />
        <StatCard label="Pending approval" value={pending}    variant={pending  > 0 ? 'warn'    : 'default'} />
        <StatCard label="Failed"          value={failed}      variant={failed   > 0 ? 'danger'  : 'default'} />
      </div>

      {/* ── Issues table ─────────────────────────────────────────────────────── */}
      <ActionQueueTable actions={actions} tenantId={tenantId} />
    </>
  );
}
