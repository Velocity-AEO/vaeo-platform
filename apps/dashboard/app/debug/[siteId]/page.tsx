'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DebugEvent {
  id:               string;
  timestamp:        string;
  session_id:       string;
  site_id:          string;
  event_type:       string;
  issue_type:       string;
  url:              string;
  reasoning:        string;
  confidence_score?: number;
  health_delta?:    number;
  duration_ms?:     number;
  before_html?:     string;
  after_html?:      string;
  metadata?:        Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000)  return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const EVENT_COLORS: Record<string, string> = {
  fix_applied:      'bg-green-100 text-green-800 border-green-200',
  fix_failed:       'bg-red-100 text-red-800 border-red-200',
  decision:         'bg-blue-100 text-blue-800 border-blue-200',
  confidence_check: 'bg-purple-100 text-purple-800 border-purple-200',
  learning_write:   'bg-amber-100 text-amber-800 border-amber-200',
  sandbox_run:      'bg-gray-100 text-gray-700 border-gray-200',
  approval_gate:    'bg-orange-100 text-orange-800 border-orange-200',
};

const FILTER_TYPES = [
  'all', 'fix_applied', 'fix_failed', 'learning_write', 'decision',
] as const;

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({ event }: { event: DebugEvent }) {
  const [expanded, setExpanded] = useState(false);
  const color = EVENT_COLORS[event.event_type] ?? 'bg-gray-100 text-gray-700 border-gray-200';

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-3">
          <span className="text-xs text-slate-400 whitespace-nowrap pt-0.5 min-w-[70px]">
            {relativeTime(event.timestamp)}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium whitespace-nowrap ${color}`}>
            {event.event_type}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-slate-700">{event.issue_type}</span>
              <span className="text-xs text-slate-400">{truncate(event.url, 50)}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{event.reasoning}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {event.confidence_score !== undefined && (
              <span className="text-xs text-slate-500 tabular-nums">
                {Math.round(event.confidence_score * 100)}% conf
              </span>
            )}
            {event.health_delta !== undefined && event.health_delta !== 0 && (
              <span className={`text-xs font-medium tabular-nums ${event.health_delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {event.health_delta > 0 ? '+' : ''}{event.health_delta}
              </span>
            )}
            {event.duration_ms !== undefined && (
              <span className="text-xs text-slate-400">{event.duration_ms}ms</span>
            )}
            <span className="text-slate-300 text-xs">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t border-slate-100 bg-slate-50 space-y-2">
          {/* Diff summary */}
          {event.metadata?.['change_summary'] && (
            <p className="text-xs text-slate-600 font-medium">
              Diff: {String(event.metadata['change_summary'])}
            </p>
          )}
          {/* Full JSON */}
          <pre className="text-[10px] bg-white border border-slate-200 rounded p-2 overflow-auto max-h-48 text-slate-700">
            {JSON.stringify(event, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DebugPage({ params }: { params: { siteId: string } }) {
  const [events, setEvents]         = useState<DebugEvent[]>([]);
  const [filter, setFilter]         = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading]       = useState(true);
  const siteId = params.siteId;

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/debug/${siteId}`);
      if (!res.ok) return;
      const data = await res.json() as { events: DebugEvent[] };
      if (Array.isArray(data.events)) {
        setEvents([...data.events].reverse()); // reverse-chronological
      }
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => { void fetchEvents(); }, 10_000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchEvents]);

  const filtered = filter === 'all'
    ? events
    : events.filter((e) => e.event_type === filter);

  const fixSuccesses  = events.filter((e) => e.event_type === 'fix_applied').length;
  const fixFailures   = events.filter((e) => e.event_type === 'fix_failed').length;
  const learningWrites = events.filter((e) => e.event_type === 'learning_write').length;
  const sessions      = new Set(events.map((e) => e.session_id)).size;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Debug Console</h1>
          <p className="text-sm text-slate-500 mt-0.5">Site: {siteId}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh (10s)
          </label>
          <button
            onClick={() => void fetchEvents()}
            className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Events',    value: events.length,   color: 'text-slate-700' },
          { label: 'Fix Successes',   value: fixSuccesses,    color: 'text-green-600' },
          { label: 'Fix Failures',    value: fixFailures,     color: 'text-red-600'   },
          { label: 'Learning Writes', value: learningWrites,  color: 'text-amber-600' },
          { label: 'Sessions',        value: sessions,        color: 'text-blue-600'  },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-center">
            <div className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500 font-medium">Filter:</span>
        {FILTER_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              filter === t
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Event feed */}
      <div className="space-y-2">
        {loading && (
          <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
        )}
        {!loading && filtered.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-lg px-5 py-10 text-center">
            <p className="text-slate-400 text-sm">
              No debug events yet. Run a fix to start collecting data.
            </p>
          </div>
        )}
        {filtered.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
