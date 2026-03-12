'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApprovalItem {
  id:               string;
  site_id?:         string;
  learning_id?:     string;
  issue_type?:      string;
  url?:             string;
  before_value?:    string;
  proposed_value?:  string;
  sandbox_result?:  Record<string, unknown>;
  status:           string;
  reviewer_note?:   string;
  reviewed_at?:     string;
  created_at?:      string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function issueColor(type?: string): string {
  switch (type?.toUpperCase()) {
    case 'SCHEMA_MISSING':         return 'bg-purple-100 text-purple-700';
    case 'META_TITLE_MISSING':     return 'bg-amber-100  text-amber-700';
    case 'META_DESC_MISSING':      return 'bg-orange-100 text-orange-700';
    case 'IMG_DIMENSIONS_MISSING': return 'bg-blue-100   text-blue-700';
    default:                       return 'bg-slate-100  text-slate-600';
  }
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isAutoApproved(item: ApprovalItem): boolean {
  return (
    item.status === 'approved' &&
    typeof item.reviewer_note === 'string' &&
    item.reviewer_note.includes('auto_approved=true')
  );
}

function extractConfidence(item: ApprovalItem): number | null {
  const match = item.reviewer_note?.match(/confidence=([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-5 py-3 rounded-lg shadow-lg text-sm z-50">
      {message}
    </div>
  );
}

// ── DiffPanel ─────────────────────────────────────────────────────────────────

function DiffPanel({ before, after }: { before?: string; after?: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
      <div>
        <div className="text-xs font-medium text-slate-500 mb-1">Before</div>
        <pre className="bg-red-50 border border-red-200 rounded p-3 text-xs text-slate-700 whitespace-pre-wrap break-all max-h-48 overflow-auto">
          {before || '(empty)'}
        </pre>
      </div>
      <div>
        <div className="text-xs font-medium text-slate-500 mb-1">Proposed</div>
        <pre className="bg-green-50 border border-green-200 rounded p-3 text-xs text-slate-700 whitespace-pre-wrap break-all max-h-48 overflow-auto">
          {after || '(empty)'}
        </pre>
      </div>
    </div>
  );
}

// ── AutoBadge ─────────────────────────────────────────────────────────────────

function AutoBadge() {
  return (
    <span
      title="Auto-approved by confidence engine"
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300"
    >
      AUTO
    </span>
  );
}

// ── ConfidenceBar ─────────────────────────────────────────────────────────────

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct   = Math.round(confidence * 100);
  const color = pct >= 85 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <div className="h-1.5 w-24 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-slate-500">{pct}% confidence</span>
    </div>
  );
}

// ── AutoApprovalToggle ────────────────────────────────────────────────────────

function AutoApprovalToggle({
  enabled,
  onToggle,
}: {
  enabled:  boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">Auto-approve eligible fixes</span>
      <button
        onClick={() => onToggle(!enabled)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          enabled ? 'bg-emerald-500' : 'bg-slate-300'
        }`}
        aria-label={enabled ? 'Disable auto-approval' : 'Enable auto-approval'}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const [items, setItems]             = useState<ApprovalItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [acting, setActing]           = useState<string | null>(null);
  const [toast, setToast]             = useState<string | null>(null);
  const [notes, setNotes]             = useState<Record<string, string>>({});
  const [autoEnabled, setAutoEnabled] = useState(false);

  const allItems       = items;
  const pendingItems   = allItems.filter((i) => i.status === 'pending');
  const autoItems      = allItems.filter(isAutoApproved);
  const autoCount      = autoItems.length;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/approvals');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAction(item: ApprovalItem, action: 'approve' | 'reject') {
    setActing(item.id);
    try {
      const res = await fetch(`/api/approvals/${item.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: notes[item.id] ?? '', learning_id: item.learning_id }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setToast(action === 'approve' ? 'Item approved' : 'Item rejected');
      }
    } catch { /* empty */ }
    setActing(null);
  }

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Approvals</h1>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 p-5 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-1/3 mb-3" />
              <div className="h-3 bg-slate-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Empty ───────────────────────────────────────────────────────────────────

  if (pendingItems.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Approvals</h1>
        <div className="text-center py-16 bg-white rounded-lg border border-slate-200">
          <div className="text-4xl mb-3">&#10003;</div>
          <p className="text-slate-500 text-lg">No items pending review</p>
          {autoCount > 0 && (
            <p className="text-xs text-slate-400 mt-2">{autoCount} item{autoCount !== 1 ? 's' : ''} were auto-approved</p>
          )}
        </div>
      </div>
    );
  }

  // ── List ────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Approvals</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-slate-500">{pendingItems.length} pending</span>
            {autoCount > 0 && (
              <span className="text-xs text-emerald-600 font-medium">
                {autoCount} auto-approved
              </span>
            )}
          </div>
        </div>
        <AutoApprovalToggle enabled={autoEnabled} onToggle={setAutoEnabled} />
      </div>

      {autoEnabled && (
        <div className="mb-4 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
          Auto-approval is enabled. High-confidence fixes will be approved automatically on next run.
        </div>
      )}

      {/* Item list */}
      <div className="space-y-4">
        {pendingItems.map((item) => {
          const autoBadge  = isAutoApproved(item);
          const confidence = extractConfidence(item);
          return (
            <div key={item.id} className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
              {/* Header row */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${issueColor(item.issue_type)}`}>
                    {item.issue_type ?? 'UNKNOWN'}
                  </span>
                  {autoBadge && <AutoBadge />}
                  <span className="text-sm text-slate-700 font-mono break-all">
                    {item.url ?? '—'}
                  </span>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {formatDate(item.created_at)}
                </span>
              </div>

              {/* Confidence score */}
              {confidence !== null && <ConfidenceBar confidence={confidence} />}

              {/* Diff */}
              <DiffPanel before={item.before_value} after={item.proposed_value} />

              {/* Actions */}
              <div className="flex items-center gap-3 mt-4 flex-wrap">
                <button
                  onClick={() => handleAction(item, 'approve')}
                  disabled={acting === item.id}
                  className="px-4 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {acting === item.id ? 'Saving...' : 'Approve'}
                </button>
                <button
                  onClick={() => handleAction(item, 'reject')}
                  disabled={acting === item.id}
                  className="px-4 py-1.5 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  Reject
                </button>
                <input
                  type="text"
                  placeholder="Add a note (optional)"
                  value={notes[item.id] ?? ''}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  className="flex-1 min-w-[200px] px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
            </div>
          );
        })}
      </div>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
