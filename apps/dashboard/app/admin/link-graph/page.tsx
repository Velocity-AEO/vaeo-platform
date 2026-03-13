'use client';

import { useEffect, useState, useCallback } from 'react';

// ── Inline types (avoid bundler issues) ─────────────────────────────────────

interface SiteGraphStatus {
  site_id: string;
  domain: string;
  page_count: number;
  internal_link_count: number;
  external_link_count: number;
  orphaned_count: number;
  dead_end_count: number;
  redirect_chain_count: number;
  canonical_conflict_count: number;
  link_limit_violation_count: number;
  equity_leak_count: number;
  last_built_at: string | null;
  build_age_hours: number | null;
  health_grade: string;
}

interface PlatformGraphStatus {
  sites: SiteGraphStatus[];
  total_sites: number;
  sites_with_graph: number;
  sites_needing_rebuild: number;
  total_pages: number;
  total_internal_links: number;
  total_orphaned: number;
  total_canonical_conflicts: number;
  total_link_limit_violations: number;
  avg_health_grade: string;
  worst_sites: Array<{ site_id: string; domain: string; health_grade: string }>;
  stale_sites: Array<{ site_id: string; domain: string; build_age_hours: number }>;
}

interface IntegrityIssue {
  type: string;
  severity: string;
  description: string;
  affected_urls: string[];
  count: number;
}

interface IntegrityResult {
  site_id: string;
  is_healthy: boolean;
  total_issues: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  issues: IntegrityIssue[];
  pages_checked: number;
  links_checked: number;
}

// ── Display helpers (inlined) ───────────────────────────────────────────────

function getGradeBg(grade: string): string {
  const map: Record<string, string> = {
    A: 'bg-green-100 text-green-800',
    B: 'bg-blue-100 text-blue-800',
    C: 'bg-yellow-100 text-yellow-800',
    D: 'bg-orange-100 text-orange-800',
    F: 'bg-red-100 text-red-800',
  };
  return map[grade] ?? 'bg-slate-100 text-slate-800';
}

function formatBuildAge(hours: number | null): string {
  if (hours === null) return 'Never';
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getBuildAgeColor(hours: number | null): string {
  if (hours === null) return 'text-red-600';
  if (hours <= 24) return 'text-green-600';
  if (hours <= 48) return 'text-yellow-600';
  return 'text-red-600';
}

function getSeverityBg(severity: string): string {
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    warning: 'bg-yellow-100 text-yellow-800',
    info: 'bg-blue-100 text-blue-800',
  };
  return map[severity] ?? 'bg-slate-100 text-slate-800';
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Tabs ────────────────────────────────────────────────────────────────────

type TabKey = 'overview' | 'sites' | 'integrity' | 'rebuild';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'sites', label: 'All Sites' },
  { key: 'integrity', label: 'Integrity Check' },
  { key: 'rebuild', label: 'Rebuild' },
];

