'use client';

interface AEOPanelProps {
  aeo: {
    speakable_pages: number;
    faq_pages: number;
    answer_blocks: number;
  };
}

function MetricCard({ icon, label, count, description }: {
  icon: string;
  label: string;
  count: number;
  description: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-slate-400 uppercase tracking-wide font-medium">{label}</span>
      </div>
      <div className="text-3xl font-bold text-slate-800 tabular-nums">{count}</div>
      <div className="text-xs text-slate-400 mt-1">{description}</div>
    </div>
  );
}

export default function AEOPanel({ aeo }: AEOPanelProps) {
  const total = aeo.speakable_pages + aeo.faq_pages + aeo.answer_blocks;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          icon={'\uD83D\uDD0A'}
          label="Speakable"
          count={aeo.speakable_pages}
          description="Pages with SpeakableSpecification schema"
        />
        <MetricCard
          icon={'\u2753'}
          label="FAQ Pages"
          count={aeo.faq_pages}
          description="Pages with FAQPage schema"
        />
        <MetricCard
          icon={'\uD83D\uDCCB'}
          label="Answer Blocks"
          count={aeo.answer_blocks}
          description="Pages with answer engine schema"
        />
      </div>

      {/* AEO Coverage */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-4">AEO Coverage</h3>
        {total === 0 ? (
          <div className="text-sm text-slate-400">
            No AEO schema deployed yet. Run an AEO scan to identify opportunities.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Total AEO-optimized pages</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">{total}</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
              {aeo.speakable_pages > 0 && (
                <div
                  className="h-2 bg-blue-500"
                  style={{ width: `${(aeo.speakable_pages / total) * 100}%` }}
                  title={`Speakable: ${aeo.speakable_pages}`}
                />
              )}
              {aeo.faq_pages > 0 && (
                <div
                  className="h-2 bg-cyan-500"
                  style={{ width: `${(aeo.faq_pages / total) * 100}%` }}
                  title={`FAQ: ${aeo.faq_pages}`}
                />
              )}
              {aeo.answer_blocks > 0 && (
                <div
                  className="h-2 bg-teal-500"
                  style={{ width: `${(aeo.answer_blocks / total) * 100}%` }}
                  title={`Answer Blocks: ${aeo.answer_blocks}`}
                />
              )}
            </div>
            <div className="flex gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Speakable</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" /> FAQ</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block" /> Answer Blocks</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
