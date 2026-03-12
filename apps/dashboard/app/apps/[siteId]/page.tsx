'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

// ── Types ────────────────────────────────────────────────────────────────────

interface AppReplacement {
  id:                    string;
  app_name:              string;
  app_category:          string;
  removed_at:            string;
  replacement?:          string;
  replacement_type:      string;
  health_score_before?:  number;
  health_score_after?:   number;
  health_delta?:         number;
  lcp_before?:           number;
  lcp_after?:            number;
  lcp_delta?:            number;
  notes?:                string;
}

interface Summary {
  total_apps_removed:     number;
  avg_health_delta:       number;
  avg_lcp_improvement_ms: number;
  replaced_by_vaeo:       number;
  deemed_unnecessary:     number;
}

interface ROI {
  monthly_savings: number;
  roi_statement:   string;
}

const CATEGORIES = [
  'seo', 'schema', 'image_optimization', 'page_speed',
  'redirects', 'sitemap', 'meta_tags', 'structured_data',
  'analytics', 'other',
];

const REPLACEMENT_TYPES = ['vaeo_native', 'unnecessary', 'third_party'];

const KNOWN_APPS = [
  'SEO Manager', 'Smart SEO', 'JSON-LD for SEO', 'TinyIMG',
  'Image Optimizer', 'SEO Image Optimizer', 'Plug In SEO',
  'Schema Plus for SEO', 'Redirectify', 'Easy Redirects',
];

// ── Main page ────────────────────────────────────────────────────────────────

export default function AppReplacementPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [replacements, setReplacements] = useState<AppReplacement[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [roi, setRoi] = useState<ROI | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('seo');
  const [formType, setFormType] = useState('vaeo_native');
  const [formHealthBefore, setFormHealthBefore] = useState('');
  const [formHealthAfter, setFormHealthAfter] = useState('');
  const [formNotes, setFormNotes] = useState('');

  function loadData() {
    setLoading(true);
    Promise.all([
      fetch(`/api/apps/replacements?site_id=${siteId}`).then((r) => r.json()),
      fetch(`/api/apps/roi?site_id=${siteId}`).then((r) => r.json()),
    ])
      .then(([repData, roiData]) => {
        setReplacements(repData.replacements ?? []);
        setSummary(repData.summary ?? null);
        setRoi(roiData ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, [siteId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/apps/replacements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id:             siteId,
          tenant_id:           'system',
          app_name:            formName,
          app_category:        formCategory,
          replacement_type:    formType,
          health_score_before: formHealthBefore ? Number(formHealthBefore) : undefined,
          health_score_after:  formHealthAfter ? Number(formHealthAfter) : undefined,
          notes:               formNotes || undefined,
        }),
      });
      if (res.ok) {
        setFormName('');
        setFormCategory('seo');
        setFormType('vaeo_native');
        setFormHealthBefore('');
        setFormHealthAfter('');
        setFormNotes('');
        setShowForm(false);
        loadData();
      }
    } catch { /* non-fatal */ }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-72" />
        <div className="h-32 bg-gray-200 rounded" />
        <div className="h-64 bg-gray-200 rounded" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">App Replacement Tracker</h1>

      {/* ROI summary card */}
      {roi && (
        <div className="bg-white border rounded-lg p-6 mb-6">
          <div className="flex items-start gap-8">
            <div>
              <div className="text-sm text-gray-500">Monthly Savings</div>
              <div className="text-4xl font-bold text-green-600">${roi.monthly_savings}</div>
            </div>
            <div className="flex-1">
              <div className="text-sm text-gray-500 mb-1">ROI Summary</div>
              <p className="text-gray-700">{roi.roi_statement}</p>
            </div>
            {summary && (
              <div className="text-right">
                <div className="text-sm text-gray-500">Apps Replaced</div>
                <div className="text-3xl font-bold">{summary.total_apps_removed}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {summary.replaced_by_vaeo} by VAEO, {summary.deemed_unnecessary} unnecessary
                </div>
              </div>
            )}
          </div>
          {summary && (summary.avg_health_delta !== 0 || summary.avg_lcp_improvement_ms !== 0) && (
            <div className="flex gap-6 mt-4 pt-4 border-t">
              {summary.avg_health_delta !== 0 && (
                <div>
                  <span className="text-sm text-gray-500">Avg Health Delta: </span>
                  <span className={`font-semibold ${summary.avg_health_delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {summary.avg_health_delta > 0 ? '+' : ''}{summary.avg_health_delta}
                  </span>
                </div>
              )}
              {summary.avg_lcp_improvement_ms !== 0 && (
                <div>
                  <span className="text-sm text-gray-500">Avg LCP Improvement: </span>
                  <span className="font-semibold text-green-600">{summary.avg_lcp_improvement_ms}ms</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Log Replacement button + form */}
      <div className="mb-6">
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'Log Replacement'}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="mt-4 bg-white border rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">App Name</label>
                <input
                  type="text"
                  list="known-apps"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="e.g. SEO Manager"
                />
                <datalist id="known-apps">
                  {KNOWN_APPS.map((a) => <option key={a} value={a} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Replacement Type</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  {REPLACEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Health Before</label>
                <input
                  type="number"
                  value={formHealthBefore}
                  onChange={(e) => setFormHealthBefore(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Optional"
                  min="0" max="100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Health After</label>
                <input
                  type="number"
                  value={formHealthAfter}
                  onChange={(e) => setFormHealthAfter(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Optional"
                  min="0" max="100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Optional"
                  rows={1}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </form>
        )}
      </div>

      {/* Replacements table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">App Name</th>
              <th className="text-left px-4 py-3 font-medium">Category</th>
              <th className="text-left px-4 py-3 font-medium">Removed</th>
              <th className="text-left px-4 py-3 font-medium">Replaced By</th>
              <th className="text-right px-4 py-3 font-medium">Health Before</th>
              <th className="text-right px-4 py-3 font-medium">Health After</th>
              <th className="text-right px-4 py-3 font-medium">Delta</th>
              <th className="text-right px-4 py-3 font-medium">LCP Before</th>
              <th className="text-right px-4 py-3 font-medium">LCP After</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {replacements.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{r.app_name}</td>
                <td className="px-4 py-3 text-gray-600">{r.app_category}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(r.removed_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    r.replacement_type === 'vaeo_native' ? 'bg-blue-100 text-blue-800'
                    : r.replacement_type === 'unnecessary' ? 'bg-gray-100 text-gray-800'
                    : 'bg-purple-100 text-purple-800'
                  }`}>
                    {r.replacement_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.health_score_before ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.health_score_after ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.health_delta != null ? (
                    <span className={r.health_delta > 0 ? 'text-green-600 font-medium' : r.health_delta < 0 ? 'text-red-600' : ''}>
                      {r.health_delta > 0 ? '+' : ''}{r.health_delta}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.lcp_before != null ? `${r.lcp_before}ms` : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.lcp_after != null ? `${r.lcp_after}ms` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {replacements.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No app replacements logged yet. Use the Log Replacement button to track apps VAEO has replaced on this site.
          </div>
        )}
      </div>
    </div>
  );
}
