'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface AccessibilityIssue {
  type:           string;
  severity:       'high' | 'medium' | 'low';
  count:          number;
  automated:      boolean;
  description:    string;
  wcag_criterion: string;
  recommendation: string;
}

interface PageReport {
  url:                     string;
  total_issues:            number;
  automated_fixes_applied: number;
  manual_review_items:     string[];
  issues:                  AccessibilityIssue[];
  wcag_level:              'A' | 'AA' | 'AAA' | 'failing';
}

interface SiteReport {
  site_id:                   string;
  total_pages:               number;
  pages_with_issues:         number;
  total_issues:              number;
  automated_fixes_available: number;
  top_issues:                { type: string; count: number }[];
  wcag_aa_compliant:         boolean;
  pages:                     PageReport[];
}

const SEVERITY_COLORS: Record<string, string> = {
  high:   'bg-red-100 text-red-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low:    'bg-blue-100 text-blue-800',
};

const WCAG_COLORS: Record<string, string> = {
  AAA:     'bg-green-100 text-green-800',
  AA:      'bg-green-100 text-green-800',
  A:       'bg-yellow-100 text-yellow-800',
  failing: 'bg-red-100 text-red-800',
};

function issueLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AccessibilityPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [report, setReport] = useState<SiteReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/accessibility/${siteId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setReport(data);
      } catch { /* non-fatal */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  if (loading) {
    return <div className="p-8 text-slate-500">Loading accessibility report...</div>;
  }

  if (!report) {
    return <div className="p-8 text-red-600">Failed to load accessibility report.</div>;
  }

  // Collect all manual review items across pages
  const allManualItems = report.pages.flatMap((p) =>
    p.manual_review_items.map((item) => ({ url: p.url, item })),
  );

  // Collect all issues across pages (deduplicated by type)
  const issueMap = new Map<string, AccessibilityIssue>();
  for (const page of report.pages) {
    for (const issue of page.issues) {
      const existing = issueMap.get(issue.type);
      if (existing) {
        issueMap.set(issue.type, { ...existing, count: existing.count + issue.count });
      } else {
        issueMap.set(issue.type, { ...issue });
      }
    }
  }
  const allIssues = [...issueMap.values()].sort((a, b) => b.count - a.count);

  return (
    <div className="mx-auto max-w-screen-xl px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Accessibility</h1>
          <p className="text-sm text-slate-500 mt-1">{siteId}</p>
        </div>
        <span
          className={`px-4 py-2 rounded-full text-sm font-semibold ${
            report.wcag_aa_compliant
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}
        >
          {report.wcag_aa_compliant ? 'AA Compliant' : 'Issues Found'}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total Issues</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{report.total_issues}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Auto-fixes Available</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{report.automated_fixes_available}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Pages with Issues</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">
            {report.pages_with_issues} / {report.total_pages}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">WCAG AA Status</p>
          <p className={`text-lg font-bold mt-1 ${report.wcag_aa_compliant ? 'text-green-600' : 'text-red-600'}`}>
            {report.wcag_aa_compliant ? 'Compliant' : 'Non-compliant'}
          </p>
        </div>
      </div>

      {/* Issues breakdown table */}
      <div className="bg-white rounded-lg border">
        <div className="px-4 py-3 border-b">
          <h2 className="text-lg font-semibold text-slate-900">Issues Breakdown</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2">Issue Type</th>
              <th className="text-left px-4 py-2">Severity</th>
              <th className="text-right px-4 py-2">Count</th>
              <th className="text-left px-4 py-2">WCAG</th>
              <th className="text-left px-4 py-2">Automated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {allIssues.map((issue) => (
              <tr key={issue.type} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">{issueLabel(issue.type)}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[issue.severity]}`}>
                    {issue.severity}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono">{issue.count}</td>
                <td className="px-4 py-2 text-slate-600">{issue.wcag_criterion}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    issue.automated ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {issue.automated ? 'Yes' : 'No'}
                  </span>
                </td>
              </tr>
            ))}
            {allIssues.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No accessibility issues found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Manual review section */}
      {allManualItems.length > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="px-4 py-3 border-b">
            <h2 className="text-lg font-semibold text-slate-900">Manual Review Required</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              These items cannot be automated because they require human judgment
            </p>
          </div>
          <ul className="divide-y">
            {allManualItems.map((m, i) => (
              <li key={i} className="px-4 py-3 flex items-start gap-3">
                <span className="mt-0.5 w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
                <div>
                  <p className="text-sm text-slate-800">{m.item}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{m.url}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pages table */}
      <div className="bg-white rounded-lg border">
        <div className="px-4 py-3 border-b">
          <h2 className="text-lg font-semibold text-slate-900">Pages</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2">URL</th>
              <th className="text-right px-4 py-2">Issues</th>
              <th className="text-left px-4 py-2">WCAG Level</th>
              <th className="text-right px-4 py-2">Auto-fixes Applied</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.pages.map((page) => (
              <tr key={page.url} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-mono text-xs truncate max-w-xs">{page.url}</td>
                <td className="px-4 py-2 text-right font-mono">{page.total_issues}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${WCAG_COLORS[page.wcag_level]}`}>
                    {page.wcag_level}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono">{page.automated_fixes_applied}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
