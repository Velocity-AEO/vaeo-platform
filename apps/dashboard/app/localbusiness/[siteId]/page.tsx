'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

// ── Types (mirrored from localbusiness_report.ts) ─────────────────────────────

interface LocalBusinessIssue {
  type:           string;
  severity:       string;
  description:    string;
  recommendation: string;
}

interface LocalBusinessData {
  name?:            string;
  type?:            string;
  address_street?:  string;
  address_city?:    string;
  address_state?:   string;
  address_zip?:     string;
  phone?:           string;
  website?:         string;
  hours?:           string[];
  price_range?:     string;
  same_as?:         string[];
}

interface LocalBusinessPageReport {
  url:                      string;
  is_local_business_page:   boolean;
  has_localbusiness_schema: boolean;
  issues:                   LocalBusinessIssue[];
  local_data:               LocalBusinessData;
  schema_generated:         boolean;
}

interface LocalBusinessSiteReport {
  site_id:              string;
  total_local_pages:    number;
  pages_with_schema:    number;
  pages_missing_schema: number;
  schema_coverage_pct:  number;
  nap_consistent:       boolean;
  top_issues:           { type: string; count: number }[];
  pages:                LocalBusinessPageReport[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    high:   'bg-red-100 text-red-800',
    medium: 'bg-orange-100 text-orange-800',
    low:    'bg-yellow-100 text-yellow-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[severity] ?? 'bg-gray-100 text-gray-800'}`}>
      {severity}
    </span>
  );
}

function CoverageBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full bg-gray-200 rounded h-3 mt-2">
      <div className={`${color} h-3 rounded transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LocalBusinessPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [report, setReport]   = useState<LocalBusinessSiteReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<'overview' | 'issues' | 'pages'>('overview');

  useEffect(() => {
    fetch(`/api/localbusiness/${siteId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setReport(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="p-8 space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-64" />
        <div className="h-24 bg-gray-200 rounded" />
        <div className="h-64 bg-gray-200 rounded" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
          Failed to load Local SEO report: {error ?? 'Unknown error'}
        </div>
      </div>
    );
  }

  const localPages = report.pages.filter((p) => p.is_local_business_page);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Local SEO Coverage</h1>
          <p className="text-gray-500 text-sm mt-1">Site ID: {report.site_id}</p>
        </div>

        {/* NAP status badge */}
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">NAP Consistency</span>
          {report.nap_consistent ? (
            <span className="px-4 py-1.5 bg-green-100 text-green-800 border border-green-300 rounded-full text-sm font-semibold">
              Consistent
            </span>
          ) : (
            <span className="px-4 py-1.5 bg-red-100 text-red-800 border border-red-300 rounded-full text-sm font-semibold">
              Inconsistent
            </span>
          )}
          <span className="text-xs text-gray-400">Critical for Google Maps pack</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Local Pages</div>
          <div className="text-3xl font-bold">{report.total_local_pages}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">With Schema</div>
          <div className="text-3xl font-bold text-green-600">{report.pages_with_schema}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Missing Schema</div>
          <div className="text-3xl font-bold text-red-600">{report.pages_missing_schema}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Coverage</div>
          <div className="text-3xl font-bold">{report.schema_coverage_pct}%</div>
          <CoverageBar pct={report.schema_coverage_pct} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-6">
        {(['overview', 'issues', 'pages'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t ${
              tab === t ? 'bg-white border border-b-white -mb-px' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'overview' ? 'Overview' : t === 'issues' ? 'Top Issues' : 'Pages'}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Top issues */}
          {report.top_issues.length > 0 && (
            <div className="bg-white border rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Top Issues</h2>
              <div className="space-y-3">
                {report.top_issues.map((issue) => (
                  <div key={issue.type} className="flex items-center justify-between">
                    <span className="text-sm font-mono text-gray-700">{issue.type}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded h-2">
                        <div
                          className="bg-blue-500 h-2 rounded"
                          style={{ width: `${Math.min((issue.count / Math.max(report.total_local_pages, 1)) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-600 w-8 text-right">{issue.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NAP info card */}
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-2">About NAP Consistency</h2>
            <p className="text-sm text-gray-600">
              Name, Address, and Phone (NAP) must be identical in your LocalBusiness schema
              and all visible page content. Inconsistent NAP data is one of the top factors
              causing drops in Google Maps pack rankings.
            </p>
          </div>
        </div>
      )}

      {/* ── Issues tab ── */}
      {tab === 'issues' && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Issue</th>
                <th className="text-left px-4 py-3 font-medium">Severity</th>
                <th className="text-left px-4 py-3 font-medium">Page</th>
                <th className="text-left px-4 py-3 font-medium">Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {localPages
                .flatMap((p) => p.issues.map((i) => ({ ...i, pageUrl: p.url })))
                .sort((a, b) => {
                  const o: Record<string, number> = { high: 0, medium: 1, low: 2 };
                  return (o[a.severity] ?? 3) - (o[b.severity] ?? 3);
                })
                .slice(0, 50)
                .map((issue, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{issue.type}</td>
                    <td className="px-4 py-3"><SeverityBadge severity={issue.severity} /></td>
                    <td className="px-4 py-3 truncate max-w-xs text-gray-600 text-xs" title={issue.pageUrl}>
                      {(() => { try { return new URL(issue.pageUrl).pathname; } catch { return issue.pageUrl; } })()}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{issue.recommendation}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {localPages.flatMap((p) => p.issues).length === 0 && (
            <div className="p-8 text-center text-gray-500">No issues detected</div>
          )}
        </div>
      )}

      {/* ── Pages tab ── */}
      {tab === 'pages' && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">URL</th>
                <th className="text-left px-4 py-3 font-medium">Schema</th>
                <th className="text-left px-4 py-3 font-medium">NAP</th>
                <th className="text-left px-4 py-3 font-medium">Issues</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {localPages.slice(0, 100).map((page) => {
                const hasNapIssue = page.issues.some((i) => i.type === 'nap_inconsistency');
                return (
                  <tr key={page.url} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-blue-600 truncate max-w-xs" title={page.url}>
                      {(() => { try { return new URL(page.url).pathname; } catch { return page.url; } })()}
                    </td>
                    <td className="px-4 py-3">
                      {page.has_localbusiness_schema ? (
                        <span className="text-green-600 font-medium text-xs">Yes</span>
                      ) : (
                        <span className="text-red-600 font-medium text-xs">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {hasNapIssue ? (
                        <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs">Inconsistent</span>
                      ) : (
                        <span className="text-green-600 text-xs">OK</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {page.issues.length > 0 ? (
                        <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs">
                          {page.issues.length}
                        </span>
                      ) : (
                        <span className="text-green-600 text-xs">Clean</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {localPages.length === 0 && (
            <div className="p-8 text-center text-gray-500">No local business pages detected</div>
          )}
        </div>
      )}
    </div>
  );
}
