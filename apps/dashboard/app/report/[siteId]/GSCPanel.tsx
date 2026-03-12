'use client';

interface GSCPanelProps {
  gsc: {
    total_clicks_28d: number;
    total_impressions_28d: number;
    avg_position: number;
    top_pages: Array<{
      url: string;
      clicks: number;
      impressions: number;
      position: number;
    }>;
  };
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function GSCPanel({ gsc }: GSCPanelProps) {
  if (gsc.total_clicks_28d === 0 && gsc.total_impressions_28d === 0 && gsc.top_pages.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <div className="text-sm text-slate-500 font-medium mb-1">Connect Google Search Console</div>
        <div className="text-xs text-slate-400">
          Link your GSC property to see click, impression, and ranking data.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Clicks (28d)</div>
          <div className="text-3xl font-bold text-slate-800 tabular-nums">
            {formatNumber(gsc.total_clicks_28d)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Impressions (28d)</div>
          <div className="text-3xl font-bold text-slate-800 tabular-nums">
            {formatNumber(gsc.total_impressions_28d)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Avg Position</div>
          <div className="text-3xl font-bold text-slate-800 tabular-nums">
            {gsc.avg_position.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Top pages table */}
      {gsc.top_pages.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide">Top Pages</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-400 uppercase tracking-wide">
                <th className="px-5 py-2 font-medium">URL</th>
                <th className="px-5 py-2 font-medium text-right">Clicks</th>
                <th className="px-5 py-2 font-medium text-right">Impressions</th>
                <th className="px-5 py-2 font-medium text-right">Position</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {gsc.top_pages.slice(0, 5).map((page, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-2.5 text-slate-700 truncate max-w-xs" title={page.url}>
                    {page.url.replace(/^https?:\/\/[^/]+/, '')}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">
                    {formatNumber(page.clicks)}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">
                    {formatNumber(page.impressions)}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">
                    {page.position.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
