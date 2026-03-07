'use client';

import { useState } from 'react';
import type { ActionQueueRow } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';

// ── Helpers ───────────────────────────────────────────────────────────────────

function issueBadgeClass(issueType: string): string {
  if (issueType.startsWith('ERR_'))    return 'bg-red-100 text-red-800';
  if (issueType.startsWith('META_'))   return 'bg-orange-100 text-orange-800';
  if (issueType.startsWith('IMG_'))    return 'bg-blue-100 text-blue-800';
  if (issueType.startsWith('SCHEMA_')) return 'bg-purple-100 text-purple-800';
  if (issueType.startsWith('H1_') || issueType.startsWith('H2_'))
    return 'bg-yellow-100 text-yellow-800';
  return 'bg-slate-100 text-slate-700';
}

function riskClass(score: number): string {
  if (score <= 3) return 'text-green-600 font-semibold';
  if (score <= 6) return 'text-orange-500 font-semibold';
  return 'text-red-600 font-semibold';
}

function truncateUrl(url: string, max = 50): string {
  if (url.length <= max) return url;
  // Show host + start of path, then ellipsis
  try {
    const u = new URL(url);
    const path = u.pathname + (u.search || '');
    const base = u.host;
    const budget = max - base.length - 1;
    const truncPath = budget > 4 ? path.slice(0, budget) + '…' : '…';
    return base + truncPath;
  } catch {
    return url.slice(0, max) + '…';
  }
}

function fixPreview(fix: Record<string, unknown>): string {
  const priority = ['new_title', 'new_alt', 'new_description', 'suggested_target', 'action'];
  for (const k of priority) {
    const v = fix[k];
    if (v && typeof v === 'string') {
      const label = k.replace(/_/g, ' ');
      const snippet = v.length > 55 ? v.slice(0, 55) + '…' : v;
      return `${label}: ${snippet}`;
    }
  }
  // Fallback: first string value in object
  for (const [k, v] of Object.entries(fix)) {
    if (typeof v === 'string' && v && !['category', 'url'].includes(k)) {
      return `${k.replace(/_/g, ' ')}: ${v.slice(0, 55)}`;
    }
  }
  return '—';
}

// ── Filter tabs ───────────────────────────────────────────────────────────────

const FILTERS = [
  { key: 'all',              label: 'All' },
  { key: 'deployed',         label: 'Deployed' },
  { key: 'pending_approval', label: 'Pending' },
  { key: 'failed',           label: 'Failed' },
] as const;

type FilterKey = typeof FILTERS[number]['key'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ActionQueueTable({
  actions,
}: {
  actions:  ActionQueueRow[];
  tenantId: string;   // kept for future ActionButtons wiring
}) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const displayed =
    filter === 'all'
      ? actions
      : actions.filter((r) => r.execution_status === filter);

  return (
    <>
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map(({ key, label }) => {
          const count = key === 'all' ? actions.length : actions.filter((r) => r.execution_status === key).length;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === key
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
              <span className={`ml-1.5 text-[10px] ${filter === key ? 'opacity-70' : 'opacity-60'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Issue Type</th>
              <th className="px-4 py-3 font-medium">URL</th>
              <th className="px-4 py-3 font-medium text-center">Risk</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Proposed Fix</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayed.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-xs">
                  No items match this filter.
                </td>
              </tr>
            )}
            {displayed.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                {/* Issue Type badge */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${issueBadgeClass(row.issue_type)}`}
                  >
                    {row.issue_type}
                  </span>
                </td>

                {/* URL — truncated, full on hover */}
                <td className="px-4 py-3 max-w-[240px]">
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-slate-600 hover:underline hover:text-blue-600 block truncate"
                    title={row.url}
                  >
                    {truncateUrl(row.url)}
                  </a>
                </td>

                {/* Risk — colored number */}
                <td className="px-4 py-3 text-center">
                  <span className={`text-sm tabular-nums ${riskClass(row.risk_score)}`}>
                    {row.risk_score}
                  </span>
                </td>

                {/* Status badge */}
                <td className="px-4 py-3">
                  <StatusBadge status={row.execution_status} size="sm" />
                </td>

                {/* Proposed fix — key field preview */}
                <td className="px-4 py-3 max-w-[240px]">
                  <span
                    className="text-xs text-slate-500 block truncate"
                    title={JSON.stringify(row.proposed_fix, null, 2)}
                  >
                    {fixPreview(row.proposed_fix)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Row count footer */}
      {displayed.length > 0 && (
        <p className="mt-2 text-xs text-slate-400 text-right">
          {displayed.length} {displayed.length === 1 ? 'item' : 'items'}
          {filter !== 'all' && ` · ${actions.length} total`}
        </p>
      )}
    </>
  );
}
