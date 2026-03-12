'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface InfringingDomain {
  domain: string;
  match_count: number;
  max_severity: string;
  avg_similarity: number;
}

interface CopyrightReport {
  report_id: string;
  total_matches: number;
  severity_breakdown: Record<string, number>;
  top_infringing: InfringingDomain[];
  estimated_traffic_impact: number;
  pages_affected: number;
}

interface ScrapeMatch {
  match_id: string;
  original_url: string;
  scraped_url: string;
  scraped_domain: string;
  similarity: number;
  severity: string;
  matched_phrases: string[];
}

interface Fingerprint {
  fingerprint_id: string;
  url: string;
  word_count: number;
  page_type: string;
  content_preview: string;
}

const SEV_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-400',
};

const SEV_TEXT: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
};

export default function CopyrightPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [report, setReport] = useState<CopyrightReport | null>(null);
  const [matches, setMatches] = useState<ScrapeMatch[]>([]);
  const [fingerprints, setFingerprints] = useState<Fingerprint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/copyright/${siteId}`);
        if (!res.ok) return;
        const data = await res.json();
        setReport(data.report);
        setMatches(data.scrapeMatches ?? []);
        setFingerprints(data.fingerprints ?? []);
      } catch { /* non-fatal */ }
      setLoading(false);
    })();
  }, [siteId]);

  if (loading) {
    return <div className="p-8 text-slate-400">Loading copyright protection data...</div>;
  }

  if (!report) {
    return <div className="p-8 text-red-400">Failed to load copyright data.</div>;
  }

  const criticalMatches = matches.filter((m) => m.severity === 'critical' || m.severity === 'high');

  return (
    <div className="p-8 max-w-screen-xl mx-auto space-y-8">
      {/* Banner */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-2 text-sm text-yellow-300">
        Simulated data — connect a live site for real copyright monitoring.
      </div>

      <h1 className="text-2xl font-bold text-white">Content Protection</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#1a2236] rounded-lg p-5">
          <div className="text-sm text-slate-400 mb-1">Scrape Matches</div>
          <div className="text-3xl font-bold text-white">{report.total_matches}</div>
        </div>
        <div className="bg-[#1a2236] rounded-lg p-5">
          <div className="text-sm text-slate-400 mb-1">Pages Affected</div>
          <div className="text-3xl font-bold text-white">{report.pages_affected}</div>
        </div>
        <div className="bg-[#1a2236] rounded-lg p-5">
          <div className="text-sm text-slate-400 mb-1">Est. Traffic Impact</div>
          <div className="text-3xl font-bold text-red-400">-{report.estimated_traffic_impact}</div>
          <div className="text-xs text-slate-500">visits/mo lost to scrapers</div>
        </div>
        <div className="bg-[#1a2236] rounded-lg p-5">
          <div className="text-sm text-slate-400 mb-1">Fingerprinted Pages</div>
          <div className="text-3xl font-bold text-emerald-400">{fingerprints.length}</div>
        </div>
      </div>

      {/* Severity breakdown */}
      <div className="bg-[#1a2236] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Severity Breakdown</h2>
        <div className="grid grid-cols-4 gap-4">
          {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
            <div key={sev} className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${SEV_COLORS[sev]}`} />
              <div>
                <div className="text-sm font-medium text-white capitalize">{sev}</div>
                <div className={`text-2xl font-bold ${SEV_TEXT[sev]}`}>
                  {report.severity_breakdown[sev] ?? 0}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top infringing domains */}
      <div className="bg-[#1a2236] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Top Infringing Domains</h2>
        {report.top_infringing.length === 0 ? (
          <p className="text-slate-400 text-sm">No infringing domains detected.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="text-left py-2">Domain</th>
                <th className="text-left py-2">Matches</th>
                <th className="text-left py-2">Max Severity</th>
                <th className="text-left py-2">Avg Similarity</th>
              </tr>
            </thead>
            <tbody>
              {report.top_infringing.map((d) => (
                <tr key={d.domain} className="border-b border-slate-800">
                  <td className="py-2 text-white font-mono">{d.domain}</td>
                  <td className="py-2 text-white">{d.match_count}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEV_COLORS[d.max_severity]} text-white`}>
                      {d.max_severity}
                    </span>
                  </td>
                  <td className="py-2 text-white">{(d.avg_similarity * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Critical / high matches detail */}
      {criticalMatches.length > 0 && (
        <div className="bg-[#1a2236] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Critical & High Severity Matches ({criticalMatches.length})
          </h2>
          <div className="space-y-3">
            {criticalMatches.slice(0, 10).map((m) => (
              <div key={m.match_id} className="bg-[#0f1729] rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEV_COLORS[m.severity]} text-white`}>
                    {m.severity}
                  </span>
                  <span className="text-white font-medium text-sm">{(m.similarity * 100).toFixed(0)}% match</span>
                </div>
                <div className="text-xs text-slate-400 mb-1">
                  Original: <span className="text-slate-300 font-mono">{m.original_url}</span>
                </div>
                <div className="text-xs text-slate-400 mb-2">
                  Scraped: <span className="text-red-300 font-mono">{m.scraped_url}</span>
                </div>
                {m.matched_phrases.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {m.matched_phrases.map((p, i) => (
                      <span key={i} className="bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded">
                        &ldquo;{p}&rdquo;
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="bg-[#1a2236] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Recommendations</h2>
        <ul className="space-y-2 text-sm text-slate-300">
          {report.severity_breakdown.critical > 0 && (
            <li className="flex gap-2">
              <span className="text-red-400 font-bold">!</span>
              File DMCA takedown notices for {report.severity_breakdown.critical} critical matches — these are near-exact copies of your content.
            </li>
          )}
          {report.severity_breakdown.high > 0 && (
            <li className="flex gap-2">
              <span className="text-orange-400 font-bold">!</span>
              Review {report.severity_breakdown.high} high-severity matches for potential content theft and contact site owners.
            </li>
          )}
          <li className="flex gap-2">
            <span className="text-blue-400">→</span>
            Add canonical tags to all pages to signal original authorship to search engines.
          </li>
          <li className="flex gap-2">
            <span className="text-blue-400">→</span>
            Enable content fingerprinting on new pages to detect scraping within 24 hours.
          </li>
          <li className="flex gap-2">
            <span className="text-blue-400">→</span>
            Consider adding structured data (Article schema with datePublished) to establish content provenance.
          </li>
        </ul>
      </div>
    </div>
  );
}
