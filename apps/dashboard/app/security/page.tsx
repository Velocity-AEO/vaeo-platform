'use client';

import { useEffect, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

type TrustServiceCriteria = 'CC' | 'A' | 'PI' | 'C' | 'P';
type ControlStatus = 'implemented' | 'partial' | 'not_started' | 'not_applicable';

interface Control {
  id: string;
  criteria: TrustServiceCriteria;
  criteria_ref: string;
  title: string;
  description: string;
  status: ControlStatus;
  evidence: string[];
  owner: string;
  implementation_notes: string;
  last_reviewed?: string;
  gaps?: string[];
}

interface ComplianceScore {
  total: number;
  implemented: number;
  partial: number;
  not_started: number;
  score_pct: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CRITERIA_TABS: { key: TrustServiceCriteria; label: string }[] = [
  { key: 'CC', label: 'Common Criteria' },
  { key: 'A', label: 'Availability' },
  { key: 'PI', label: 'Processing Integrity' },
  { key: 'C', label: 'Confidentiality' },
  { key: 'P', label: 'Privacy' },
];

const STATUS_CONFIG: Record<ControlStatus, { label: string; color: string }> = {
  implemented:    { label: 'Implemented',    color: 'bg-green-100 text-green-700 border-green-200' },
  partial:        { label: 'Partial',        color: 'bg-amber-100 text-amber-700 border-amber-200' },
  not_started:    { label: 'Not Started',    color: 'bg-red-100 text-red-700 border-red-200' },
  not_applicable: { label: 'N/A',            color: 'bg-slate-100 text-slate-500 border-slate-200' },
};

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ControlStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`px-2 py-0.5 rounded border text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function ScoreCard({ score }: { score: ComplianceScore }) {
  const barColor =
    score.score_pct >= 80 ? 'bg-green-500'
    : score.score_pct >= 60 ? 'bg-amber-500'
    : 'bg-red-500';
  const barBg =
    score.score_pct >= 80 ? 'bg-green-100'
    : score.score_pct >= 60 ? 'bg-amber-100'
    : 'bg-red-100';
  const textColor =
    score.score_pct >= 80 ? 'text-green-600'
    : score.score_pct >= 60 ? 'text-amber-600'
    : 'text-red-600';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide">Compliance Score</h2>
          <div className={`text-5xl font-bold tabular-nums mt-1 ${textColor}`}>
            {score.score_pct}%
          </div>
        </div>
        <div className="text-right space-y-1">
          <div className="flex items-center gap-2 justify-end">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-slate-500">{score.implemented} implemented</span>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs text-slate-500">{score.partial} partial</span>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs text-slate-500">{score.not_started} not started</span>
          </div>
        </div>
      </div>
      <div className={`w-full h-3 rounded-full ${barBg}`}>
        <div
          className={`h-3 rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(100, score.score_pct)}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-slate-400">0%</span>
        <span className="text-xs text-slate-400">{score.total} controls</span>
        <span className="text-xs text-slate-400">100%</span>
      </div>
    </div>
  );
}

function ControlCard({ control, expanded, onToggle }: {
  control: Control;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-slate-800">{control.id}</span>
            <StatusBadge status={control.status} />
          </div>
          <div className="text-sm text-slate-700 font-medium">{control.title}</div>
          {!expanded && (
            <div className="text-xs text-slate-400 mt-1 truncate">{control.description}</div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {control.evidence.length > 0 && (
            <span className="text-xs text-slate-400">{control.evidence.length} evidence</span>
          )}
          <span className="text-xs text-slate-400">{control.owner}</span>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-4">
          {/* Description */}
          <div>
            <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Description</h4>
            <p className="text-sm text-slate-600">{control.description}</p>
          </div>

          {/* Implementation notes */}
          <div>
            <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Implementation Notes</h4>
            <p className="text-sm text-slate-600">{control.implementation_notes}</p>
          </div>

          {/* Evidence */}
          {control.evidence.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Evidence</h4>
              <div className="flex flex-wrap gap-1.5">
                {control.evidence.map((e, i) => (
                  <span key={i} className="px-2 py-1 rounded bg-blue-50 text-blue-700 text-xs border border-blue-100">
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Gaps */}
          {control.gaps && control.gaps.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-red-400 uppercase tracking-wide mb-2">Gaps</h4>
              <ul className="space-y-1">
                {control.gaps.map((g, i) => (
                  <li key={i} className="text-sm text-red-600 flex items-start gap-1.5">
                    <span className="text-red-400 mt-0.5">&#x2022;</span>
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Last reviewed */}
          {control.last_reviewed && (
            <div className="text-xs text-slate-400">
              Last reviewed: {new Date(control.last_reviewed).toLocaleDateString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const [controls, setControls] = useState<Control[]>([]);
  const [score, setScore] = useState<ComplianceScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCriteria, setActiveCriteria] = useState<TrustServiceCriteria>('CC');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/security/controls')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setControls(data.controls);
          setScore(data.score);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-1/3" />
        <div className="h-40 bg-slate-200 rounded-xl" />
        <div className="h-64 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
          Failed to load controls: {error}
        </div>
      </div>
    );
  }

  const filtered = controls.filter((c) => c.criteria === activeCriteria);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <h1 className="text-xl font-semibold">SOC 2 Readiness</h1>
        <div className="flex gap-2">
          <a
            href="/api/security/report"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Export Report
          </a>
        </div>
      </div>

      {/* Score card */}
      {score && <ScoreCard score={score} />}

      {/* Criteria tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {CRITERIA_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveCriteria(tab.key); setExpandedId(null); }}
            className={`px-4 py-2 text-sm font-medium transition-colors rounded-t-lg ${
              activeCriteria === tab.key
                ? 'bg-white border border-b-white border-slate-200 text-blue-600 -mb-px'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-slate-400">
              ({controls.filter((c) => c.criteria === tab.key).length})
            </span>
          </button>
        ))}
      </div>

      {/* Control list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-400">
            No controls in this category.
          </div>
        ) : (
          filtered.map((control) => (
            <ControlCard
              key={control.id}
              control={control}
              expanded={expandedId === control.id}
              onToggle={() => setExpandedId(expandedId === control.id ? null : control.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
