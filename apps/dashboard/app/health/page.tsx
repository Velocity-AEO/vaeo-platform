'use client';

import { useEffect, useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ComponentStatus = 'green' | 'yellow' | 'red';

interface HealthCheckResult {
  component:     string;
  status:        ComponentStatus;
  message:       string;
  latency_ms?:   number;
  last_success?: string;
  error?:        string;
  checked_at:    string;
}

interface SystemHealthReport {
  report_id:      string;
  site_id?:       string;
  run_id?:        string;
  overall_status: ComponentStatus;
  components:     HealthCheckResult[];
  green_count:    number;
  yellow_count:   number;
  red_count:      number;
  generated_at:   string;
  duration_ms:    number;
  summary:        string;
}

interface HealthNotification {
  notification_id:   string;
  channel:           string;
  severity:          ComponentStatus;
  subject:           string;
  body:              string;
  sent_at:           string;
  delivered:         boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const COMPONENT_LABELS: Record<string, string> = {
  crawler:          'Crawler',
  ai_generator:     'AI Generator',
  apply_engine:     'Apply Engine',
  validator:        'Validator',
  learning_center:  'Learning Center',
  gsc_sync:         'GSC Sync',
  job_queue:        'Job Queue',
  shopify_api:      'Shopify API',
  stripe_webhook:   'Stripe Webhook',
  schema_validator: 'Schema Validator',
  sandbox:          'Sandbox',
  tracer:           'Tracer',
};

function statusIcon(s: ComponentStatus): string {
  return s === 'green' ? '●' : s === 'yellow' ? '◑' : '●';
}

function statusColor(s: ComponentStatus): string {
  return s === 'green'
    ? 'text-green-600'
    : s === 'yellow'
    ? 'text-yellow-500'
    : 'text-red-600';
}

function statusBadge(s: ComponentStatus): string {
  return s === 'green'
    ? 'bg-green-50 text-green-700 border-green-200'
    : s === 'yellow'
    ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
    : 'bg-red-50 text-red-700 border-red-200';
}

function statusOrder(s: ComponentStatus): number {
  return s === 'red' ? 0 : s === 'yellow' ? 1 : 2;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)    return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function ms(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`;
}

// ── Overall banner ────────────────────────────────────────────────────────────

function OverallBanner({ status, summary }: { status: ComponentStatus; summary: string }) {
  const styles: Record<ComponentStatus, string> = {
    green:  'bg-green-700 text-white',
    yellow: 'bg-amber-500 text-white',
    red:    'bg-red-600 text-white',
  };
  const labels: Record<ComponentStatus, string> = {
    green:  'All Systems Operational',
    yellow: 'Attention Required',
    red:    'Systems Degraded — Action Required',
  };
  return (
    <div className={`rounded-xl px-6 py-4 ${styles[status]}`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{statusIcon(status)}</span>
        <div>
          <div className="text-lg font-semibold">{labels[status]}</div>
          <div className="text-sm opacity-80">{summary}</div>
        </div>
      </div>
    </div>
  );
}

// ── Component card ────────────────────────────────────────────────────────────

function ComponentCard({ result }: { result: HealthCheckResult }) {
  const label = COMPONENT_LABELS[result.component] ?? result.component.replace(/_/g, ' ');
  return (
    <div className={`bg-white border rounded-lg p-4 ${result.status === 'red' ? 'border-red-200' : result.status === 'yellow' ? 'border-yellow-200' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-lg leading-none ${statusColor(result.status)}`}>
            {statusIcon(result.status)}
          </span>
          <span className="text-sm font-medium text-slate-800">{label}</span>
        </div>
        <span className={`px-2 py-0.5 rounded border text-xs font-medium ${statusBadge(result.status)}`}>
          {result.status}
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-2">{result.message}</p>
      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
        {result.latency_ms !== undefined && (
          <span>{ms(result.latency_ms)}</span>
        )}
        {result.last_success && (
          <span>Last ok: {relativeTime(result.last_success)}</span>
        )}
        {result.error && (
          <span className="text-red-500 truncate">{result.error}</span>
        )}
      </div>
    </div>
  );
}

// ── Notification item ─────────────────────────────────────────────────────────

function NotificationItem({ n }: { n: HealthNotification }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
      <div className="flex items-start gap-3">
        <span className={`px-2 py-0.5 rounded border text-xs font-medium shrink-0 ${statusBadge(n.severity)}`}>
          {n.severity}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800">{n.subject}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {n.channel} · {relativeTime(n.sent_at)} ·{' '}
            {n.delivered ? <span className="text-green-600">delivered</span> : <span className="text-red-500">failed</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HealthPage() {
  const [report, setReport]             = useState<SystemHealthReport | null>(null);
  const [notifications, setNotifs]      = useState<HealthNotification[]>([]);
  const [loading, setLoading]           = useState(true);
  const [checking, setChecking]         = useState(false);
  const [autoRefresh, setAutoRefresh]   = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res  = await fetch('/api/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { report: SystemHealthReport; notifications: HealthNotification[] };
      setReport(data.report);
      setNotifs(data.notifications ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  const runManualCheck = useCallback(async () => {
    setChecking(true);
    try {
      const res  = await fetch('/api/health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { report: SystemHealthReport; notifications: HealthNotification[] };
      setReport(data.report);
      setNotifs(data.notifications ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void fetchHealth(); }, [fetchHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => { void fetchHealth(); }, 60_000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchHealth]);

  if (loading) {
    return <div className="max-w-5xl mx-auto py-12 text-center text-slate-400 text-sm">Loading health data…</div>;
  }

  if (error && !report) {
    return <div className="max-w-5xl mx-auto py-12 text-center text-red-500 text-sm">{error}</div>;
  }

  const sorted = [...(report?.components ?? [])].sort(
    (a, b) => statusOrder(a.status) - statusOrder(b.status),
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">System Health</h1>
          {report && (
            <p className="text-xs text-slate-400 mt-0.5">
              Last checked {relativeTime(report.generated_at)} · {report.duration_ms}ms · ID: {report.report_id.slice(0, 8)}…
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh (60s)
          </label>
          <button
            onClick={() => void runManualCheck()}
            disabled={checking}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white rounded transition-colors"
          >
            {checking ? 'Checking…' : 'Run Manual Check'}
          </button>
        </div>
      </div>

      {/* Overall banner */}
      {report && <OverallBanner status={report.overall_status} summary={report.summary} />}

      {/* Summary bar */}
      {report && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-green-600 font-medium">{report.green_count} healthy</span>
          <span className="text-slate-300">·</span>
          <span className="text-yellow-600 font-medium">{report.yellow_count} attention</span>
          <span className="text-slate-300">·</span>
          <span className="text-red-600 font-medium">{report.red_count} failing</span>
        </div>
      )}

      {/* Component grid */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Components</h2>
        {sorted.length === 0 ? (
          <p className="text-sm text-slate-400">No component data available.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sorted.map((r) => (
              <ComponentCard key={r.component} result={r} />
            ))}
          </div>
        )}
      </div>

      {/* Notifications panel */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Alerts</h2>
        {notifications.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg px-5 py-6 text-center text-sm text-slate-400">
            No alerts triggered.
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <NotificationItem key={n.notification_id} n={n} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
