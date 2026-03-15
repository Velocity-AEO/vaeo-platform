'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────────────

interface HealthData {
  site_id:   string;
  site_url:  string;
  cms_type:  string;
  score:     { total: number; technical: number; content: number; schema: number; grade: string };
  issues_by_severity: { critical: number; major: number; minor: number };
  total_issues: number;
}

interface Fix {
  id:                string;
  issue_type:        string;
  url:               string;
  risk_score:        number;
  priority:          number;
  proposed_fix:      Record<string, unknown>;
  approval_required: boolean;
  execution_status:  string;
  reasoning_block:   Record<string, unknown> | null;
  created_at:        string;
}

type ActionState  = Record<string, 'idle' | 'loading' | 'done'>;
type RunState     = 'idle' | 'loading' | 'done' | 'error';

interface RunResult   { applied: number; failed: number; skipped: number }
interface CrawlResult { urls_crawled: number; issues_found: number; issues_written: number }

// ── Grade badge ──────────────────────────────────────────────────────────────

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-green-100 text-green-800 border-green-300',
  B: 'bg-blue-100 text-blue-800 border-blue-300',
  C: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  D: 'bg-orange-100 text-orange-800 border-orange-300',
  F: 'bg-red-100 text-red-800 border-red-300',
};

function GradeBadge({ grade }: { grade: string }) {
  const color = GRADE_COLORS[grade] ?? GRADE_COLORS.F;
  return (
    <span className={`inline-flex items-center justify-center w-12 h-12 rounded-xl border-2 text-2xl font-bold ${color}`}>
      {grade}
    </span>
  );
}

// ── Severity pill ────────────────────────────────────────────────────────────

function SeverityPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${color}`}>
      <span className="text-lg font-bold tabular-nums">{count}</span>
      <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
    </div>
  );
}

// ── Risk badge ───────────────────────────────────────────────────────────────

function RiskBadge({ score }: { score: number }) {
  const color =
    score >= 7 ? 'bg-red-100 text-red-700' :
    score >= 4 ? 'bg-yellow-100 text-yellow-700' :
                 'bg-green-100 text-green-700';
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${color}`}>
      {score}
    </span>
  );
}

// ── Issue type formatter ─────────────────────────────────────────────────────

