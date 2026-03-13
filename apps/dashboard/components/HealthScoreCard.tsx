'use client';

import type { ScoreBreakdownEntry } from '../../../tools/scoring/health_score.js';
import type { IssueSeverity } from '../../../tools/health/health_score_weights.js';
import {
  formatIssueTypeLabel,
  getSeverityBadgeColor,
  formatScoreImpact,
} from '../lib/health_score_display.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface HealthScoreCardProps {
  score:                number;
  grade:                string;
  score_breakdown?:     ScoreBreakdownEntry[];
  critical_issue_count?: number;
  high_issue_count?:     number;
  medium_issue_count?:   number;
  low_issue_count?:      number;
}

// ── Grade color ──────────────────────────────────────────────────────────────

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-green-600';
    case 'B': return 'text-blue-600';
    case 'C': return 'text-yellow-600';
    case 'D': return 'text-orange-600';
    case 'F': return 'text-red-600';
    default:  return 'text-slate-600';
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HealthScoreCard({
  score,
  grade,
  score_breakdown,
  critical_issue_count,
  high_issue_count,
  medium_issue_count,
  low_issue_count,
}: HealthScoreCardProps) {
  const breakdown = score_breakdown ?? [];
  const top3 = breakdown.slice(0, 3);
  const crit = critical_issue_count ?? 0;
  const high = high_issue_count ?? 0;
  const med  = medium_issue_count ?? 0;
  const low  = low_issue_count ?? 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      {/* Score + Grade */}
      <div className="flex items-center justify-between mb-4">
        <div className="group relative">
          <span className="text-3xl font-bold text-slate-800">{score}</span>
          <span className={`text-lg font-semibold ml-2 ${gradeColor(grade)}`}>{grade}</span>
          <div className="absolute hidden group-hover:block bg-slate-800 text-white text-xs rounded px-2 py-1 -top-8 left-0 whitespace-nowrap z-10">
            Score calculated based on SEO impact severity of each issue type
          </div>
        </div>
        <span className="text-xs text-slate-400">/ 100</span>
      </div>

      {/* Issue count summary */}
      {(crit + high + med + low > 0) && (
        <p className="text-xs text-slate-500 mb-3">
          {crit > 0 && <span className="text-red-600 font-medium">{crit} critical</span>}
          {crit > 0 && (high + med + low > 0) && <span> · </span>}
          {high > 0 && <span className="text-orange-600 font-medium">{high} high</span>}
          {high > 0 && (med + low > 0) && <span> · </span>}
          {med > 0 && <span className="text-yellow-600 font-medium">{med} medium</span>}
          {med > 0 && low > 0 && <span> · </span>}
          {low > 0 && <span className="text-gray-500 font-medium">{low} low</span>}
        </p>
      )}

      {/* Score breakdown — top 3 */}
      {top3.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            What&apos;s affecting your score:
          </h3>
          {top3.map((entry) => (
            <div
              key={entry.issue_type}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${getSeverityBadgeColor(entry.severity)}`}
                >
                  {entry.severity}
                </span>
                <span className="text-slate-700">
                  {formatIssueTypeLabel(entry.issue_type)}
                </span>
              </div>
              <span className="text-slate-400 text-xs">
                {formatScoreImpact(entry.total_impact)} ({entry.count} page{entry.count === 1 ? '' : 's'})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
