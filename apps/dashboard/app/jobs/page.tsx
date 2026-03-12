'use client';

import { useEffect, useState, useCallback } from 'react';
import UpgradePrompt from '@/components/UpgradePrompt';

// ── Types ────────────────────────────────────────────────────────────────────

interface JobSummary {
  queued:  number;
  running: number;
  done:    number;
  failed:  number;
}

interface JobRow {
  id:             string;
  site_id:        string;
  priority:       number | string;
  status:         string;
  created_at?:    string;
  started_at?:    string;
  completed_at?:  string;
  pages_crawled?: number;
  issues_found?:  number;
  error?:         string;
}

interface JobStatusResponse {
  queue:   JobRow[];
  running: JobRow[];
  recent:  JobRow[];
  summary: JobSummary;
}

// ── Constants ────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 10_000;
const TENANT_ID = 'default'; // TODO: pull from auth context

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  '1':      { label: 'High',   color: 'bg-red-100 text-red-800 border-red-200' },
  'high':   { label: 'High',   color: 'bg-red-100 text-red-800 border-red-200' },
  '5':      { label: 'Normal', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  'normal': { label: 'Normal', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  '10':     { label: 'Low',    color: 'bg-slate-100 text-slate-600 border-slate-200' },
  'low':    { label: 'Low',    color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  done:    'bg-green-100 text-green-800 border-green-200',
  failed:  'bg-red-100 text-red-800 border-red-200',
  queued:  'bg-slate-100 text-slate-600 border-slate-200',
};

const SUMMARY_CARDS: { key: keyof JobSummary; label: string; color: string }[] = [
  { key: 'queued',  label: 'Queued',  color: 'bg-slate-50 border-slate-200 text-slate-700' },
  { key: 'running', label: 'Running', color: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
  { key: 'done',    label: 'Done',    color: 'bg-green-50 border-green-200 text-green-800' },
  { key: 'failed',  label: 'Failed',  color: 'bg-red-50 border-red-200 text-red-800' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function priorityBadge(p: number | string) {
  const info = PRIORITY_LABELS[String(p)] ?? PRIORITY_LABELS['normal']!;
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${info.color}`}>
      {info.label}
    </span>
  );
}

function statusBadge(status: string) {
  const color = STATUS_COLORS[status] ?? STATUS_COLORS['queued']!;
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${color}`}>
      {status}
    </span>
  );
}

function timeAgo(iso?: string): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

function siteDomain(siteId: string): string {
  // Show last segment of site_id or the full id
  return siteId.length > 20 ? `...${siteId.slice(-12)}` : siteId;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const [data,       setData]       = useState<JobStatusResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [countdown,  setCountdown]  = useState(REFRESH_INTERVAL / 1000);
  const [cancelling, setCancelling] = useState(false);
  const [gated,      setGated]      = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/status?tenant_id=${TENANT_ID}&limit=20`);
      if (res.status === 403) {
        setGated(true);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = await res.json() as JobStatusResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      fetchStatus();
      setCountdown(REFRESH_INTERVAL / 1000);
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : REFRESH_INTERVAL / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function handleCancelAll() {
    if (!confirm('Cancel all queued jobs? Running jobs will not be affected.')) return;
    setCancelling(true);
    try {
      const res = await fetch('/api/jobs/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: TENANT_ID }),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch { /* non-fatal */ }
    setCancelling(false);
  }

  const summary = data?.summary ?? { queued: 0, running: 0, done: 0, failed: 0 };

  if (gated) {
    return (
      <div className="mx-auto max-w-screen-xl px-6 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Job Queue</h1>
        <UpgradePrompt
          feature="Multi-site job orchestration"
          current_plan="Starter"
          required_plan="Agency"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-xl px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Job Queue</h1>
          <p className="text-sm text-slate-500 mt-1">
            Multi-site crawl orchestration and status
          </p>
        </div>
        <span className="text-xs text-slate-400">
          Refreshing in {countdown}s...
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {SUMMARY_CARDS.map((card) => (
          <div
            key={card.key}
            className={`border rounded-lg px-4 py-3 ${card.color}`}
          >
            <div className="text-2xl font-bold">{summary[card.key]}</div>
            <div className="text-xs font-medium mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Active (running) jobs */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Active Jobs</h2>
          <span className="text-xs text-slate-400">{data?.running.length ?? 0} running</span>
        </div>
        {(!data?.running.length) ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">No active jobs</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2">Site</th>
                <th className="px-4 py-2">Priority</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Pages</th>
                <th className="px-4 py-2">Issues</th>
                <th className="px-4 py-2">Started</th>
              </tr>
            </thead>
            <tbody>
              {data.running.map((job) => (
                <tr key={job.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">{siteDomain(job.site_id)}</td>
                  <td className="px-4 py-2">{priorityBadge(job.priority)}</td>
                  <td className="px-4 py-2">{statusBadge(job.status)}</td>
                  <td className="px-4 py-2">{job.pages_crawled ?? '—'}</td>
                  <td className="px-4 py-2">{job.issues_found ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-400">{timeAgo(job.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Queue */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Queue</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{data?.queue.length ?? 0} queued</span>
            {(summary.queued > 0) && (
              <button
                onClick={handleCancelAll}
                disabled={cancelling}
                className="text-xs px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                {cancelling ? 'Cancelling...' : 'Cancel All'}
              </button>
            )}
          </div>
        </div>
        {(!data?.queue.length) ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">No jobs in queue</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Site</th>
                <th className="px-4 py-2">Priority</th>
                <th className="px-4 py-2">Enqueued</th>
              </tr>
            </thead>
            <tbody>
              {data.queue.map((job, i) => (
                <tr key={job.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2 font-mono text-xs">{siteDomain(job.site_id)}</td>
                  <td className="px-4 py-2">{priorityBadge(job.priority)}</td>
                  <td className="px-4 py-2 text-slate-400">{timeAgo(job.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent completed */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">Recent</h2>
        </div>
        {(!data?.recent.length) ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">No recent jobs</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2">Site</th>
                <th className="px-4 py-2">Priority</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Pages</th>
                <th className="px-4 py-2">Issues</th>
                <th className="px-4 py-2">Completed</th>
                <th className="px-4 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((job) => (
                <tr key={job.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">{siteDomain(job.site_id)}</td>
                  <td className="px-4 py-2">{priorityBadge(job.priority)}</td>
                  <td className="px-4 py-2">{statusBadge(job.status)}</td>
                  <td className="px-4 py-2">{job.pages_crawled ?? '—'}</td>
                  <td className="px-4 py-2">{job.issues_found ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-400">{timeAgo(job.completed_at)}</td>
                  <td className="px-4 py-2 text-xs text-red-500 truncate max-w-[200px]">{job.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {loading && !data && (
        <div className="text-center py-12 text-slate-400 text-sm">Loading job status...</div>
      )}
    </div>
  );
}
