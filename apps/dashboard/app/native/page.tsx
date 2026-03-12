'use client';

import { useEffect, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface ObservedBehavior {
  id: string;
  description: string;
  trigger: string;
  expected_output: string;
  user_visible: boolean;
}

interface DataInput {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

interface PerformanceRequirements {
  max_js_kb: number;
  no_external_cdn: boolean;
  no_render_blocking: boolean;
  lazy_load_eligible: boolean;
}

interface FunctionalSpec {
  spec_id: string;
  name: string;
  category: string;
  version: string;
  status: string;
  replaces_app: string;
  replaces_app_id: string;
  observed_behaviors: ObservedBehavior[];
  data_inputs: DataInput[];
  performance_requirements: PerformanceRequirements;
  legal_notes: string;
  created_at: string;
  approved_at?: string;
}

interface NativeComponent {
  component_id: string;
  spec_id: string;
  name: string;
  version: string;
  status: string;
  platform: string;
  entry_file: string;
  js_size_kb: number;
  has_external_cdn: boolean;
  has_render_blocking: boolean;
  test_coverage_pct: number;
  performance_verified: boolean;
  legal_approved: boolean;
  notes: string;
}

interface Summary {
  total_specs: number;
  approved_specs: number;
  live_components: number;
  in_development: number;
  total_monthly_savings_potential: number;
}

interface TranslatorOutput {
  spec: FunctionalSpec;
  confidence: string;
  needs_legal_review: boolean;
  warnings: string[];
  observation_source: string;
  prompt?: string;
}

const CATEGORIES = [
  'seo', 'schema', 'image_optimization', 'page_speed',
  'redirects', 'sitemap', 'meta_tags', 'structured_data',
  'analytics', 'shipping', 'popup', 'social', 'reviews',
  'payments', 'email', 'other',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    approved: 'bg-green-100 text-green-800',
    draft: 'bg-yellow-100 text-yellow-800',
    reviewed: 'bg-blue-100 text-blue-800',
    deprecated: 'bg-gray-100 text-gray-600',
    development: 'bg-yellow-100 text-yellow-800',
    testing: 'bg-blue-100 text-blue-800',
    live: 'bg-green-100 text-green-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function platformBadge(platform: string) {
  const colors: Record<string, string> = {
    shopify: 'bg-green-50 text-green-700 border-green-200',
    wordpress: 'bg-blue-50 text-blue-700 border-blue-200',
    both: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  return (
    <span className={`px-2 py-0.5 rounded border text-xs font-medium ${colors[platform] ?? ''}`}>
      {platform}
    </span>
  );
}

function boolBadge(val: boolean, trueLabel = 'Yes', falseLabel = 'No') {
  return val
    ? <span className="text-green-600 text-xs font-medium">{trueLabel}</span>
    : <span className="text-gray-400 text-xs">{falseLabel}</span>;
}

function confidenceBadge(conf: string) {
  const colors: Record<string, string> = {
    high: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[conf] ?? ''}`}>
      {conf} confidence
    </span>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function NativeComponentsPage() {
  const [specs, setSpecs] = useState<FunctionalSpec[]>([]);
  const [components, setComponents] = useState<NativeComponent[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSpec, setExpandedSpec] = useState<string | null>(null);

  // Translator form state
  const [formAppName, setFormAppName] = useState('');
  const [formAppId, setFormAppId] = useState('');
  const [formCategory, setFormCategory] = useState('other');
  const [formUrl, setFormUrl] = useState('');
  const [formObserver, setFormObserver] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [translating, setTranslating] = useState(false);
  const [translatorResult, setTranslatorResult] = useState<TranslatorOutput | null>(null);

  useEffect(() => {
    fetch('/api/native')
      .then((r) => r.json())
      .then((data) => {
        setSpecs(data.specs ?? []);
        setComponents(data.components ?? []);
        setSummary(data.summary ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleTranslate(e: React.FormEvent) {
    e.preventDefault();
    setTranslating(true);
    setTranslatorResult(null);
    try {
      const res = await fetch('/api/native/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_name: formAppName,
          app_id: formAppId,
          category: formCategory,
          observed_url: formUrl || undefined,
          observer_name: formObserver,
          observation_notes: formNotes,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTranslatorResult(data);
      }
    } catch { /* non-fatal */ }
    setTranslating(false);
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
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Native Components</h1>
        <p className="text-gray-500 text-sm mt-1">Copyright-safe replacements for third-party apps</p>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold">{summary.approved_specs}</div>
            <div className="text-xs text-gray-500 mt-1">Approved Specs</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold">{summary.live_components}</div>
            <div className="text-xs text-gray-500 mt-1">Live Components</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold">{summary.in_development}</div>
            <div className="text-xs text-gray-500 mt-1">In Development</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">
              ${summary.total_monthly_savings_potential}
            </div>
            <div className="text-xs text-gray-500 mt-1">Savings Potential /mo</div>
          </div>
        </div>
      )}

      {/* Approved Specs table */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Approved Specs</h2>
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Spec Name</th>
                <th className="text-left px-4 py-3 font-medium">Replaces</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Behaviors</th>
                <th className="text-left px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {specs.map((spec) => (
                <>
                  <tr key={spec.spec_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{spec.name}</td>
                    <td className="px-4 py-3 text-gray-600">{spec.replaces_app}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs uppercase">{spec.category}</td>
                    <td className="px-4 py-3">{statusBadge(spec.status)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{spec.observed_behaviors.length}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpandedSpec(expandedSpec === spec.spec_id ? null : spec.spec_id)}
                        className="text-blue-600 hover:underline text-xs font-medium"
                      >
                        {expandedSpec === spec.spec_id ? 'Hide' : 'View Spec'}
                      </button>
                    </td>
                  </tr>
                  {expandedSpec === spec.spec_id && (
                    <tr key={`${spec.spec_id}-detail`}>
                      <td colSpan={6} className="px-4 py-4 bg-gray-50">
                        <div className="space-y-3">
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Observed Behaviors</h4>
                            <ul className="space-y-1">
                              {spec.observed_behaviors.map((b) => (
                                <li key={b.id} className="text-sm">
                                  <span className="font-medium">{b.id}:</span> {b.description}
                                  <span className="text-gray-400"> — Trigger: {b.trigger}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Data Inputs</h4>
                            <ul className="space-y-1">
                              {spec.data_inputs.map((d) => (
                                <li key={d.name} className="text-sm">
                                  <span className="font-mono text-xs">{d.name}</span>: {d.type}
                                  {d.required && <span className="text-red-500 ml-1">*</span>}
                                  <span className="text-gray-400"> — {d.description}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Performance</h4>
                            <p className="text-sm text-gray-600">
                              Max JS: {spec.performance_requirements.max_js_kb}kb
                              {spec.performance_requirements.no_external_cdn && ' | No CDN'}
                              {spec.performance_requirements.no_render_blocking && ' | No render blocking'}
                              {spec.performance_requirements.lazy_load_eligible && ' | Lazy loadable'}
                            </p>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Legal Notes</h4>
                            <p className="text-sm text-gray-600 italic">{spec.legal_notes}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Component Registry table */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Component Registry</h2>
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Component</th>
                <th className="text-left px-4 py-3 font-medium">Platform</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">JS Size</th>
                <th className="text-left px-4 py-3 font-medium">Perf Verified</th>
                <th className="text-left px-4 py-3 font-medium">Legal Approved</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {components.map((c) => (
                <tr key={c.component_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium font-mono text-xs">{c.name}</td>
                  <td className="px-4 py-3">{platformBadge(c.platform)}</td>
                  <td className="px-4 py-3">{statusBadge(c.status)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.js_size_kb > 0 ? `${c.js_size_kb}kb` : '—'}
                  </td>
                  <td className="px-4 py-3">{boolBadge(c.performance_verified)}</td>
                  <td className="px-4 py-3">{boolBadge(c.legal_approved)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Translator section */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Add a New Spec</h2>
        <p className="text-sm text-gray-500 mb-4">
          Describe what you observed. Never reference source code.
        </p>

        <form onSubmit={handleTranslate} className="bg-white border rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">App Name</label>
              <input
                type="text"
                value={formAppName}
                onChange={(e) => setFormAppName(e.target.value)}
                required
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="e.g. Hextom Free Shipping Bar"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">App ID</label>
              <input
                type="text"
                value={formAppId}
                onChange={(e) => setFormAppId(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="e.g. hextom_shipping_bar"
              />
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
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observed URL (optional)</label>
              <input
                type="text"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="https://example-store.myshopify.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observer Name</label>
              <input
                type="text"
                value={formObserver}
                onChange={(e) => setFormObserver(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Your name"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observation Notes</label>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              required
              className="w-full border rounded px-3 py-2 text-sm"
              rows={6}
              placeholder={"Describe what you saw the app do. Use plain English. Do not reference code.\nExample: The app shows a banner at the top of the page. When the cart is below $50, it says 'Add more for free shipping'. When the cart is above $50, it says 'You qualify for free shipping'."}
            />
          </div>
          <button
            type="submit"
            disabled={translating}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {translating ? 'Generating...' : 'Generate Spec Draft'}
          </button>
        </form>

        {/* Translator result */}
        {translatorResult && (
          <div className="mt-6 space-y-4">
            <div className="bg-white border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <h3 className="text-lg font-semibold">{translatorResult.spec.name}</h3>
                {confidenceBadge(translatorResult.confidence)}
                {translatorResult.needs_legal_review && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                    Needs Legal Review
                  </span>
                )}
              </div>

              {translatorResult.warnings.length > 0 && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
                  <p className="font-medium text-amber-800 mb-1">Warnings:</p>
                  <ul className="list-disc pl-5 text-amber-700">
                    {translatorResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                    Parsed Behaviors ({translatorResult.spec.observed_behaviors.length})
                  </h4>
                  <ul className="space-y-1">
                    {translatorResult.spec.observed_behaviors.map((b) => (
                      <li key={b.id} className="text-sm">
                        <span className="font-medium">{b.id}:</span> {b.description}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Legal Notes</h4>
                  <p className="text-sm text-gray-600 italic">{translatorResult.spec.legal_notes}</p>
                </div>
              </div>
            </div>

            {/* Build prompt */}
            <div className="bg-white border rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Build Prompt (Department 2)</h3>
              <pre className="bg-gray-900 text-green-400 p-4 rounded text-xs overflow-x-auto whitespace-pre-wrap font-mono">
                {generatePromptFromSpec(translatorResult.spec)}
              </pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatePromptFromSpec(translatorResult.spec));
                }}
                className="mt-2 px-3 py-1 text-xs border rounded hover:bg-gray-50"
              >
                Copy to clipboard
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// Client-side prompt generation (mirrors specToPrompt)
function generatePromptFromSpec(spec: FunctionalSpec): string {
  const lines: string[] = [];
  lines.push('Build a native Shopify component that implements the following functional spec.');
  lines.push('Write original code from scratch. Do not reference or derive from any existing app\'s implementation.');
  lines.push('');
  lines.push(`Component: ${spec.name}`);
  lines.push(`Replaces: ${spec.replaces_app}`);
  lines.push('');
  lines.push('Behaviors:');
  spec.observed_behaviors.forEach((b, i) => {
    lines.push(`${i + 1}. ${b.description}`);
    lines.push(`   Trigger: ${b.trigger}`);
    lines.push(`   Expected: ${b.expected_output}`);
  });
  lines.push('');
  if (spec.data_inputs.length > 0) {
    lines.push('Data inputs:');
    for (const d of spec.data_inputs) {
      const req = d.required ? '(required)' : '(optional)';
      lines.push(`- ${d.name}: ${d.type} — ${d.description} ${req}`);
    }
    lines.push('');
  }
  lines.push('Performance requirements:');
  lines.push(`- Max JS bundle: ${spec.performance_requirements.max_js_kb}kb`);
  if (spec.performance_requirements.no_external_cdn) lines.push('- No external CDN dependencies');
  if (spec.performance_requirements.no_render_blocking) lines.push('- No render-blocking resources');
  if (spec.performance_requirements.lazy_load_eligible) lines.push('- Lazy load eligible');
  lines.push('');
  lines.push(`Legal: ${spec.legal_notes}`);
  return lines.join('\n');
}