export default function AdminLinkGraphPage() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [status, setStatus] = useState<PlatformGraphStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Integrity state
  const [integrityTarget, setIntegrityTarget] = useState('');
  const [integrityResult, setIntegrityResult] = useState<IntegrityResult | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);

  // Rebuild state
  const [rebuildScope, setRebuildScope] = useState<'single' | 'stale' | 'all'>('stale');
  const [rebuildSiteId, setRebuildSiteId] = useState('');
  const [rebuildReason, setRebuildReason] = useState('');
  const [rebuildResult, setRebuildResult] = useState<{ success: boolean; queued_count: number } | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const loadStatus = useCallback(() => {
    fetch('/api/admin/link-graph/status')
      .then((r) => r.json())
      .then((data) => { setStatus(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function runIntegrityCheck() {
    if (!integrityTarget) return;
    setIntegrityLoading(true);
    setIntegrityResult(null);
    try {
      const res = await fetch(`/api/admin/link-graph/integrity?site_id=${encodeURIComponent(integrityTarget)}`);
      if (res.ok) setIntegrityResult(await res.json());
    } catch { /* non-fatal */ }
    setIntegrityLoading(false);
  }

  async function triggerRebuild() {
    setRebuilding(true);
    setRebuildResult(null);
    try {
      const res = await fetch('/api/admin/link-graph/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: rebuildScope,
          site_id: rebuildScope === 'single' ? rebuildSiteId : undefined,
          reason: rebuildReason || 'manual admin rebuild',
        }),
      });
      if (res.ok) setRebuildResult(await res.json());
    } catch { /* non-fatal */ }
    setRebuilding(false);
  }

  if (loading) {
    return (
      <div className="px-4 py-6 md:px-6 w-full max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Link Graph Admin</h1>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-200 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-6 w-full max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Link Graph Admin</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && status && (
        <div>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold">{status.total_sites}</div>
              <div className="text-sm text-gray-500">Total Sites</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold">{formatNumber(status.total_pages)}</div>
              <div className="text-sm text-gray-500">Total Pages</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold">{formatNumber(status.total_internal_links)}</div>
              <div className="text-sm text-gray-500">Internal Links</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className={`text-2xl font-bold ${getGradeBg(status.avg_health_grade)} inline-block px-2 rounded`}>
                {status.avg_health_grade}
              </div>
              <div className="text-sm text-gray-500 mt-1">Avg Health Grade</div>
            </div>
          </div>

          {/* Issue summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-orange-600">{status.total_orphaned}</div>
              <div className="text-sm text-gray-500">Orphaned Pages</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-600">{status.total_canonical_conflicts}</div>
              <div className="text-sm text-gray-500">Canonical Conflicts</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-600">{status.total_link_limit_violations}</div>
              <div className="text-sm text-gray-500">Link Limit Violations</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-600">{status.sites_needing_rebuild}</div>
              <div className="text-sm text-gray-500">Sites Need Rebuild</div>
            </div>
          </div>

          {/* Worst sites */}
          {status.worst_sites.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
              <h2 className="text-lg font-semibold mb-3">Sites Needing Attention</h2>
              <div className="space-y-2">
                {status.worst_sites.map((s) => (
                  <div key={s.site_id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-sm font-medium">{s.domain}</span>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${getGradeBg(s.health_grade)}`}>
                      Grade {s.health_grade}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stale sites */}
          {status.stale_sites.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-yellow-800 mb-3">Stale Graph Data</h2>
              <div className="space-y-2">
                {status.stale_sites.map((s) => (
                  <div key={s.site_id} className="flex items-center justify-between py-2 border-b border-yellow-100 last:border-0">
                    <span className="text-sm font-medium text-yellow-900">{s.domain}</span>
                    <span className="text-xs text-yellow-700">
                      Built {formatBuildAge(s.build_age_hours)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sites Tab */}
      {tab === 'sites' && status && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 pr-4 font-medium">Domain</th>
                <th className="pb-2 pr-4 font-medium">Pages</th>
                <th className="pb-2 pr-4 font-medium">Links</th>
                <th className="pb-2 pr-4 font-medium">Orphaned</th>
                <th className="pb-2 pr-4 font-medium">Canonical</th>
                <th className="pb-2 pr-4 font-medium">Limit</th>
                <th className="pb-2 pr-4 font-medium">Last Built</th>
                <th className="pb-2 font-medium">Grade</th>
              </tr>
            </thead>
            <tbody>
              {status.sites.map((site) => (
                <tr key={site.site_id} className="border-b border-gray-100">
                  <td className="py-3 pr-4 font-medium">{site.domain}</td>
                  <td className="py-3 pr-4">{site.page_count}</td>
                  <td className="py-3 pr-4">{site.internal_link_count}</td>
                  <td className="py-3 pr-4">{site.orphaned_count > 0 ? <span className="text-orange-600">{site.orphaned_count}</span> : '0'}</td>
                  <td className="py-3 pr-4">{site.canonical_conflict_count > 0 ? <span className="text-red-600">{site.canonical_conflict_count}</span> : '0'}</td>
                  <td className="py-3 pr-4">{site.link_limit_violation_count > 0 ? <span className="text-yellow-600">{site.link_limit_violation_count}</span> : '0'}</td>
                  <td className={`py-3 pr-4 ${getBuildAgeColor(site.build_age_hours)}`}>{formatBuildAge(site.build_age_hours)}</td>
                  <td className="py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${getGradeBg(site.health_grade)}`}>
                      {site.health_grade}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Integrity Tab */}
      {tab === 'integrity' && (
        <div>
          <div className="flex gap-3 mb-6">
            <select
              value={integrityTarget}
              onChange={(e) => setIntegrityTarget(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select a site...</option>
              {status?.sites.map((s) => (
                <option key={s.site_id} value={s.site_id}>{s.domain}</option>
              ))}
            </select>
            <button
              onClick={runIntegrityCheck}
              disabled={!integrityTarget || integrityLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {integrityLoading ? 'Checking...' : 'Run Check'}
            </button>
          </div>

          {integrityResult && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className={`text-sm font-medium px-3 py-1 rounded-full ${integrityResult.is_healthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {integrityResult.is_healthy ? 'Healthy' : `${integrityResult.total_issues} Issue(s)`}
                </span>
                <span className="text-sm text-gray-500">
                  {integrityResult.pages_checked} pages, {integrityResult.links_checked} links checked
                </span>
              </div>

              {integrityResult.issues.length > 0 && (
                <div className="space-y-3">
                  {integrityResult.issues.map((issue, i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${getSeverityBg(issue.severity)}`}>
                          {issue.severity}
                        </span>
                        <span className="text-sm font-medium">{issue.description}</span>
                      </div>
                      {issue.affected_urls.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {issue.affected_urls.slice(0, 5).map((url, j) => (
                            <div key={j} className="text-xs text-gray-500 font-mono truncate">{url}</div>
                          ))}
                          {issue.affected_urls.length > 5 && (
                            <div className="text-xs text-gray-400">+{issue.affected_urls.length - 5} more</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Rebuild Tab */}
      {tab === 'rebuild' && (
        <div className="max-w-lg">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Trigger Graph Rebuild</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                <select
                  value={rebuildScope}
                  onChange={(e) => setRebuildScope(e.target.value as 'single' | 'stale' | 'all')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="single">Single Site</option>
                  <option value="stale">All Stale Sites</option>
                  <option value="all">All Sites</option>
                </select>
              </div>

              {rebuildScope === 'single' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Site</label>
                  <select
                    value={rebuildSiteId}
                    onChange={(e) => setRebuildSiteId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Select a site...</option>
                    {status?.sites.map((s) => (
                      <option key={s.site_id} value={s.site_id}>{s.domain}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <input
                  type="text"
                  value={rebuildReason}
                  onChange={(e) => setRebuildReason(e.target.value)}
                  placeholder="manual admin rebuild"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <button
                onClick={triggerRebuild}
                disabled={rebuilding || (rebuildScope === 'single' && !rebuildSiteId)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {rebuilding ? 'Queuing...' : 'Trigger Rebuild'}
              </button>
            </div>

            {rebuildResult && (
              <div className={`mt-4 p-3 rounded-lg text-sm ${rebuildResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {rebuildResult.success
                  ? `Queued ${rebuildResult.queued_count} site(s) for rebuild.`
                  : 'Rebuild failed. Check server logs.'}
              </div>
            )}
          </div>

          {rebuildScope === 'all' && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              Rebuilding all sites may take significant time and resources. Consider rebuilding only stale sites.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
