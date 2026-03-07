'use client';

import { useState } from 'react';
import type { ActionQueueRow } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import RiskBadge from '@/components/RiskBadge';
import ActionButtons from '@/components/ActionButtons';

const STATUSES = ['all', 'pending_approval', 'deployed', 'failed', 'queued', 'regression_detected', 'rolled_back'];

export default function ActionQueueTable({
  actions,
  tenantId,
}: {
  actions: ActionQueueRow[];
  tenantId: string;
}) {
  const [filter, setFilter]   = useState('all');
  const [rows, setRows]       = useState(actions);

  const displayed = filter === 'all' ? rows : rows.filter((r) => r.execution_status === filter);

  function refresh(id: string, newStatus: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, execution_status: newStatus as ActionQueueRow['execution_status'] } : r))
    );
  }

  return (
    <>
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 mb-4">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              filter === s
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
            {s !== 'all' && (
              <span className="ml-1 text-[10px] opacity-70">
                ({rows.filter((r) => r.execution_status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">URL</th>
              <th className="px-4 py-3 font-medium">Issue</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-center">Risk</th>
              <th className="px-4 py-3 font-medium text-center">Priority</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayed.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">
                  No items match this filter.
                </td>
              </tr>
            )}
            {displayed.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 max-w-xs truncate text-xs text-slate-600">
                  <a href={row.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {row.url}
                  </a>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{row.issue_type}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.execution_status} size="sm" />
                </td>
                <td className="px-4 py-3 text-center">
                  <RiskBadge score={row.risk_score} />
                </td>
                <td className="px-4 py-3 text-center text-xs text-slate-500">{row.priority}</td>
                <td className="px-4 py-3">
                  <ActionButtons
                    itemId={row.id}
                    tenantId={tenantId}
                    status={row.execution_status}
                    onDone={() => refresh(row.id, row.execution_status)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
