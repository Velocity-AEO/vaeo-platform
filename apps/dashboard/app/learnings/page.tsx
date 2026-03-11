'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LearningRow {
  id:               string;
  site_id?:         string;
  issue_type?:      string;
  url?:             string;
  fix_type?:        string;
  before_value?:    string;
  after_value?:     string;
  sandbox_status?:  string;
  approval_status?: string;
  reviewer_note?:   string;
  applied_at?:      string;
  created_at?:      string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(status?: string): string {
  switch (status) {
    case 'approved':        return 'bg-emerald-100 text-emerald-700';
    case 'rejected':        return 'bg-red-100 text-red-700';
    case 'pending':         return 'bg-amber-100 text-amber-700';
    case 'failed_sandbox':  return 'bg-red-100 text-red-600';
    case 'observation':     return 'bg-sky-100 text-sky-700';
    default:                return 'bg-slate-100 text-slate-600';
  }
}

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
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function tryParseJSON(val?: string): string {
  if (!val) return '';
  try {
    return JSON.stringify(JSON.parse(val), null, 2);
  } catch {
    return val;
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LearningsPage() {
  const [rows, setRows]         = useState<LearningRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [issueFilter, setIssueFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/learnings?limit=500');
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Distinct values for filter dropdowns
  const issueTypes = useMemo(() => {
    const set = new Set(rows.map((r) => r.issue_type).filter(Boolean));
    return [...set].sort();
  }, [rows]);

  const statuses = useMemo(() => {
    const set = new Set(rows.map((r) => r.approval_status).filter(Boolean));
    return [...set].sort();
  }, [rows]);

  // Client-side filtering
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (issueFilter && r.issue_type !== issueFilter) return false;
      if (statusFilter && r.approval_status !== statusFilter) return false;
      if (search && !(r.url ?? '').toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, issueFilter, statusFilter, search]);

  // ── Loading skeleton ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Learnings</h1>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="px-5 py-4 border-b border-slate-100 animate-pulse">
              <div className="h-3 bg-slate-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (rows.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Learnings</h1>
        <div className="text-center py-16 bg-white rounded-lg border border-slate-200">
          <p className="text-slate-500 text-lg">No learnings recorded yet</p>
        </div>
      </div>
    );
  }

  // ── Table ───────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Learnings</h1>
        <span className="text-sm text-slate-500">{filtered.length} of {rows.length}</span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search by URL..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 border border-slate-300 rounded text-sm w-64 focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <select
          value={issueFilter}
          onChange={(e) => setIssueFilter(e.target.value)}
          className="px-3 py-1.5 border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <option value="">All issue types</option>
          {issueTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {(search || issueFilter || statusFilter) && (
          <button
            onClick={() => { setSearch(''); setIssueFilter(''); setStatusFilter(''); }}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="hidden md:grid grid-cols-[100px_1fr_140px_100px_110px_110px] gap-2 px-5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <div>Date</div>
          <div>URL</div>
          <div>Issue Type</div>
          <div>Fix Type</div>
          <div>Sandbox</div>
          <div>Status</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-400 text-sm">
            No results match your filters
          </div>
        ) : (
          filtered.map((row) => (
            <div key={row.id}>
              {/* Row */}
              <button
                onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                className="w-full grid grid-cols-1 md:grid-cols-[100px_1fr_140px_100px_110px_110px] gap-2 px-5 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors text-left text-sm"
              >
                <div className="text-slate-500 text-xs">
                  {formatDate(row.created_at)}
                </div>
                <div className="font-mono text-xs text-slate-700 truncate">
                  {row.url ?? '—'}
                </div>
                <div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${issueColor(row.issue_type)}`}>
                    {row.issue_type ?? '—'}
                  </span>
                </div>
                <div className="text-xs text-slate-600">
                  {row.fix_type ?? '—'}
                </div>
                <div className="text-xs text-slate-600">
                  {row.sandbox_status ?? '—'}
                </div>
                <div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(row.approval_status)}`}>
                    {row.approval_status ?? '—'}
                  </span>
                </div>
              </button>

              {/* Expanded detail */}
              {expandedId === row.id && (
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">Before Value</div>
                      <pre className="bg-white border border-slate-200 rounded p-3 text-xs text-slate-700 whitespace-pre-wrap break-all max-h-48 overflow-auto">
                        {tryParseJSON(row.before_value) || '(empty)'}
                      </pre>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">After Value</div>
                      <pre className="bg-white border border-slate-200 rounded p-3 text-xs text-slate-700 whitespace-pre-wrap break-all max-h-48 overflow-auto">
                        {tryParseJSON(row.after_value) || '(empty)'}
                      </pre>
                    </div>
                  </div>
                  {row.reviewer_note && (
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">Reviewer Note</div>
                      <p className="text-sm text-slate-700">{row.reviewer_note}</p>
                    </div>
                  )}
                  <div className="text-xs text-slate-400">
                    ID: {row.id} &middot; Site: {row.site_id ?? '—'} &middot; Applied: {row.applied_at ? formatDate(row.applied_at) : '—'}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
