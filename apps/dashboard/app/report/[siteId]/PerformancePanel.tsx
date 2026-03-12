'use client';

interface PerformancePanelProps {
  performance: {
    lighthouse_current?: { score: number; lcp: number; cls: number; measured_at: string };
    lighthouse_30d_ago?: { score: number; lcp: number; cls: number; measured_at: string };
    lcp_delta?: number;
    performance_delta?: number;
  };
}

function MetricCard({ label, before, after, unit, invertDelta }: {
  label: string;
  before: number | undefined;
  after: number | undefined;
  unit: string;
  invertDelta?: boolean;
}) {
  const hasBoth = before !== undefined && after !== undefined;
  const delta = hasBoth ? after! - before! : undefined;
  const isPositive = invertDelta ? (delta ?? 0) < 0 : (delta ?? 0) > 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="text-xs text-slate-400 uppercase tracking-wide mb-3">{label}</div>
      {hasBoth ? (
        <>
          <div className="flex items-end justify-between mb-2">
            <div>
              <span className="text-xs text-slate-400">Before</span>
              <div className="text-lg font-semibold text-slate-500 tabular-nums">
                {formatValue(before!, unit)}
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">After</span>
              <div className="text-lg font-semibold text-slate-800 tabular-nums">
                {formatValue(after!, unit)}
              </div>
            </div>
          </div>
          <div className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {delta! > 0 ? '+' : ''}{formatValue(delta!, unit)}
            <span className="ml-1">{isPositive ? '\u2191' : '\u2193'}</span>
          </div>
        </>
      ) : after !== undefined ? (
        <div className="text-2xl font-bold text-slate-800 tabular-nums">
          {formatValue(after, unit)}
        </div>
      ) : (
        <div className="text-sm text-slate-400">No data</div>
      )}
    </div>
  );
}

function formatValue(value: number, unit: string): string {
  if (unit === 'pts') return `${value}`;
  if (unit === 'ms') return `${Math.round(value)}ms`;
  if (unit === 'cls') return value.toFixed(3);
  return String(value);
}

export default function PerformancePanel({ performance }: PerformancePanelProps) {
  const { lighthouse_current, lighthouse_30d_ago } = performance;

  if (!lighthouse_current) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <div className="text-slate-400 text-sm">
          Connect GSC and run a crawl to see performance data
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          label="Performance Score"
          before={lighthouse_30d_ago?.score}
          after={lighthouse_current.score}
          unit="pts"
        />
        <MetricCard
          label="Largest Contentful Paint"
          before={lighthouse_30d_ago?.lcp}
          after={lighthouse_current.lcp}
          unit="ms"
          invertDelta
        />
        <MetricCard
          label="Cumulative Layout Shift"
          before={lighthouse_30d_ago?.cls}
          after={lighthouse_current.cls}
          unit="cls"
          invertDelta
        />
      </div>
      {lighthouse_current.measured_at && (
        <p className="text-xs text-slate-400 text-right">
          Measured: {new Date(lighthouse_current.measured_at).toLocaleDateString()}
          {lighthouse_30d_ago?.measured_at && (
            <> vs {new Date(lighthouse_30d_ago.measured_at).toLocaleDateString()}</>
          )}
        </p>
      )}
    </div>
  );
}
