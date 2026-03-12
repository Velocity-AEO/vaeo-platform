'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface DetectedApp {
  fingerprint: {
    app_id:              string;
    name:                string;
    category:            string;
    performance_impact:  string;
    replaceable_by_vaeo: boolean;
    regulatory_exempt:   boolean;
    monthly_cost_usd?:   number;
  };
  confidence:             'high' | 'medium' | 'low';
  matched_patterns:       string[];
  estimated_monthly_cost: number;
  performance_impact:     string;
}

interface ActionItem {
  priority:              'high' | 'medium' | 'low';
  action:                string;
  potential_saving_ms?:  number;
  potential_saving_usd?: number;
}

interface TopOffender {
  app_name:     string;
  impact:       string;
  monthly_cost: number;
  replaceable:  boolean;
}

interface DiffReport {
  site_id:                  string;
  detected_apps:            DetectedApp[];
  total_monthly_spend:      number;
  vaeo_replacement_savings: number;
  performance_cost_ms:      number;
  top_offenders:            TopOffender[];
  recommendation_summary:   string;
  action_items:             ActionItem[];
}

const IMPACT_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high:     'bg-orange-100 text-orange-800',
  medium:   'bg-yellow-100 text-yellow-800',
  low:      'bg-gray-100 text-gray-600',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high:   'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low:    'bg-gray-100 text-gray-600',
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   'bg-red-100 text-red-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low:    'bg-blue-100 text-blue-800',
};

export default function EnvironmentPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [report, setReport] = useState<DiffReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/environment/${siteId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setReport(data);
      } catch { /* non-fatal */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  if (loading) return <div className="p-8 text-slate-500">Scanning app environment...</div>;
  if (!report) return <div className="p-8 text-red-600">Failed to load environment scan.</div>;

  return (
    <div className="mx-auto max-w-screen-xl px-6 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">App Environment</h1>
        <p className="text-sm text-slate-500 mt-1">{siteId}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Apps Detected</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{report.detected_apps.length}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Monthly Spend</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">${report.total_monthly_spend.toFixed(0)}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">VAEO Savings</p>
          <p className="text-3xl font-bold text-green-600 mt-1">${report.vaeo_replacement_savings.toFixed(0)}/mo</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Est. Page Load Cost</p>
          <p className="text-3xl font-bold text-orange-600 mt-1">+{report.performance_cost_ms.toLocaleString()}ms</p>
        </div>
      </div>

      {/* VAEO savings callout */}
      {report.vaeo_replacement_savings > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-amber-800">{report.recommendation_summary}</p>
        </div>
      )}

      {/* Performance offenders */}
      {report.top_offenders.length > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="px-4 py-3 border-b">
            <h2 className="text-lg font-semibold text-slate-900">These apps are slowing your store</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-2">App</th>
                <th className="text-left px-4 py-2">Category</th>
                <th className="text-left px-4 py-2">Impact</th>
                <th className="text-right px-4 py-2">Monthly Cost</th>
                <th className="text-left px-4 py-2">Replaceable</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.top_offenders.map((o) => (
                <tr key={o.app_name} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{o.app_name}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {report.detected_apps.find((d) => d.fingerprint.name === o.app_name)?.fingerprint.category ?? '-'}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${IMPACT_COLORS[o.impact] ?? ''}`}>
                      {o.impact}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">${o.monthly_cost.toFixed(0)}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      o.replaceable ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {o.replaceable ? 'Yes' : 'No'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action items */}
      {report.action_items.length > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="px-4 py-3 border-b">
            <h2 className="text-lg font-semibold text-slate-900">Action Items</h2>
          </div>
          <ul className="divide-y">
            {report.action_items
              .sort((a, b) => {
                const order = { high: 0, medium: 1, low: 2 };
                return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
              })
              .map((item, i) => (
                <li key={i} className="px-4 py-3 flex items-start gap-3">
                  <span className={`mt-0.5 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${PRIORITY_COLORS[item.priority] ?? ''}`}>
                    {item.priority}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-slate-800">{item.action}</p>
                    <div className="flex gap-4 mt-1 text-xs text-slate-400">
                      {item.potential_saving_ms != null && (
                        <span>-{item.potential_saving_ms}ms page load</span>
                      )}
                      {item.potential_saving_usd != null && item.potential_saving_usd > 0 && (
                        <span>-${item.potential_saving_usd.toFixed(0)}/mo</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* All detected apps */}
      <div className="bg-white rounded-lg border">
        <div className="px-4 py-3 border-b">
          <h2 className="text-lg font-semibold text-slate-900">All Detected Apps</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-2">App</th>
                <th className="text-left px-4 py-2">Category</th>
                <th className="text-left px-4 py-2">Confidence</th>
                <th className="text-right px-4 py-2">Monthly Cost</th>
                <th className="text-left px-4 py-2">Impact</th>
                <th className="text-left px-4 py-2">Replaceable</th>
                <th className="text-left px-4 py-2">Regulatory</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.detected_apps.map((d) => (
                <tr key={d.fingerprint.app_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{d.fingerprint.name}</td>
                  <td className="px-4 py-2 text-slate-600 capitalize">{d.fingerprint.category}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${CONFIDENCE_COLORS[d.confidence] ?? ''}`}>
                      {d.confidence}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">${d.estimated_monthly_cost.toFixed(0)}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${IMPACT_COLORS[d.fingerprint.performance_impact] ?? ''}`}>
                      {d.fingerprint.performance_impact}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      d.fingerprint.replaceable_by_vaeo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {d.fingerprint.replaceable_by_vaeo ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {d.fingerprint.regulatory_exempt && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">Exempt</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
