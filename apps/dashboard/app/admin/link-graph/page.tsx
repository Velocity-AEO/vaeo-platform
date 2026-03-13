'use client';

import { useEffect, useState, useCallback } from 'react';

// ── Inline types ────────────────────────────────────────────────────────────

interface SiteAttention {
  site_id: string;
  domain: string;
  orphaned_count: number;
  broken_external_count: number;
  velocity_alerts: number;
  last_graph_built: string | null;
  attention_reasons: string[];
}

interface GraphBuildEntry {
  site_id: string;
  domain: string;
  last_built: string | null;
  pages_mapped: number;
  build_age_hours: number | null;
  is_stale: boolean;
}

interface PlatformLinkHealth {
  generated_at: string;
  total_sites: number;
  sites_with_graph: number;
  sites_without_graph: number;
  total_pages_mapped: number;
  total_orphaned_pages: number;
  total_dead_ends: number;
  total_deep_pages: number;
  total_broken_external: number;
  total_canonical_conflicts: number;
  total_link_opportunities: number;
  total_velocity_alerts: number;
  avg_orphaned_per_site: number;
  avg_authority_score: number | null;
  sites_needing_attention: SiteAttention[];
  graph_build_status: GraphBuildEntry[];
}

interface IntegrityIssue {
  type: string;
  description: string;
  affected_count: number;
  severity: string;
}

interface IntegrityReport {
  site_id: string;
  checked_at: string;
  is_valid: boolean;
  issues: IntegrityIssue[];
  page_count: number;
  internal_link_count: number;
  external_link_count: number;
  orphaned_count: number;
  duplicate_nodes: number;
  missing_homepage: boolean;
  disconnected_components: number;
}

// ── Display helpers ─────────────────────────────────────────────────────────

function formatBuildAge(hours: number | null): string {
  if (hours === null) return 'Never built';
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getSeverityBg(severity: string): string {
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    warning: 'bg-yellow-100 text-yellow-800',
    info: 'bg-blue-100 text-blue-800',
  };
  return map[severity] ?? 'bg-slate-100 text-slate-800';
}

