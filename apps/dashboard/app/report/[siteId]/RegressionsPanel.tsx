'use client';

interface RegressionsPanelProps {
  regressions: {
    active: number;
    resolved_this_week: number;
    recent: Array<{
      url: string;
      signal: string;
      detected_at: string;
      severity: string;
    }>;
  };
}

function SeverityBadge({ severity }: { severity: string }) {
  const color =
    severity === 'critical' ? 'bg-red-100 text-red-700'
    : severity === 'major' ? 'bg-amber-100 text-amber-700'
    : 'bg-slate-100 text-slate-700';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {severity}
    </span>
  );
}

export default function RegressionsPanel({ regressions }: RegressionsPanelProps) {
  if (regressions.active === 0 && regressions.recent.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <div className="text-3xl mb-2">{'\u2705'}</div>
        <div className="text-sm text-slate-500 font-medium">No regressions detected</div>
        <div className="text-xs text-slate-400 mt-1">All signals are passing</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <div className={`text-2xl font-bold tabular-nums ${regressions.active > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {regressions.active}
            </div>
            {regressions.active > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">ALERT</span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-1">Active regressions</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-green-600 tabular-nums">
            {regressions.resolved_this_week}
          </div>
          <div className="text-xs text-slate-400 mt-1">Resolved this week</div>
        </div>
      </div>

      {/* Active regressions list */}
      {regressions.recent.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide">Active Regressions</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {regressions.recent.map((reg, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3">
                <SeverityBadge severity={reg.severity} />
                <span className="text-xs text-slate-500 font-medium uppercase">{reg.signal}</span>
                <span className="text-sm text-slate-700 truncate flex-1" title={reg.url}>
                  {reg.url.replace(/^https?:\/\/[^/]+/, '')}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(reg.detected_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
