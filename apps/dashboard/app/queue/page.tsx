import { getPendingApprovals } from '@/lib/queries';
import QueueTable from './QueueTable';

export default async function QueuePage() {
  const rows = await getPendingApprovals();

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Approval Queue</h1>
        {rows.length > 0 && (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-400 text-yellow-900 text-xs font-bold">
            {rows.length}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Items here were flagged for human review before being deployed. Approve or reject each fix below.
        Approved fixes are marked <span className="font-medium text-green-700">deployed</span>.
        Rejected fixes are marked <span className="font-medium text-red-700">failed</span>.
      </p>
      <QueueTable rows={rows} />
    </>
  );
}
