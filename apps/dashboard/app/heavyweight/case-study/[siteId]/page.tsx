'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface DataPoint {
  label: string;
  value: string;
}

interface Section {
  heading: string;
  body: string;
  data_points: DataPoint[];
}

interface Metrics {
  performance_before: number;
  performance_after: number;
  performance_delta: number;
  lcp_before_ms: number;
  lcp_after_ms: number;
  lcp_delta_ms: number;
  apps_detected: number;
  fixes_applied: number;
  monthly_savings_usd: number;
}

interface CaseStudyData {
  headline: string;
  subheadline: string;
  sections: Section[];
  metrics_snapshot: Metrics;
  pullquote: string;
  cta: string;
  shareable_summary: string;
  generated_at: string;
}

interface ApiResponse {
  case_study: CaseStudyData;
  markdown: string;
  run_summary: {
    status: string;
    duration_ms: number;
    apps_detected: number;
    fixes_applied: number;
  };
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-800 rounded-lg p-4 text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionCard({ section }: { section: Section }) {
  return (
    <div className="bg-slate-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-3">{section.heading}</h3>
      <p className="text-sm text-slate-300 leading-relaxed">{section.body}</p>
      {section.data_points.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {section.data_points.map((dp) => (
            <div key={dp.label} className="bg-slate-700/50 rounded px-3 py-2">
              <span className="text-xs text-slate-400">{dp.label}: </span>
              <span className="text-sm font-medium text-white">{dp.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CaseStudyPage() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'summary' | 'markdown' | null>(null);

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      try {
        const res = await fetch(`/api/heavyweight/case-study/${encodeURIComponent(siteId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
      } catch (e: any) {
        setError(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [siteId]);

  async function copyText(text: string, type: 'summary' | 'markdown') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* non-fatal */ }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Loading case study...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          {error || 'No data available'}
        </div>
      </div>
    );
  }

  const { case_study: cs, markdown, run_summary } = data;
  const m = cs.metrics_snapshot;

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">{cs.headline}</h1>
          <p className="text-slate-400 mt-1">{cs.subheadline}</p>
          <div className="flex items-center gap-3 mt-3">
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
              run_summary.status === 'complete' ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'
            }`}>
              {run_summary.status}
            </span>
            <span className="text-xs text-slate-500">
              {(run_summary.duration_ms / 1000).toFixed(1)}s
            </span>
          </div>
        </div>

        {/* Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <MetricCard label="Before" value={String(m.performance_before)} />
          <MetricCard label="After" value={String(m.performance_after)} />
          <MetricCard label="Delta" value={`+${m.performance_delta}`} />
          <MetricCard
            label="LCP"
            value={`${(m.lcp_before_ms / 1000).toFixed(1)}s → ${(m.lcp_after_ms / 1000).toFixed(1)}s`}
            sub={`-${(m.lcp_delta_ms / 1000).toFixed(1)}s`}
          />
          <MetricCard label="Apps Detected" value={String(m.apps_detected)} />
          <MetricCard label="Fixes Applied" value={String(m.fixes_applied)} />
        </div>

        {/* Savings callout */}
        {m.monthly_savings_usd > 0 && (
          <div className="bg-emerald-900/30 border border-emerald-700 rounded-lg p-4 text-center">
            <span className="text-emerald-400 font-semibold text-lg">${m.monthly_savings_usd}/mo</span>
            <span className="text-emerald-300 text-sm ml-2">potential savings from app replacements</span>
          </div>
        )}

        {/* Sections */}
        <div className="space-y-4">
          {cs.sections.map((section) => (
            <SectionCard key={section.heading} section={section} />
          ))}
        </div>

        {/* Pullquote */}
        {cs.pullquote && (
          <div className="border-l-4 border-blue-500 bg-slate-800 rounded-r-lg p-6">
            <p className="text-lg text-white italic">&ldquo;{cs.pullquote}&rdquo;</p>
          </div>
        )}

        {/* Shareable Summary */}
        <div className="bg-slate-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Shareable Summary</h3>
            <button
              onClick={() => copyText(cs.shareable_summary, 'summary')}
              className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded transition-colors"
            >
              {copied === 'summary' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-sm text-slate-300">{cs.shareable_summary}</p>
        </div>

        {/* Markdown Export */}
        <div className="bg-slate-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Markdown Export</h3>
            <button
              onClick={() => copyText(markdown, 'markdown')}
              className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded transition-colors"
            >
              {copied === 'markdown' ? 'Copied!' : 'Copy Markdown'}
            </button>
          </div>
          <pre className="text-xs text-slate-400 bg-slate-900 rounded p-4 overflow-x-auto max-h-64 overflow-y-auto">
            {markdown}
          </pre>
        </div>

        {/* CTA */}
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-6 text-center">
          <p className="text-blue-300">{cs.cta}</p>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-600">
          Generated: {new Date(cs.generated_at).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
