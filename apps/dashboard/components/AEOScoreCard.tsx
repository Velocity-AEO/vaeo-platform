'use client';

import { useState, useEffect } from 'react';
import LearnMoreLink from './LearnMoreLink';

// ── Types (inlined for Next.js bundler) ──────────────────────────────────────

interface AEOSignal {
  signal_name:        string;
  present:            boolean;
  weight:             number;
  label:              string;
  recommendation:     string | null;
}

interface AEOSiteSummary {
  average_score:        number;
  grade:                string;
  signals:              AEOSignal[];
  top_recommendation:   string | null;
  max_score:            number;
}

interface AEOScoreCardProps {
  site_id: string;
}

// ── Grade colors ─────────────────────────────────────────────────────────────

const GRADE_COLORS: Record<string, string> = {
  A: 'text-green-600 bg-green-50 border-green-200',
  B: 'text-blue-600 bg-blue-50 border-blue-200',
  C: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  D: 'text-orange-600 bg-orange-50 border-orange-200',
  F: 'text-red-600 bg-red-50 border-red-200',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function AEOScoreCard({ site_id }: AEOScoreCardProps) {
  const [data, setData] = useState<AEOSiteSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sites/${encodeURIComponent(site_id)}/aeo-score`);
        if (!res.ok) { setLoading(false); return; }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch { /* empty state */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [site_id]);

  if (!loading && !data) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">AEO Score</h3>
        <p className="text-sm text-slate-400">AEO scan not yet run</p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">AEO Score</h3>
        <div className="h-20 bg-slate-100 rounded animate-pulse" />
      </section>
    );
  }

  if (!data) return null;

  const gradeStyle = GRADE_COLORS[data.grade] ?? GRADE_COLORS.F;

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-700">AEO Score<LearnMoreLink article_slug="what-is-aeo" /></h3>
      <p className="text-[11px] text-slate-400 mb-3">
        Answer Engine Optimization — readiness for AI search and voice
      </p>

      <div className="flex items-center gap-4 mb-4">
        {/* Grade letter */}
        <div className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center text-3xl font-bold ${gradeStyle}`}>
          {data.grade}
        </div>
        {/* Score */}
        <div>
          <div className="text-2xl font-bold text-slate-800">
            {data.average_score}<span className="text-sm text-slate-400">/{data.max_score}</span>
          </div>
          <div className="text-[11px] text-slate-500">AEO readiness score</div>
        </div>
      </div>

      {/* Signal checklist */}
      {data.signals && data.signals.length > 0 && (
        <div className="space-y-1 mb-3">
          {data.signals.map(s => (
            <div key={s.signal_name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className={s.present ? 'text-green-600' : 'text-red-400'}>
                  {s.present ? '✓' : '✗'}
                </span>
                <span className="text-slate-700">{s.label}</span>
              </div>
              <span className="text-slate-400">{s.weight}pts</span>
            </div>
          ))}
        </div>
      )}

      {/* Top recommendation */}
      {data.top_recommendation && data.average_score < 100 && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700 mb-3">
          <span className="font-medium">Top opportunity:</span> {data.top_recommendation}
        </div>
      )}

      <p className="text-[10px] text-slate-400 mb-2">
        VAEO will automatically apply missing AEO signals nightly
      </p>
      <a href="#aeo-details" className="text-xs text-blue-600 hover:text-blue-800">
        View AEO details →
      </a>
    </section>
  );
}
