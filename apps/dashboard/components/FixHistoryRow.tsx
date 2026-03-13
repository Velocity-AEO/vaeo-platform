'use client';

import { useState } from 'react';
import type { FixExplanation } from '../../../tools/explanations/fix_explanation_registry.js';
import { getCategoryBadgeConfig } from '../lib/fix_explanation_display.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface FixHistoryRowProps {
  fix_label:   string;
  url:         string;
  applied_at:  string;
  explanation?: FixExplanation | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FixHistoryRow({
  fix_label,
  url,
  applied_at,
  explanation,
}: FixHistoryRowProps) {
  const [expanded, setExpanded] = useState(false);

  const badge = explanation
    ? getCategoryBadgeConfig(explanation.category)
    : null;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* Collapsed header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          {badge && (
            <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-medium ${badge.color}`}>
              {badge.label}
            </span>
          )}
          <span className="text-sm font-medium text-slate-800 truncate">
            {explanation?.short_label ?? fix_label}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-slate-400 font-mono">{url}</span>
          <span className="text-xs text-slate-400">
            {applied_at ? new Date(applied_at).toLocaleDateString() : ''}
          </span>
        </div>
      </div>

      {/* Expand toggle */}
      {explanation && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left px-4 py-2 text-xs text-blue-600 hover:text-blue-800 bg-slate-50 border-t border-slate-100 transition-colors"
        >
          {expanded ? '▾ Hide details' : '▸ What does this mean?'}
        </button>
      )}

      {/* Expanded explanation */}
      {expanded && explanation && (
        <div
          className="px-4 py-4 bg-slate-50 border-t border-slate-100 space-y-3 text-sm"
          style={{ transition: 'max-height 0.3s ease' }}
        >
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              What we did
            </h4>
            <p className="text-slate-700 leading-relaxed">{explanation.what_we_did}</p>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Why it matters
            </h4>
            <p className="text-slate-700 leading-relaxed">{explanation.why_it_matters}</p>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Expected impact
            </h4>
            <p className="text-slate-700 leading-relaxed">{explanation.expected_impact}</p>
          </div>

          {explanation.learn_more_url && (
            <a
              href={explanation.learn_more_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-blue-600 hover:text-blue-800"
            >
              Learn more →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