function formatIssueType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/^Err /, 'Error: ')
    .replace(/^Meta /, 'Meta ')
    .replace(/^H1 /, 'H1 ')
    .replace(/^Img /, 'Image ');
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-64 bg-slate-200 rounded" />
      <div className="flex gap-4">
        <div className="h-24 w-40 bg-slate-200 rounded-xl" />
        <div className="h-24 flex-1 bg-slate-200 rounded-xl" />
      </div>
      <div className="h-64 bg-slate-200 rounded-xl" />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SiteDetailPage() {
  const params = useParams();
  const siteId = params.siteId as string;

  const [health, setHealth] = useState<HealthData | null>(null);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionState,  setActionState]  = useState<ActionState>({});
  const [runState,     setRunState]     = useState<RunState>('idle');
  const [runResult,    setRunResult]    = useState<RunResult | null>(null);
  const [runError,     setRunError]     = useState('');
  const [crawlState,   setCrawlState]   = useState<RunState>('idle');
  const [crawlResult,  setCrawlResult]  = useState<CrawlResult | null>(null);
  const [crawlError,   setCrawlError]   = useState('');

  const loadData = useCallback(async () => {
    try {
      const [healthRes, fixesRes] = await Promise.all([
        fetch(`/api/sites/${siteId}/health`),
        fetch(`/api/sites/${siteId}/fixes`),
      ]);

      if (!healthRes.ok) throw new Error(`Health API: ${healthRes.status}`);
      if (!fixesRes.ok) throw new Error(`Fixes API: ${fixesRes.status}`);

      const healthData = await healthRes.json();
      const fixesData = await fixesRes.json();

      setHealth(healthData);
      setFixes(fixesData.fixes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleRun() {
    setRunState('loading');
    setRunResult(null);
    setRunError('');
    try {
      const res = await fetch(`/api/sites/${siteId}/run`, { method: 'POST' });
      const data = await res.json() as RunResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Run failed (${res.status})`);
      setRunResult({ applied: data.applied, failed: data.failed, skipped: data.skipped });
      setRunState('done');
      // Refresh fixes list after a successful run
      if (data.applied > 0) setTimeout(() => loadData(), 800);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
      setRunState('error');
    }
  }

  async function handleCrawl() {
    setCrawlState('loading');
    setCrawlResult(null);
    setCrawlError('');
    try {
      const res = await fetch(`/api/sites/${siteId}/crawl`, { method: 'POST' });
      const data = await res.json() as CrawlResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Crawl failed (${res.status})`);
      setCrawlResult({ urls_crawled: data.urls_crawled, issues_found: data.issues_found, issues_written: data.issues_written });
      setCrawlState('done');
      // Refresh fixes list after crawl so newly discovered issues appear.
      setTimeout(() => loadData(), 800);
    } catch (err) {
      setCrawlError(err instanceof Error ? err.message : String(err));
      setCrawlState('error');
    }
  }

  async function handleAction(fixId: string, action: 'approve' | 'skip') {
    setActionState((prev) => ({ ...prev, [fixId]: 'loading' }));
    try {
      const res = await fetch(`/api/sites/${siteId}/fixes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fixId, action }),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setActionState((prev) => ({ ...prev, [fixId]: 'done' }));
      // Remove from list after brief delay
      setTimeout(() => {
        setFixes((prev) => prev.filter((f) => f.id !== fixId));
      }, 600);
    } catch {
      setActionState((prev) => ({ ...prev, [fixId]: 'idle' }));
    }
  }

  if (loading) {
    return <Skeleton />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        Failed to load site data: {error}
      </div>
    );
  }

  if (!health) return null;

  const { score } = health;

  return (
    <>
      {/* Breadcrumb */}
      <div className="text-xs text-slate-400 mb-4">
        <Link href="/sites" className="hover:text-slate-600 transition-colors">Sites</Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-600">{health.site_url}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{health.site_url}</h1>
          <p className="text-xs text-slate-400 mt-0.5 uppercase">{health.cms_type}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Run Crawl — discover new issues */}
          <button
            onClick={handleCrawl}
            disabled={crawlState === 'loading' || runState === 'loading'}
            className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {crawlState === 'loading' ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 1-9 9" />
                <path d="M3 12a9 9 0 0 1 9-9" />
                <path d="M21 3v4h-4" />
                <path d="M3 21v-4h4" />
              </svg>
            )}
            {crawlState === 'loading' ? 'Crawling...' : 'Run Crawl'}
          </button>

          {/* Run Pipeline — apply already-approved fixes */}
          <button
            onClick={handleRun}
            disabled={runState === 'loading' || crawlState === 'loading'}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {runState === 'loading' ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
            {runState === 'loading' ? 'Running...' : 'Run Pipeline'}
          </button>
        </div>
      </div>

      {/* Run result banner */}
      {runState === 'done' && runResult && (
        <div className="mb-5 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 flex items-center justify-between">
          <span>
            Pipeline complete — <strong>{runResult.applied}</strong> applied
            {runResult.failed > 0 && <>, <strong className="text-red-600">{runResult.failed}</strong> failed</>}
            {runResult.skipped > 0 && <>, {runResult.skipped} skipped</>}
          </span>
          <button onClick={() => setRunState('idle')} className="text-emerald-500 hover:text-emerald-700 text-xs ml-4">Dismiss</button>
        </div>
      )}
      {runState === 'error' && (
        <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>Run failed: {runError}</span>
          <button onClick={() => setRunState('idle')} className="text-red-400 hover:text-red-600 text-xs ml-4">Dismiss</button>
        </div>
      )}

      {/* Crawl result banners */}
      {crawlState === 'done' && crawlResult && (
        <div className="mb-5 rounded-lg bg-sky-50 border border-sky-200 px-4 py-3 text-sm text-sky-800 flex items-center justify-between">
          <span>
            Crawl complete — <strong>{crawlResult.urls_crawled}</strong> URLs crawled,{' '}
            <strong>{crawlResult.issues_written}</strong> new issues queued
            {crawlResult.issues_found !== crawlResult.issues_written && (
              <> ({crawlResult.issues_found} detected, {crawlResult.issues_found - crawlResult.issues_written} already tracked)</>
            )}
          </span>
          <button onClick={() => setCrawlState('idle')} className="text-sky-500 hover:text-sky-700 text-xs ml-4">Dismiss</button>
        </div>
      )}
      {crawlState === 'error' && (
        <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>Crawl failed: {crawlError}</span>
          <button onClick={() => setCrawlState('idle')} className="text-red-400 hover:text-red-600 text-xs ml-4">Dismiss</button>
        </div>
      )}

      {/* Health score card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-5xl font-bold tabular-nums text-slate-900">{score.total}</div>
              <div className="text-xs text-slate-400 mt-1">Health Score</div>
            </div>
            <GradeBadge grade={score.grade} />
          </div>

          <div className="w-px h-16 bg-slate-200 mx-2" />

          {/* Score breakdown */}
          <div className="flex gap-4 text-center">
            <div>
              <div className="text-lg font-semibold tabular-nums text-slate-700">{score.technical}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">Technical</div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums text-slate-700">{score.content}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">Content</div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums text-slate-700">{score.schema}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">Schema</div>
            </div>
          </div>

          <div className="w-px h-16 bg-slate-200 mx-2" />

          {/* Issue severity counts */}
          <div className="flex gap-3">
            <SeverityPill label="Critical" count={health.issues_by_severity.critical} color="bg-red-50 border-red-200 text-red-700" />
            <SeverityPill label="Major" count={health.issues_by_severity.major} color="bg-yellow-50 border-yellow-200 text-yellow-700" />
            <SeverityPill label="Minor" count={health.issues_by_severity.minor} color="bg-slate-50 border-slate-200 text-slate-600" />
          </div>
        </div>
      </div>

      {/* Pending fixes */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-700">
          Pending Fixes
          {fixes.length > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-400">({fixes.length})</span>
          )}
        </h2>
      </div>

      {fixes.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-8 text-center text-slate-400 text-sm">
          No pending fixes for this site.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Issue</th>
                <th className="px-5 py-3 font-medium">URL</th>
                <th className="px-5 py-3 font-medium text-center">Risk</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fixes.map((fix) => {
                const state = actionState[fix.id] ?? 'idle';
                const reasoning = fix.reasoning_block as {
                  detected?: { issue?: string };
                  proposed?: { change?: string };
                  confidence?: number;
                } | null;

                return (
                  <tr
                    key={fix.id}
                    className={`transition-all ${
                      state === 'done'
                        ? 'opacity-40 bg-slate-50'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-800">
                        {formatIssueType(fix.issue_type)}
                      </div>
                      {reasoning?.proposed?.change && (
                        <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">
                          {reasoning.proposed.change}
                        </div>
                      )}
                      {reasoning?.confidence != null && (
                        <span className="inline-flex items-center mt-1 text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                          {Math.round(reasoning.confidence * 100)}% confidence
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-slate-500 font-mono truncate block max-w-xs" title={fix.url}>
                        {truncateUrl(fix.url)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <RiskBadge score={fix.risk_score} />
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                        fix.execution_status === 'pending_approval'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-50 text-slate-600 border border-slate-200'
                      }`}>
                        {fix.execution_status === 'pending_approval' ? 'Needs Approval' : 'Queued'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {state === 'done' ? (
                        <span className="text-xs text-green-600 font-medium">Done</span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleAction(fix.id, 'approve')}
                            disabled={state === 'loading'}
                            className="inline-flex items-center gap-1 bg-slate-900 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {state === 'loading' ? (
                              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                                <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                              </svg>
                            ) : null}
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction(fix.id, 'skip')}
                            disabled={state === 'loading'}
                            className="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50 px-2 py-1.5 transition-colors"
                          >
                            Skip
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Truncate URL to pathname for compact display. */
function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname;
    if (path.length > 40) return path.slice(0, 37) + '...';
    return path;
  } catch {
    return url.length > 40 ? url.slice(0, 37) + '...' : url;
  }
}
