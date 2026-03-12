'use client';

interface HealthTrendProps {
  health: {
    current_score: number;
    current_grade: string;
    score_7d_ago: number;
    score_30d_ago: number;
    trend: 'improving' | 'declining' | 'stable';
  };
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function barColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

function barBg(score: number): string {
  if (score >= 80) return 'bg-green-100';
  if (score >= 60) return 'bg-amber-100';
  return 'bg-red-100';
}

function DeltaBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  const delta = current - previous;
  if (delta === 0) {
    return (
      <div className="text-center">
        <span className="text-xs text-slate-400">{label}</span>
        <div className="text-sm text-slate-500 font-medium mt-0.5">0</div>
      </div>
    );
  }

  const positive = delta > 0;
  return (
    <div className="text-center">
      <span className="text-xs text-slate-400">{label}</span>
      <div className={`text-sm font-medium mt-0.5 ${positive ? 'text-green-600' : 'text-red-600'}`}>
        {positive ? '+' : ''}{delta}
        <span className="ml-0.5">{positive ? '\u2191' : '\u2193'}</span>
      </div>
    </div>
  );
}

function TrendLabel({ trend }: { trend: 'improving' | 'declining' | 'stable' }) {
  const config = {
    improving: { label: 'Improving \u2191', color: 'text-green-600 bg-green-50 border-green-200' },
    declining: { label: 'Declining \u2193', color: 'text-red-600 bg-red-50 border-red-200' },
    stable:    { label: 'Stable \u2192',    color: 'text-slate-600 bg-slate-50 border-slate-200' },
  };
  const c = config[trend];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${c.color}`}>
      {c.label}
    </span>
  );
}

export default function HealthTrend({ health }: HealthTrendProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex items-start justify-between mb-6">
        <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide">Health Score</h2>
        <TrendLabel trend={health.trend} />
      </div>

      <div className="flex items-end gap-6 mb-6">
        {/* Large score display */}
        <div>
          <span className={`text-5xl font-bold tabular-nums ${scoreColor(health.current_score)}`}>
            {health.current_score}
          </span>
          <span className="text-2xl font-semibold text-slate-300 ml-2">
            {health.current_grade}
          </span>
        </div>

        {/* Delta badges */}
        <div className="flex gap-6 ml-auto">
          <DeltaBadge current={health.current_score} previous={health.score_7d_ago} label="vs 7d ago" />
          <DeltaBadge current={health.current_score} previous={health.score_30d_ago} label="vs 30d ago" />
        </div>
      </div>

      {/* Score bar */}
      <div className={`w-full h-3 rounded-full ${barBg(health.current_score)}`}>
        <div
          className={`h-3 rounded-full transition-all duration-500 ${barColor(health.current_score)}`}
          style={{ width: `${Math.min(100, Math.max(0, health.current_score))}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-slate-400">0</span>
        <span className="text-xs text-slate-400">100</span>
      </div>
    </div>
  );
}
