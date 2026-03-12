'use client';

import { useState } from 'react';

interface FixSummary {
  url: string;
  issue_type: string;
  applied_at: string;
  confidence: number;
  auto_approved: boolean;
}

interface FixesPanelProps {
  fixes: {
    total_applied: number;
    this_week: number;
    this_month: number;
    by_type: Record<string, number>;
    recent: FixSummary[];
  };
}

const TYPE_COLORS: Record<string, string> = {
  title_missing: 'bg-red-100 text-red-700',
  meta_missing: 'bg-amber-100 text-amber-700',
  schema_missing: 'bg-purple-100 text-purple-700',
  h1_missing: 'bg-red-100 text-red-700',
  canonical_missing: 'bg-orange-100 text-orange-700',
  SPEAKABLE_MISSING: 'bg-blue-100 text-blue-700',
  FAQ_OPPORTUNITY: 'bg-cyan-100 text-cyan-700',
  ANSWER_BLOCK_OPPORTUNITY: 'bg-teal-100 text-teal-700',
  DEFER_SCRIPT: 'bg-indigo-100 text-indigo-700',
  LAZY_IMAGE: 'bg-violet-100 text-violet-700',
  FONT_DISPLAY: 'bg-fuchsia-100 text-fuchsia-700',
};

function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? 'bg-slate-100 text-slate-700';
  const label = type.replace(/_/g, ' ').toLowerCase();
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function categorize(type: string): string {
  if (type.includes('schema') || type.includes('SCHEMA')) return 'Schema';
  if (type.includes('title') || type.includes('meta') || type.includes('h1') || type.includes('canonical')) return 'Title/Meta';
  if (type.includes('SPEAKABLE') || type.includes('FAQ') || type.includes('ANSWER') || type.includes('AEO')) return 'AEO';
  if (type.includes('DEFER') || type.includes('LAZY') || type.includes('FONT') || type.includes('LCP')) return 'Performance';
  return 'Other';
}

function CategoryBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-20">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full">
        <div className="h-2 bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-600 font-medium tabular-nums w-8 text-right">{count}</span>
    </div>
  );
}

export default function FixesPanel({ fixes }: FixesPanelProps) {
  const [showAll, setShowAll] = useState(false);

  // Group by category for breakdown
  const categories: Record<string, number> = {};
  for (const [type, count] of Object.entries(fixes.by_type)) {
    const cat = categorize(type);
    categories[cat] = (categories[cat] ?? 0) + count;
  }
  const maxCat = Math.max(...Object.values(categories), 1);

  const displayFixes = showAll ? fixes.recent : fixes.recent.slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-slate-800 tabular-nums">{fixes.this_week}</div>
          <div className="text-xs text-slate-400 mt-1">This week</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-slate-800 tabular-nums">{fixes.this_month}</div>
          <div className="text-xs text-slate-400 mt-1">This month</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-slate-800 tabular-nums">{fixes.total_applied}</div>
          <div className="text-xs text-slate-400 mt-1">Total</div>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-4">By Category</h3>
        <div className="space-y-3">
          {Object.entries(categories)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => (
              <CategoryBar key={cat} label={cat} count={count} max={maxCat} />
            ))}
        </div>
      </div>

      {/* Recent fixes list */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide">Recent Fixes</h3>
        </div>
        {displayFixes.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-400 text-sm">No fixes applied yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {displayFixes.map((fix, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3">
                <TypeBadge type={fix.issue_type} />
                <span className="text-sm text-slate-700 truncate flex-1" title={fix.url}>
                  {fix.url.replace(/^https?:\/\/[^/]+/, '')}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(fix.applied_at).toLocaleDateString()}
                </span>
                {/* Confidence bar */}
                <div className="w-16 h-1.5 bg-slate-100 rounded-full">
                  <div
                    className={`h-1.5 rounded-full ${fix.confidence >= 0.9 ? 'bg-green-500' : fix.confidence >= 0.75 ? 'bg-amber-500' : 'bg-slate-400'}`}
                    style={{ width: `${fix.confidence * 100}%` }}
                  />
                </div>
                {fix.auto_approved && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">AUTO</span>
                )}
              </div>
            ))}
          </div>
        )}
        {fixes.recent.length > 10 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full px-5 py-2.5 text-xs text-blue-600 hover:bg-slate-50 transition-colors font-medium"
          >
            View all fixes ({fixes.recent.length})
          </button>
        )}
      </div>
    </div>
  );
}
