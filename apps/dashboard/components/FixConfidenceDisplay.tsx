'use client';

import { useState } from 'react';
import LearnMoreLink from './LearnMoreLink';

// ── Types (inlined for Next.js bundler) ──────────────────────────────────────

interface ConfidenceDisplayData {
  fix_id:               string;
  confidence_score:     number;
  confidence_label:     string;
  confidence_color:     string;
  risk_level:           string;
  risk_label:           string;
  risk_color:           string;
  decision_method:      'auto_approved' | 'manually_approved' | 'auto_applied';
  decision_label:       string;
  decision_reasons:     string[];
  threshold_used:       number;
  threshold_met:        boolean;
  sandbox_passed:       boolean | null;
  viewport_qa_passed:   boolean | null;
  applied_at:           string;
}

interface FixConfidenceDisplayProps {
  data: ConfidenceDisplayData | null | undefined;
  expanded?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

function isCautionReason(reason: string): boolean {
  return reason.includes('failed') || reason.includes('issues detected') || reason.includes('High-risk');
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FixConfidenceDisplay({ data, expanded: initialExpanded }: FixConfidenceDisplayProps) {
  const [expanded, setExpanded] = useState(initialExpanded ?? false);

  if (!data) return null;

  const scorePct = Math.round(data.confidence_score * 100);
  const threshPct = Math.round(data.threshold_used * 100);

  const decisionBadgeColor =
    data.decision_method === 'manually_approved'
      ? 'bg-slate-100 text-slate-600'
      : 'bg-blue-50 text-blue-700';

  return (
    <div className="mt-2">
      {/* Collapsed state — pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`px-2 py-0.5 rounded text-[10px] font-medium bg-opacity-10 ${data.confidence_color}`}
              style={{ backgroundColor: 'currentColor', color: 'transparent' }}>
          <span className={data.confidence_color} style={{ color: undefined }}>
            {data.confidence_label} Confidence
          </span>
        </span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${data.confidence_color}`}>
          {data.confidence_label} Confidence
        </span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${data.risk_color}`}>
          {data.risk_label}
        </span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${decisionBadgeColor}`}>
          {data.decision_label}
        </span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-blue-600 hover:text-blue-800 transition-colors"
        >
          {expanded ? '▾ Hide reasoning' : '▸ Why did VAEO make this decision?'}
        </button>
      </div>

      {/* Expanded state */}
      {expanded && (
        <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-3 text-xs"
             style={{ transition: 'max-height 0.3s ease' }}>
          {/* Confidence score bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-slate-600">Confidence Score<LearnMoreLink article_slug="understanding-confidence-scores" /></span>
              <span className={`font-semibold ${data.confidence_color}`}>
                {scorePct}% confidence ({threshPct}% required)
              </span>
            </div>
            <div className="relative h-2 bg-slate-200 rounded-full overflow-visible">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${Math.min(scorePct, 100)}%` }}
              />
              {/* Threshold marker */}
              <div
                className="absolute top-0 h-full w-0.5 bg-slate-500"
                style={{ left: `${Math.min(threshPct, 100)}%` }}
                title={`Threshold: ${threshPct}%`}
              />
            </div>
          </div>

          {/* Risk level */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-600">Risk Level:</span>
            <span className={`font-semibold ${data.risk_color}`}>{data.risk_label}</span>
          </div>

          {/* Decision reasons */}
          <div>
            <span className="font-medium text-slate-600 block mb-1">Decision Reasoning</span>
            <ul className="space-y-1">
              {data.decision_reasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="shrink-0 mt-0.5">
                    {isCautionReason(reason) ? '⚠' : '✓'}
                  </span>
                  <span className="text-slate-700">{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Sandbox status */}
          {data.sandbox_passed !== null && (
            <div className="flex items-center gap-1.5">
              <span>{data.sandbox_passed ? '✓' : '✗'}</span>
              <span className={data.sandbox_passed ? 'text-green-700' : 'text-red-600'}>
                {data.sandbox_passed ? 'Sandbox passed' : 'Sandbox failed'}
              </span>
            </div>
          )}

          {/* Viewport QA status */}
          {data.viewport_qa_passed !== null && (
            <div className="flex items-center gap-1.5">
              <span>{data.viewport_qa_passed ? '✓' : '✗'}</span>
              <span className={data.viewport_qa_passed ? 'text-green-700' : 'text-red-600'}>
                {data.viewport_qa_passed ? 'All viewports passed' : 'Viewport issues detected'}
              </span>
            </div>
          )}

          {/* Applied timestamp */}
          {data.applied_at && (
            <div className="text-slate-400 pt-1 border-t border-slate-100">
              Applied {relativeTime(data.applied_at)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
