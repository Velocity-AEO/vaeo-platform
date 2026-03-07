'use client';

import { useState } from 'react';
import type { ActionQueueRow } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import RiskBadge from '@/components/RiskBadge';
import ActionButtons from '@/components/ActionButtons';
import Link from 'next/link';

type QueueRow = ActionQueueRow & { site_url: string };

export default function QueueTable({ rows: initialRows }: { rows: QueueRow[] }) {
  const [rows, setRows] = useState(initialRows);

  function refresh(id: string, newStatus: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, execution_status: newStatus as ActionQueueRow['execution_status'] } : r
      )
    );
  }

  const visible = rows.filter((r) => r.execution_status === 'pending_approval');

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
            <th className="px-4 py-3 font-medium">Site</th>
            <th className="px-4 py-3 font-medium">URL</th>
            <th className="px-4 py-3 font-medium">Issue</th>
            <th className="px-4 py-3 font-medium text-center">Risk</th>
            <th className="px-4 py-3 font-medium text-center">Priority</th>
            <th className="px-4 py-3 font-medium">Run</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visible.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-xs">
                No items pending approval.
              </td>
            </tr>
          )}
          {visible.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 text-xs font-medium text-slate-700 max-w-[140px] truncate">
                {row.site_url}
              </td>
              <td className="px-4 py-3 max-w-xs truncate text-xs text-slate-500">
                <a href={row.url} target="_blank" rel="noreferrer" className="hover:underline">
                  {row.url}
                </a>
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">{row.issue_type}</td>
              <td className="px-4 py-3 text-center"><RiskBadge score={row.risk_score} /></td>
              <td className="px-4 py-3 text-center text-xs text-slate-500">{row.priority}</td>
              <td className="px-4 py-3 text-xs">
                <Link href={`/runs/${row.run_id}`} className="text-blue-600 hover:underline font-mono">
                  {row.run_id.slice(0, 8)}…
                </Link>
              </td>
              <td className="px-4 py-3">
                <ActionButtons
                  itemId={row.id}
                  tenantId={row.tenant_id}
                  status={row.execution_status}
                  onDone={() => refresh(row.id, 'deployed')}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
