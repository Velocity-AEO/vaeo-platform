'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────────────

interface ClientSite {
  site_id:      string;
  site_url:     string;
  domain:       string;
  cms_type:     string;
  health_score: number;
  grade:        string;
  issues_found: number;
  issues_fixed: number;
  last_scan:    string | null;
  created_at:   string;
}

interface TenantInfo {
  id:   string;
  name: string;
  plan: string;
}

interface RecentFix {
  id:               string;
  url:              string;
  issue_type:       string;
  execution_status: string;
}

// ── Grade colors ─────────────────────────────────────────────────────────────

function gradeColor(grade: string) {
  switch (grade) {
    case 'A': return { bg: 'bg-emerald-500', text: 'text-emerald-500', ring: 'ring-emerald-200', light: 'bg-emerald-50' };
    case 'B': return { bg: 'bg-blue-500',    text: 'text-blue-500',    ring: 'ring-blue-200',    light: 'bg-blue-50' };
    case 'C': return { bg: 'bg-yellow-500',  text: 'text-yellow-500',  ring: 'ring-yellow-200',  light: 'bg-yellow-50' };
    case 'D': return { bg: 'bg-orange-500',  text: 'text-orange-500',  ring: 'ring-orange-200',  light: 'bg-orange-50' };
    default:  return { bg: 'bg-red-500',     text: 'text-red-500',     ring: 'ring-red-200',     light: 'bg-red-50' };
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'deployed':
    case 'completed':
    case 'approved':
      return { label: 'Applied', color: 'bg-emerald-100 text-emerald-700' };
    case 'rolled_back':
    case 'rollback_failed':
      return { label: 'Rolled back', color: 'bg-red-100 text-red-700' };
    case 'pending_approval':
      return { label: 'Pending', color: 'bg-yellow-100 text-yellow-700' };
    case 'failed':
      return { label: 'Failed', color: 'bg-red-100 text-red-700' };
    default:
      return { label: 'In progress', color: 'bg-slate-100 text-slate-600' };
  }
}

