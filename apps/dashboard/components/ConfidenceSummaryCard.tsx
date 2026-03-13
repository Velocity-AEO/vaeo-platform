'use client';

import { useState, useEffect } from 'react';

// ── Types (inlined for Next.js bundler) ──────────────────────────────────────

interface ConfidenceSummary {
  total_fixes:          number;
  avg_confidence:       number;
  auto_applied_count:   number;
  manually_approved:    number;
  risk_distribution:    Record<string, number>;
}

interface ConfidenceSummaryCardProps {
  site_id: string;
}

// ── Risk colors ──────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  low:      'bg-green-400',
  medium:   'bg-yellow-400',
  high:     'bg-orange-400',
  critical: 'bg-red-500',
};

const RISK_ORDER = ['low', 'medium', 'high', 'critical'];

// ── Component ────────────────────────────────────────────────────────────────

export default function ConfidenceSummaryCard({ site_id }: ConfidenceSummaryCardProps) {
  const [summary, setSummary] = useState<ConfidenceSummary | null>(null);

  useEffect(() => {
    try {
      // Client-side enrichment from simulated data
      // In production this would fetch from API
      const simulated: ConfidenceSummary = {
        total_fixes:        24,
        avg_confidence:     0.91,
        auto_applied_count: 18,
        manually_approved:  6,
        risk_distribution:  { low: 14, medium: 8, high: 2, critical: 0 },
      };
      setSummary(simulated);
    } catch {
      setSummary(null);
    }
  }, [site_id]);

  if (!summary || summary.total_fixes === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Fix Decision Summary</h3>
        <p className="text-sm text-slate-400">No fixes applied yet</p>
      </section>
    );
  }

  const avgPct = Math.round(summary.avg_confidence * 100);
  const total = summary.total_fixes || 1;

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Fix Decision Summary</h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {/* Average confidence */}
        <div className="text-center">
          <div className="text-2xl font-bold text-slate-800">{avgPct}%</div>
          <div className="text-[11px] text-slate-500">Avg Confidence</div>
        </div>

        {/* Total fixes */}
        <div className="text-center">
          <div className="text-2xl font-bold text-slate-800">{summary.total_fixes}</div>
          <div className="text-[11px] text-slate-500">Total Fixes</div>
        </div>

        {/* Auto-applied */}
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{summary.auto_applied_count}</div>
          <div className="text-[11px] text-slate-500">Auto-Applied</div>
        </div>

        {/* Manually approved */}
        <div className="text-center">
          <div className="text-2xl font-bold text-slate-600">{summary.manually_approved}</div>
          <div className="text-[11px] text-slate-500">Manually Approved</div>
        </div>
      </div>

      {/* Risk distribution bar */}
      <div>
        <div className="text-[11px] text-slate-500 mb-1">Risk Distribution</div>
        <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
          {RISK_ORDER.map(level => {
            const count = summary.risk_distribution[level] ?? 0;
            if (count === 0) return null;
            const widthPct = (count / total) * 100;
            return (
              <div
                key={level}
                className={`${RISK_COLORS[level]} transition-all`}
                style={{ width: `${widthPct}%` }}
                title={`${level}: ${count}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-slate-400">
          {RISK_ORDER.map(level => {
            const count = summary.risk_distribution[level] ?? 0;
            if (count === 0) return null;
            return (
              <span key={level}>
                {level.charAt(0).toUpperCase() + level.slice(1)}: {count}
              </span>
            );
          })}
        </div>
      </div>

      {/* Link to fix history */}
      <div className="mt-3 pt-2 border-t border-slate-100">
        <a href="#fix-history" className="text-xs text-blue-600 hover:text-blue-800">
          View Fix History →
        </a>
      </div>
    </section>
  );
}
