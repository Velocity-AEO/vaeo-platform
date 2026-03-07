'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CommandCenterRow, CommandCenterStats } from '@/lib/types';
import CommandCenterTable from './QueueTable';

const EMPTY_STATS: CommandCenterStats = {
  pending_approval: 0,
  deployed:         0,
  rolled_back:      0,
  failed:           0,
};

const STAT_CARDS: { key: keyof CommandCenterStats; label: string; color: string }[] = [
  { key: 'pending_approval', label: 'Pending Approval', color: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
  { key: 'deployed',         label: 'Deployed',         color: 'bg-green-50 border-green-200 text-green-800'  },
  { key: 'rolled_back',      label: 'Rolled Back',      color: 'bg-slate-50 border-slate-200 text-slate-700'  },
  { key: 'failed',           label: 'Failed',           color: 'bg-red-50 border-red-200 text-red-800'       },
];

export default function CommandCenterPage() {
  const [stats, setStats]   = useState<CommandCenterStats>(EMPTY_STATS);
  const [rows,  setRows]    = useState<CommandCenterRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Fetch all action_queue rows with site_url joined
      const { data: queueRows } = await supabase
        .from('action_queue')
        .select('*')
        .in('execution_status', ['queued', 'deployed', 'failed', 'rolled_back'])
        .order('priority', { ascending: true })
        .order('risk_score', { ascending: false });

      if (!queueRows?.length) {
        setRows([]);
        setStats(EMPTY_STATS);
        setLoading(false);
        return;
      }

      // Enrich with site_url
      const allSiteIds = queueRows.map((r) => r.site_id as string).filter(Boolean);
      const siteIds = allSiteIds.filter((id, i) => allSiteIds.indexOf(id) === i);
      const { data: sites } = await supabase
        .from('sites')
        .select('site_id, site_url')
        .in('site_id', siteIds);

      const siteMap = new Map((sites ?? []).map((s) => [s.site_id as string, s.site_url as string]));

      const enriched: CommandCenterRow[] = queueRows.map((r) => ({
        ...r,
        site_url: siteMap.get(r.site_id as string) ?? (r.site_id as string),
      }));

      setRows(enriched);

      // Compute stats from fetched rows
      const s = { ...EMPTY_STATS };
      for (const r of enriched) {
        if (r.execution_status === 'queued' && r.approval_required) s.pending_approval++;
        else if (r.execution_status === 'deployed')    s.deployed++;
        else if (r.execution_status === 'rolled_back') s.rolled_back++;
        else if (r.execution_status === 'failed')      s.failed++;
      }
      setStats(s);
      setLoading(false);
    }

    load();
  }, []);

  function onStatusChange(id: string, newStatus: string) {
    setRows((prev) => {
      const updated = prev.map((r) =>
        r.id === id ? { ...r, execution_status: newStatus as CommandCenterRow['execution_status'] } : r
      );
      // Recompute stats
      const s = { ...EMPTY_STATS };
      for (const r of updated) {
        if (r.execution_status === 'queued' && r.approval_required) s.pending_approval++;
        else if (r.execution_status === 'deployed')    s.deployed++;
        else if (r.execution_status === 'rolled_back') s.rolled_back++;
        else if (r.execution_status === 'failed')      s.failed++;
      }
      setStats(s);
      return updated;
    });
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Command Center</h1>
        {loading && (
          <span className="text-xs text-slate-400 animate-pulse">Loading…</span>
        )}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {STAT_CARDS.map(({ key, label, color }) => (
          <div key={key} className={`border rounded-xl px-4 py-3 ${color}`}>
            <p className="text-xs font-medium opacity-70 mb-0.5">{label}</p>
            <p className="text-2xl font-bold tabular-nums">
              {loading ? '—' : stats[key]}
            </p>
          </div>
        ))}
      </div>

      <CommandCenterTable rows={rows} onStatusChange={onStatusChange} />
    </>
  );
}
