'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CommandCenterRow } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import RiskBadge from '@/components/RiskBadge';

type FilterTab = 'all' | 'pending' | 'deployed' | 'failed' | 'rolled_back';

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'all',        label: 'All'             },
  { id: 'pending',    label: 'Pending Approval' },
  { id: 'deployed',   label: 'Deployed'         },
  { id: 'failed',     label: 'Failed'           },
  { id: 'rolled_back', label: 'Rolled Back'     },
];

interface Toast { id: number; message: string; type: 'success' | 'error' }

interface Props {
  rows: CommandCenterRow[];
  onStatusChange: (id: string, newStatus: string) => void;
}

export default function CommandCenterTable({ rows, onStatusChange }: Props) {
  const [tab,    setTab]    = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [busy,   setBusy]   = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  function addToast(message: string, type: Toast['type']) {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }

  async function updateStatus(row: CommandCenterRow, newStatus: string) {
    setBusy(row.id);
    const res = await fetch(`/api/queue/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ execution_status: newStatus }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      addToast(`Error: ${body.error ?? res.statusText}`, 'error');
      return;
    }
    onStatusChange(row.id, newStatus);
    const label =
      newStatus === 'deployed'    ? 'Approved and marked deployed'   :
      newStatus === 'failed'      ? 'Rejected — marked failed'        :
      newStatus === 'rolled_back' ? 'Rolled back'                     : newStatus;
    addToast(label, 'success');
  }

  const filtered = rows.filter((r) => {
    const matchesTab =
      tab === 'all'        ? true :
      tab === 'pending'    ? (r.execution_status === 'queued' && r.approval_required) :
      tab === 'deployed'   ? r.execution_status === 'deployed'   :
      tab === 'failed'     ? r.execution_status === 'failed'     :
      tab === 'rolled_back'? r.execution_status === 'rolled_back': false;
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      r.url.toLowerCase().includes(q) ||
      r.site_url.toLowerCase().includes(q) ||
      r.issue_type.toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  function tabCount(t: FilterTab) {
    if (t === 'all')        return rows.length;
    if (t === 'pending')    return rows.filter((r) => r.execution_status === 'queued' && r.approval_required).length;
    if (t === 'deployed')   return rows.filter((r) => r.execution_status === 'deployed').length;
    if (t === 'failed')     return rows.filter((r) => r.execution_status === 'failed').length;
    if (t === 'rolled_back')return rows.filter((r) => r.execution_status === 'rolled_back').length;
    return 0;
  }

  return (
    <div className="space-y-4">
      {/* Toast notifications */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white transition-all ${
              t.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 flex-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                tab === t.id
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.label}
              <span className="ml-1 opacity-60">({tabCount(t.id)})</span>
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search URL or issue…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 w-52"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">P</th>
              <th className="px-4 py-3 font-medium">Site</th>
              <th className="px-4 py-3 font-medium">URL</th>
              <th className="px-4 py-3 font-medium">Issue</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-center">Risk</th>
              <th className="px-4 py-3 font-medium">Run</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-xs">
                  {rows.length === 0 ? 'No items in the command center.' : 'No items match this filter.'}
                </td>
              </tr>
            )}
            {filtered.map((row) => {
              const isBusy = busy === row.id;
              const isPending = row.execution_status === 'queued' && row.approval_required;
              const isDeployed = row.execution_status === 'deployed' || row.execution_status === 'regression_detected';
              return (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                      {row.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-slate-700 max-w-[120px] truncate">
                    {row.site_url}
                  </td>
                  <td className="px-4 py-3 max-w-[200px] truncate text-xs text-slate-500">
                    <a href={row.url} target="_blank" rel="noreferrer" className="hover:underline hover:text-blue-600">
                      {row.url}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {row.issue_type.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.execution_status} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <RiskBadge score={row.risk_score} />
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <Link href={`/runs/${row.run_id}`} className="text-blue-600 hover:underline font-mono">
                      {row.run_id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {isBusy ? (
                      <span className="text-xs text-slate-400 animate-pulse">Saving…</span>
                    ) : (
                      <div className="flex gap-1 flex-wrap">
                        {isPending && (
                          <>
                            <button
                              onClick={() => updateStatus(row, 'deployed')}
                              className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => updateStatus(row, 'failed')}
                              className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {isDeployed && (
                          <button
                            onClick={() => updateStatus(row, 'rolled_back')}
                            className="px-2 py-1 text-xs rounded bg-slate-600 text-white hover:bg-slate-700 transition-colors"
                          >
                            Rollback
                          </button>
                        )}
                        {!isPending && !isDeployed && (
                          <span className="text-[10px] text-slate-300">—</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