export default function AdminLinkGraphPage() {
  const [health, setHealth] = useState<PlatformLinkHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuildingId, setRebuildingId] = useState<string | null>(null);
  const [rebuildResult, setRebuildResult] = useState<Record<string, { success: boolean; pages_mapped: number } | null>>({});
  const [integrityReports, setIntegrityReports] = useState<Record<string, IntegrityReport>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const loadHealth = useCallback(() => {
    fetch('/api/admin/link-graph/health')
      .then((r) => r.json())
      .then((data) => { setHealth(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  async function triggerRebuild(siteId: string) {
    setRebuildingId(siteId);
    try {
      const res = await fetch(`/api/admin/sites/${encodeURIComponent(siteId)}/link-graph/rebuild`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setRebuildResult((prev) => ({ ...prev, [siteId]: data }));
      }
    } catch { /* non-fatal */ }
    setRebuildingId(null);
  }

  async function runIntegrityCheck(siteId: string) {
    setCheckingId(siteId);
    try {
      const res = await fetch(`/api/admin/link-graph/integrity/${encodeURIComponent(siteId)}`);
      if (res.ok) {
        const data = await res.json();
        setIntegrityReports((prev) => ({ ...prev, [siteId]: data }));
      }
    } catch { /* non-fatal */ }
    setCheckingId(null);
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

  if (!health) {
    return (
      <div className="px-4 py-6 md:px-6 w-full max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Link Graph Admin</h1>
        <p className="text-gray-600">Unable to load platform link health.</p>
      </div>
    );
  }

  const staleSites = health.graph_build_status.filter((s) => s.is_stale);

  return (
    <div className="px-4 py-6 md:px-6 w-full max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Link Graph Admin</h1>

      {/* Platform summary row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold">{health.sites_with_graph} / {health.total_sites}</div>
          <div className="text-sm text-gray-500">Sites Mapped</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold">{health.total_pages_mapped.toLocaleString()}</div>
          <div className="text-sm text-gray-500">Total Pages</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-orange-600">{health.total_orphaned_pages}</div>
          <div className="text-sm text-gray-500">Total Orphaned</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-600">{health.total_broken_external}</div>
          <div className="text-sm text-gray-500">Broken External</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-yellow-600">{health.total_velocity_alerts}</div>
          <div className="text-sm text-gray-500">Velocity Alerts</div>
        </div>
      </div>

      {/* Stale graphs alert */}
      {staleSites.length > 0 && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <h2 className="text-sm font-semibold text-yellow-800 mb-2">
            {staleSites.length} site{staleSites.length === 1 ? '' : 's'} ha{staleSites.length === 1 ? 's' : 've'} stale link graphs (not rebuilt in 25+ hours)
          </h2>
          <div className="space-y-1">
            {staleSites.map((s) => (
              <div key={s.site_id} className="flex items-center justify-between text-sm text-yellow-900">
                <span>{s.domain}</span>
                <span className="text-xs text-yellow-700">{formatBuildAge(s.build_age_hours)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sites needing attention table */}
      {health.sites_needing_attention.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Sites Needing Attention</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="pb-2 pr-4 font-medium">Domain</th>
                  <th className="pb-2 pr-4 font-medium">Orphaned</th>
                  <th className="pb-2 pr-4 font-medium">Broken External</th>
                  <th className="pb-2 pr-4 font-medium">Velocity Alerts</th>
                  <th className="pb-2 pr-4 font-medium">Issues</th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {health.sites_needing_attention.map((site) => (
                  <tr key={site.site_id} className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-medium">{site.domain}</td>
                    <td className="py-3 pr-4">{site.orphaned_count > 0 ? <span className="text-orange-600">{site.orphaned_count}</span> : '0'}</td>
                    <td className="py-3 pr-4">{site.broken_external_count > 0 ? <span className="text-red-600">{site.broken_external_count}</span> : '0'}</td>
                    <td className="py-3 pr-4">{site.velocity_alerts > 0 ? <span className="text-yellow-600">{site.velocity_alerts}</span> : '0'}</td>
                    <td className="py-3 pr-4">
                      <div className="space-y-0.5">
                        {site.attention_reasons.map((r, i) => (
                          <div key={i} className="text-xs text-gray-500">{r}</div>
                        ))}
                      </div>
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => triggerRebuild(site.site_id)}
                        disabled={rebuildingId === site.site_id}
                        className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {rebuildingId === site.site_id ? 'Rebuilding...' : 'Rebuild Graph'}
                      </button>
                      {rebuildResult[site.site_id] && (
                        <div className="text-xs text-green-600 mt-1">
                          {rebuildResult[site.site_id]!.success
                            ? `Rebuilt ${rebuildResult[site.site_id]!.pages_mapped} pages`
                            : 'Failed'}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full graph build status table */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Graph Build Status</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 pr-4 font-medium">Domain</th>
                <th className="pb-2 pr-4 font-medium">Last Built</th>
                <th className="pb-2 pr-4 font-medium">Pages Mapped</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {health.graph_build_status.map((site) => (
                <tr
                  key={site.site_id}
                  className={`border-b border-gray-100 ${
                    site.last_built === null
                      ? 'bg-red-50'
                      : site.is_stale
                        ? 'bg-yellow-50'
                        : ''
                  }`}
                >
                  <td className="py-3 pr-4 font-medium">{site.domain}</td>
                  <td className="py-3 pr-4">
                    {site.last_built === null
                      ? <span className="text-red-600 font-medium">Never built</span>
                      : formatBuildAge(site.build_age_hours)}
                  </td>
                  <td className="py-3 pr-4">{site.pages_mapped}</td>
                  <td className="py-3 pr-4">
                    {site.is_stale
                      ? <span className="text-xs font-medium px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">Stale</span>
                      : <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-800">Fresh</span>}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => triggerRebuild(site.site_id)}
                        disabled={rebuildingId === site.site_id}
                        className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {rebuildingId === site.site_id ? 'Rebuilding...' : 'Rebuild'}
                      </button>
                      <button
                        onClick={() => runIntegrityCheck(site.site_id)}
                        disabled={checkingId === site.site_id}
                        className="text-xs px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                      >
                        {checkingId === site.site_id ? 'Checking...' : 'Run Integrity Check'}
                      </button>
                    </div>
                    {rebuildResult[site.site_id] && (
                      <div className="text-xs text-green-600 mt-1">
                        {rebuildResult[site.site_id]!.success
                          ? `Rebuilt ${rebuildResult[site.site_id]!.pages_mapped} pages`
                          : 'Failed'}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Integrity check results */}
      {Object.keys(integrityReports).length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Integrity Check Results</h2>
          <div className="space-y-4">
            {Object.entries(integrityReports).map(([siteId, report]) => (
              <div key={siteId} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm font-medium">{siteId}</span>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${report.is_valid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {report.is_valid ? 'Valid' : 'Issues Found'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {report.page_count} pages, {report.internal_link_count} links
                  </span>
                </div>

                {report.issues.length > 0 && (
                  <div className="space-y-2">
                    {report.issues.map((issue, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getSeverityBg(issue.severity)}`}>
                          {issue.severity}
                        </span>
                        <span className="text-sm text-gray-700">{issue.description}</span>
                      </div>
                    ))}
                  </div>
                )}

                {report.issues.length === 0 && (
                  <p className="text-sm text-green-600">No issues found.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