function issueLabel(issueType: string): string {
  const map: Record<string, string> = {
    META_TITLE_MISSING:   'Missing page title',
    META_TITLE_DUPLICATE: 'Duplicate page title',
    META_DESC_MISSING:    'Missing description',
    META_DESC_DUPLICATE:  'Duplicate description',
    H1_MISSING:           'Missing heading',
    H1_DUPLICATE:         'Duplicate heading',
    CANONICAL_MISSING:    'Missing canonical link',
    CANONICAL_MISMATCH:   'Canonical mismatch',
    SCHEMA_MISSING:       'Missing structured data',
    SCHEMA_INVALID_JSON:  'Invalid structured data',
    title_missing:        'Missing page title',
    meta_missing:         'Missing description',
    h1_missing:           'Missing heading',
    canonical_missing:    'Missing canonical link',
    schema_missing:       'Missing structured data',
  };
  return map[issueType] ?? issueType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ClientDashboard() {
  const [sites, setSites]       = useState<ClientSite[]>([]);
  const [tenant, setTenant]     = useState<TenantInfo | null>(null);
  const [fixes, setFixes]       = useState<RecentFix[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/tenants/me').then((r) => r.json()),
      fetch('/api/client/sites').then((r) => r.json()),
    ]).then(([tenantRes, sitesRes]) => {
      if (tenantRes.id) setTenant(tenantRes);
      if (sitesRes.sites) {
        setSites(sitesRes.sites);
        // Load recent fixes for the first site
        if (sitesRes.sites.length > 0) {
          loadRecentFixes(sitesRes.sites.map((s: ClientSite) => s.site_id));
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function loadRecentFixes(siteIds: string[]) {
    try {
      const allFixes: RecentFix[] = [];
      for (const siteId of siteIds.slice(0, 5)) {
        const res = await fetch(`/api/sites/${siteId}/fixes`);
        const data = await res.json();
        if (data.fixes) {
          allFixes.push(
            ...data.fixes.slice(0, 10).map((f: Record<string, unknown>) => ({
              id:               f.id as string,
              url:              f.url as string,
              issue_type:       f.issue_type as string,
              execution_status: f.status as string,
            })),
          );
        }
      }
      setFixes(allFixes.slice(0, 10));
    } catch {
      // non-critical
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 bg-slate-200 rounded w-64" />
        <div className="grid grid-cols-3 gap-6">
          <div className="h-48 bg-slate-200 rounded-xl" />
          <div className="h-48 bg-slate-200 rounded-xl" />
          <div className="h-48 bg-slate-200 rounded-xl" />
        </div>
      </div>
    );
  }

  // Aggregate stats
  const totalIssuesFound = sites.reduce((sum, s) => sum + s.issues_found, 0);
  const totalIssuesFixed = sites.reduce((sum, s) => sum + s.issues_fixed, 0);
  const avgScore = sites.length > 0
    ? Math.round(sites.reduce((sum, s) => sum + s.health_score, 0) / sites.length)
    : 0;
  const avgGrade = avgScore >= 85 ? 'A' : avgScore >= 70 ? 'B' : avgScore >= 50 ? 'C' : avgScore >= 30 ? 'D' : 'F';
  const gc = gradeColor(avgGrade);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {tenant?.name ? `Welcome back, ${tenant.name}` : 'Your Dashboard'}
        </h1>
        <p className="text-slate-500 mt-1">
          Here&apos;s how your {sites.length === 1 ? 'site is' : 'sites are'} performing.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Health Score */}
        <div className={`rounded-xl shadow-sm border p-6 ${gc.light} border-slate-200`}>
          <p className="text-sm font-medium text-slate-500 mb-3">Overall Health Score</p>
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full ${gc.bg} flex items-center justify-center`}>
              <span className="text-2xl font-bold text-white">{avgGrade}</span>
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900">{avgScore}</p>
              <p className="text-xs text-slate-500">out of 100</p>
            </div>
          </div>
        </div>

        {/* Issues Found */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <p className="text-sm font-medium text-slate-500 mb-3">Issues Found</p>
          <p className="text-3xl font-bold text-slate-900">{totalIssuesFound}</p>
          <p className="text-sm text-slate-500 mt-1">across {sites.length} {sites.length === 1 ? 'site' : 'sites'}</p>
        </div>

        {/* Issues Fixed */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <p className="text-sm font-medium text-slate-500 mb-3">Fixes Applied</p>
          <p className="text-3xl font-bold text-emerald-600">{totalIssuesFixed}</p>
          {totalIssuesFound > 0 && (
            <p className="text-sm text-slate-500 mt-1">
              {Math.round((totalIssuesFixed / totalIssuesFound) * 100)}% of issues resolved
            </p>
          )}
        </div>
      </div>

      {/* Your Sites */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Your Sites</h2>
          <Link
            href="/onboarding"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            + Add site
          </Link>
        </div>

        {sites.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500 mb-4">No sites connected yet.</p>
            <Link
              href="/onboarding"
              className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Connect your first site
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sites.map((site) => {
              const sc = gradeColor(site.grade);
              return (
                <div
                  key={site.site_id}
                  className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-slate-900">{site.domain}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {site.last_scan ? `Last scanned ${timeAgo(site.last_scan)}` : 'Not yet scanned'}
                      </p>
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${sc.light} ring-1 ${sc.ring}`}>
                      <span className={`text-xl font-bold ${sc.text}`}>{site.grade}</span>
                      <span className="text-sm text-slate-600">{site.health_score}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-slate-500">Found: </span>
                      <span className="font-medium">{site.issues_found}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Fixed: </span>
                      <span className="font-medium text-emerald-600">{site.issues_fixed}</span>
                    </div>
                    {site.issues_found > 0 && site.issues_fixed > 0 && (
                      <div className="text-xs text-slate-400">
                        Your score improved
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <Link
                      href={`/sites/${site.site_id}`}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      View details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Fixes */}
      {fixes.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Fixes</h2>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Issue</th>
                  <th className="px-5 py-3 font-medium">Page</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fixes.map((fix) => {
                  const st = statusLabel(fix.execution_status);
                  const shortUrl = fix.url.replace(/^https?:\/\/[^/]+/, '');
                  return (
                    <tr key={fix.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 text-slate-700">{issueLabel(fix.issue_type)}</td>
                      <td className="px-5 py-3 text-slate-500 text-xs font-mono truncate max-w-[240px]">{shortUrl || '/'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
