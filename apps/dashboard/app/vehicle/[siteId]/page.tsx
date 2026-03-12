'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

// ── Types (mirrored from vehicle_report.ts) ──────────────────────────────────

interface VehicleIssue {
  issue_type: string;
  severity:   string;
  url:        string;
  details:    string;
  fix_hint:   string;
}

interface VehicleData {
  vin?:          string;
  make?:         string;
  model?:        string;
  year?:         string;
  trim?:         string;
  color?:        string;
  mileage?:      string;
  price?:        string;
  condition?:    string;
  body_style?:   string;
  fuel_type?:    string;
  transmission?: string;
  description?:  string;
  image_url?:    string;
}

interface VehiclePageReport {
  url:                string;
  is_inventory_page:  boolean;
  has_vehicle_schema: boolean;
  issues:             VehicleIssue[];
  vehicle_data:       VehicleData;
  schema_generated:   boolean;
}

interface VehicleSiteReport {
  site_id:               string;
  total_inventory_pages: number;
  pages_with_schema:     number;
  pages_missing_schema:  number;
  schema_coverage_pct:   number;
  top_issues:            { type: string; count: number }[];
  pages:                 VehiclePageReport[];
}

// ── Severity badge ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    major:    'bg-orange-100 text-orange-800',
    minor:    'bg-yellow-100 text-yellow-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[severity] ?? 'bg-gray-100 text-gray-800'}`}>
      {severity}
    </span>
  );
}

// ── Coverage bar ─────────────────────────────────────────────────────────────

function CoverageBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full bg-gray-200 rounded h-3">
      <div className={`${color} h-3 rounded`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function VehiclePage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [report, setReport] = useState<VehicleSiteReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'issues' | 'inventory'>('overview');

  useEffect(() => {
    fetch(`/api/vehicle/${siteId}`)
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
        <div className="h-48 bg-gray-200 rounded" />
        <div className="h-64 bg-gray-200 rounded" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
          Failed to load vehicle report: {error ?? 'Unknown error'}
        </div>
      </div>
    );
  }

  const inventoryPages = report.pages.filter((p) => p.is_inventory_page);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Vehicle Schema Report</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Inventory Pages</div>
          <div className="text-3xl font-bold">{report.total_inventory_pages}</div>
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
        {(['overview', 'issues', 'inventory'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t ${
              tab === t ? 'bg-white border border-b-white -mb-px' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'overview' ? 'Overview' : t === 'issues' ? 'Top Issues' : 'Inventory Pages'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Top issues summary */}
          {report.top_issues.length > 0 && (
            <div className="bg-white border rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Top Issues</h2>
              <div className="space-y-3">
                {report.top_issues.map((issue) => (
                  <div key={issue.type} className="flex items-center justify-between">
                    <span className="text-sm font-mono">{issue.type}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded h-2">
                        <div
                          className="bg-blue-500 h-2 rounded"
                          style={{ width: `${(issue.count / report.total_inventory_pages) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-600 w-12 text-right">{issue.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vehicle makes breakdown */}
          {inventoryPages.length > 0 && (
            <div className="bg-white border rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Detected Makes</h2>
              <div className="flex flex-wrap gap-2">
                {[...new Set(inventoryPages.map((p) => p.vehicle_data.make).filter(Boolean))].map(
                  (make) => (
                    <span key={make} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                      {make}
                    </span>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'issues' && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Issue</th>
                <th className="text-left px-4 py-3 font-medium">Severity</th>
                <th className="text-left px-4 py-3 font-medium">Page</th>
                <th className="text-left px-4 py-3 font-medium">Fix Hint</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {inventoryPages
                .flatMap((p) => p.issues.map((i) => ({ ...i, pageUrl: p.url })))
                .sort((a, b) => {
                  const order: Record<string, number> = { critical: 0, major: 1, minor: 2 };
                  return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
                })
                .slice(0, 50)
                .map((issue, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{issue.issue_type}</td>
                    <td className="px-4 py-3"><SeverityBadge severity={issue.severity} /></td>
                    <td className="px-4 py-3 truncate max-w-xs" title={issue.pageUrl}>
                      {new URL(issue.pageUrl).pathname}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{issue.fix_hint}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {inventoryPages.flatMap((p) => p.issues).length === 0 && (
            <div className="p-8 text-center text-gray-500">No issues detected</div>
          )}
        </div>
      )}

      {tab === 'inventory' && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Vehicle</th>
                <th className="text-left px-4 py-3 font-medium">VIN</th>
                <th className="text-left px-4 py-3 font-medium">Price</th>
                <th className="text-left px-4 py-3 font-medium">Schema</th>
                <th className="text-left px-4 py-3 font-medium">Issues</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {inventoryPages.slice(0, 100).map((page) => {
                const v = page.vehicle_data;
                const name = [v.year, v.make, v.model].filter(Boolean).join(' ') || new URL(page.url).pathname;
                return (
                  <tr key={page.url} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{v.vin ?? '—'}</td>
                    <td className="px-4 py-3">{v.price ? `$${Number(v.price).toLocaleString()}` : '—'}</td>
                    <td className="px-4 py-3">
                      {page.has_vehicle_schema ? (
                        <span className="text-green-600 font-medium">Yes</span>
                      ) : (
                        <span className="text-red-600 font-medium">No</span>
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
          {inventoryPages.length === 0 && (
            <div className="p-8 text-center text-gray-500">No inventory pages detected</div>
          )}
        </div>
      )}
    </div>
  );
}
