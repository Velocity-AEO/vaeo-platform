'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Suggestion {
  suggestion_id: string;
  site_id: string;
  title: string;
  description: string;
  rationale: string;
  fix_type: string;
  priority: string;
  estimated_impact: string;
  effort: string;
  affected_pages: string[];
  affected_count: number;
  can_auto_fix: boolean;
  source: string;
  confidence: number;
  tags: string[];
  created_at: string;
}

interface SuggestionsResponse {
  rule_suggestions: { suggestions: Suggestion[]; total_count: number; critical_count: number } | null;
  ai_suggestions: { suggestions: Suggestion[]; total_count: number; critical_count: number } | null;
  combined: Suggestion[];
  mode: string;
  summary: {
    critical_count: number;
    high_count: number;
    total_count: number;
    auto_fixable_count: number;
  };
}

type PriorityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';
type SourceFilter = 'all' | 'rule_engine' | 'ai_engine';
type Mode = 'rule' | 'ai' | 'both';

// ── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-amber-100 text-amber-800 border-amber-200',
  medium: 'bg-blue-100 text-blue-800 border-blue-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
};

const EFFORT_COLORS: Record<string, string> = {
  low: 'text-green-700 bg-green-50',
  medium: 'text-yellow-700 bg-yellow-50',
  high: 'text-red-700 bg-red-50',
};

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.low}`}>
      {priority}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  if (source === 'ai_engine') {
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">AI-Powered</span>;
  }
  return <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">Rule Engine</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SuggestionsPage() {
  const params = useParams();
  const siteId = params.siteId as string;

  const [mode, setMode] = useState<Mode>('rule');
  const [data, setData] = useState<SuggestionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Filters
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [autoFixOnly, setAutoFixOnly] = useState(false);

  const fetchSuggestions = useCallback(async (m: Mode) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suggestions/${siteId}?mode=${m}`);
      if (res.ok) {
        const json: SuggestionsResponse = await res.json();
        setData(json);
      }
    } catch { /* non-fatal */ }
    setLoading(false);
  }, [siteId]);

  useEffect(() => { fetchSuggestions(mode); }, [mode, fetchSuggestions]);

  function handleModeChange(m: Mode) {
    setMode(m);
    setDismissed(new Set());
  }

  // Filter suggestions
  const filtered = (data?.combined ?? []).filter((s) => {
    if (dismissed.has(s.suggestion_id)) return false;
    if (priorityFilter !== 'all' && s.priority !== priorityFilter) return false;
    if (sourceFilter !== 'all' && s.source !== sourceFilter) return false;
    if (autoFixOnly && !s.can_auto_fix) return false;
    return true;
  });

  const domain = siteId ? `${siteId}.myshopify.com` : '';

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SEO Suggestions</h1>
          <p className="text-gray-500 text-sm mt-0.5">{domain}</p>
        </div>
        <Link href={`/client/${siteId}`} className="text-sm text-blue-600 hover:underline">
          Back to Dashboard
        </Link>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          ['rule', 'Rule-Based'],
          ['ai', 'AI-Powered'],
          ['both', 'Both'],
        ] as const).map(([m, label]) => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === m ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading state for AI */}
      {loading && (mode === 'ai' || mode === 'both') && (
        <div className="flex items-center gap-3 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="animate-spin w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full" />
          <span className="text-sm text-purple-700">Analyzing your site with AI...</span>
        </div>
      )}

      {/* Summary bar */}
      {data && !loading && (
        <div className="flex items-center gap-4 p-4 bg-white border rounded-lg">
          <span className="text-sm font-medium">
            <span className="text-red-600 font-bold">{data.summary.critical_count}</span> critical
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-medium">
            <span className="text-amber-600 font-bold">{data.summary.high_count}</span> high priority
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-medium">
            <span className="text-green-600 font-bold">{data.summary.auto_fixable_count}</span> can be auto-fixed
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-500">
            {data.summary.total_count} total suggestions
          </span>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Priority:</span>
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                priorityFilter === p ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Source:</span>
          {(['all', 'rule_engine', 'ai_engine'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                sourceFilter === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s === 'all' ? 'All' : s === 'rule_engine' ? 'Rule Engine' : 'AI-Powered'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={autoFixOnly} onChange={(e) => setAutoFixOnly(e.target.checked)} />
          Auto-fixable only
        </label>
      </div>

      {/* Suggestion cards */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">No suggestions — your site looks great!</p>
          <p className="text-sm mt-1">Try switching modes or adjusting filters.</p>
        </div>
      )}

      <div className="space-y-4">
        {filtered.map((s) => (
          <div key={s.suggestion_id} className="bg-white border rounded-lg p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <PriorityBadge priority={s.priority} />
                <h3 className="font-semibold text-gray-900">{s.title}</h3>
                <SourceBadge source={s.source} />
                {s.can_auto_fix && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                    Auto-Fix Available
                  </span>
                )}
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${EFFORT_COLORS[s.effort] ?? ''}`}>
                {s.effort} effort
              </span>
            </div>

            <p className="text-sm text-gray-700">{s.description}</p>
            <p className="text-sm text-gray-500 italic">{s.rationale}</p>

            <div className="flex items-center gap-4 flex-wrap">
              {s.estimated_impact && (
                <span className="text-xs text-green-700 font-medium">{s.estimated_impact}</span>
              )}
              {s.affected_count > 0 && (
                <span className="text-xs text-gray-500">{s.affected_count} pages affected</span>
              )}
              <span className="text-xs text-gray-400">Confidence: {Math.round(s.confidence * 100)}%</span>
            </div>

            {s.tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {s.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              {s.can_auto_fix && (
                <button className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">
                  Fix Now
                </button>
              )}
              <button
                onClick={() => setDismissed((prev) => new Set(prev).add(s.suggestion_id))}
                className="px-3 py-1.5 text-gray-500 border rounded text-xs font-medium hover:bg-gray-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
