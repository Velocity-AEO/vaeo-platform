'use client';

import { useState } from 'react';

interface PhaseLogEntry {
  phase: string;
  entered_at: string;
  message: string;
}

interface LiveRunState {
  run_id: string;
  phase: string;
  pages_crawled: number;
  issues_detected: number;
  issues_triaged: number;
  fixes_applied: number;
  fixes_verified: number;
  fixes_failed: number;
  sandbox_passes: number;
  sandbox_failures: number;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  error?: string;
  phase_log: PhaseLogEntry[];
  dry_run: boolean;
}

interface LiveRunResult {
  state: LiveRunState;
  crawl: { total_discovered: number; crawl_duration_ms: number };
  issues: {
    total_issues: number;
    by_severity: Record<string, number>;
    by_fix_type: Record<string, number>;
    auto_fixable_count: number;
  };
  fixes: {
    success_count: number;
    failure_count: number;
    sandbox_pass_count: number;
    deploy_count: number;
  };
  health: { overall_status: string } | null;
}

const ALL_PHASES = [
  'idle', 'crawling', 'detecting', 'triaging',
  'generating', 'sandboxing', 'applying',
  'verifying', 'learning', 'complete',
];

export default function LiveRunPage() {
  const [domain, setDomain] = useState('');
  const [platform, setPlatform] = useState<'shopify' | 'wordpress'>('shopify');
  const [dryRun, setDryRun] = useState(false);
  const [maxPages, setMaxPages] = useState(50);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LiveRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startRun() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/live-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, platform, dry_run: dryRun, max_pages: maxPages }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setLoading(false);
    }
  }

  const phasesDone = result?.state.phase_log.map((e) => e.phase) ?? [];
  const currentPhase = result?.state.phase ?? 'idle';
  const isFailed = currentPhase === 'failed';

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold text-white">Live Production Run</h1>

      {/* Dry run banner */}
      {result?.state.dry_run && (
        <div className="bg-amber-900/40 border border-amber-500/50 text-amber-200 px-4 py-3 rounded-lg text-sm">
          DRY RUN MODE — Fixes were validated but not deployed to the live store.
        </div>
      )}

      {/* Target config */}
      <div className="bg-slate-800 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Run Configuration</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Domain</label>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full bg-slate-700 text-white rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as 'shopify' | 'wordpress')}
              className="w-full bg-slate-700 text-white rounded px-3 py-2 text-sm"
            >
              <option value="shopify">Shopify</option>
              <option value="wordpress">WordPress</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Max Pages: {maxPages}</label>
            <input
              type="range"
              min={10}
              max={100}
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="rounded"
              />
              Dry Run
            </label>
          </div>
        </div>
        <button
          onClick={startRun}
          disabled={loading || !domain}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white px-6 py-2 rounded font-medium text-sm transition-colors"
        >
          {loading ? 'Running...' : 'Start Live Run'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Phase timeline */}
      {result && (
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Phase Timeline</h2>
          <div className="space-y-2">
            {ALL_PHASES.map((phase) => {
              const logEntry = result.state.phase_log.find((e) => e.phase === phase);
              const isDone = phasesDone.includes(phase);
              const isCurrent = currentPhase === phase;
              const failedAt = isFailed && result.state.phase_log[result.state.phase_log.length - 1]?.phase === phase;

              return (
                <div key={phase} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                    ${failedAt ? 'bg-red-500 text-white' : isDone ? 'bg-green-500 text-white' : isCurrent ? 'bg-blue-500 text-white animate-pulse' : 'bg-slate-700 text-slate-400'}`}>
                    {failedAt ? '!' : isDone ? '\u2713' : '\u00B7'}
                  </div>
                  <span className={`text-sm font-mono ${isDone ? 'text-green-300' : isCurrent ? 'text-blue-300' : 'text-slate-500'}`}>
                    {phase}
                  </span>
                  {logEntry && (
                    <span className="text-xs text-slate-500">
                      {new Date(logEntry.entered_at).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live metrics */}
      {result && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {[
            { label: 'Pages Crawled', value: result.state.pages_crawled, color: 'text-blue-400' },
            { label: 'Issues Found', value: result.state.issues_detected, color: 'text-yellow-400' },
            { label: 'Fixes Applied', value: result.state.fixes_applied, color: 'text-green-400' },
            { label: 'Fixes Verified', value: result.state.fixes_verified, color: 'text-emerald-400' },
            { label: 'Sandbox Passes', value: result.state.sandbox_passes, color: 'text-cyan-400' },
            { label: 'Failed', value: result.state.fixes_failed, color: result.state.fixes_failed > 0 ? 'text-red-400' : 'text-slate-400' },
          ].map((m) => (
            <div key={m.label} className="bg-slate-800 rounded-lg p-4 text-center">
              <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
              <div className="text-xs text-slate-400 mt-1">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Results section */}
      {result && result.state.phase === 'complete' && (
        <div className="space-y-6">
          {/* Issues by severity */}
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-3">Issues by Severity</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="text-left py-2">Severity</th>
                  <th className="text-right py-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.issues.by_severity)
                  .sort(([a], [b]) => {
                    const order = { critical: 0, high: 1, medium: 2, low: 3 };
                    return (order[a as keyof typeof order] ?? 4) - (order[b as keyof typeof order] ?? 4);
                  })
                  .map(([sev, count]) => (
                    <tr key={sev} className="border-b border-slate-700/50">
                      <td className="py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium
                          ${sev === 'critical' ? 'bg-red-500/20 text-red-300' :
                            sev === 'high' ? 'bg-orange-500/20 text-orange-300' :
                            sev === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                            'bg-slate-500/20 text-slate-300'}`}>
                          {sev}
                        </span>
                      </td>
                      <td className="text-right text-white py-2">{count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Fixes by type */}
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-3">Issues by Fix Type</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="text-left py-2">Fix Type</th>
                  <th className="text-right py-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.issues.by_fix_type).map(([type, count]) => (
                  <tr key={type} className="border-b border-slate-700/50">
                    <td className="py-2 text-white font-mono text-xs">{type}</td>
                    <td className="text-right text-white py-2">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Health + duration */}
          <div className="flex gap-4">
            {result.health && (
              <div className="bg-slate-800 rounded-lg p-4 flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  result.health.overall_status === 'green' ? 'bg-green-500' :
                  result.health.overall_status === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                <span className="text-sm text-white">System Health: {result.health.overall_status}</span>
              </div>
            )}
            {result.state.duration_ms !== undefined && (
              <div className="bg-slate-800 rounded-lg p-4 text-sm text-slate-300">
                Duration: {(result.state.duration_ms / 1000).toFixed(1)}s
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
