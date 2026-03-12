'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────────────

interface Score {
  score: number;
  score_label: string;
  score_color: string;
  citation_rate: number;
  branded_score: number;
  product_score: number;
  informational_score: number;
}

interface HistoryPoint { date: string; score: number }

interface CitedQuery {
  query: string;
  source: string;
  position: number;
  confidence: number;
}

interface MissedOpp {
  gap_id: string;
  query: string;
  competitor_domain: string;
  opportunity_score: number;
  recommendation: string;
}

interface SchemaOpp {
  opportunity_id: string;
  url: string;
  page_type: string;
  missing_schema_types: string[];
  ai_impact_score: number;
  priority: string;
  reasoning: string;
  can_auto_fix: boolean;
}

interface Breakdown {
  branded: { rate: number; checked: number; cited: number };
  product: { rate: number; checked: number; cited: number };
  informational: { rate: number; checked: number; cited: number };
}

interface VisibilityData {
  score: Score;
  history: HistoryPoint[];
  citedQueries: CitedQuery[];
  missedOpportunities: MissedOpp[];
  schemaOpportunities: SchemaOpp[];
  recommendations: string[];
  breakdown: Breakdown;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SCORE_COLORS: Record<string, string> = {
  green: 'text-green-600 bg-green-50 border-green-200',
  blue: 'text-blue-600 bg-blue-50 border-blue-200',
  amber: 'text-amber-600 bg-amber-50 border-amber-200',
  red: 'text-red-600 bg-red-50 border-red-200',
  gray: 'text-gray-600 bg-gray-50 border-gray-200',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-gray-100 text-gray-600',
};

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const w = 200;
  const h = 40;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} className="inline-block">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500" />
    </svg>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AIVisibilityPage() {
  const params = useParams();
  const siteId = params.siteId as string;
  const [data, setData] = useState<VisibilityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/ai-visibility/${siteId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="p-8 space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-80" />
        <div className="h-40 bg-gray-200 rounded" />
        <div className="h-64 bg-gray-200 rounded" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Failed to load AI visibility data.</p>
        <Link href={`/client/${siteId}`} className="text-blue-600 hover:underline text-sm mt-2 inline-block">Back to site</Link>
      </div>
    );
  }

  const { score, history, citedQueries, missedOpportunities, schemaOpportunities, recommendations, breakdown } = data;
  const colorClass = SCORE_COLORS[score.score_color] ?? SCORE_COLORS.gray;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Visibility Monitor</h1>
          <p className="text-gray-500 text-sm mt-0.5">{siteId}.myshopify.com — Track how often your site appears in AI-generated answers</p>
        </div>
        <Link href={`/client/${siteId}`} className="text-blue-600 hover:underline text-sm">Back to site</Link>
      </div>

      {/* AI Visibility Score card */}
      <div className={`border rounded-xl p-6 ${colorClass}`}>
        <div className="flex items-center gap-8">
          <div>
            <div className="text-6xl font-bold">{score.score}</div>
            <div className="text-sm font-medium mt-1">{score.score_label}</div>
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium mb-2">30-Day Trend</div>
            <Sparkline points={history.map((h) => h.score)} />
          </div>
          <div className="text-right text-xs opacity-70">
            <p>Powered by Perplexity simulation</p>
            <p className="mt-1 max-w-[240px]">This score measures how often your site is cited when AI tools answer questions about your products</p>
          </div>
        </div>
      </div>

      {/* Citation breakdown */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-5">
          <div className="text-2xl font-bold">{breakdown.branded.cited}/{breakdown.branded.checked}</div>
          <div className="text-xs text-gray-500 mt-1">Branded Queries Cited</div>
          <div className="text-xs text-gray-400">Rate: {Math.round(breakdown.branded.rate * 100)}%</div>
        </div>
        <div className="bg-white border rounded-lg p-5">
          <div className="text-2xl font-bold">{breakdown.product.cited}/{breakdown.product.checked}</div>
          <div className="text-xs text-gray-500 mt-1">Product Queries Cited</div>
          <div className="text-xs text-gray-400">Rate: {Math.round(breakdown.product.rate * 100)}%</div>
        </div>
        <div className="bg-white border rounded-lg p-5">
          <div className="text-2xl font-bold">{breakdown.informational.cited}/{breakdown.informational.checked}</div>
          <div className="text-xs text-gray-500 mt-1">Informational Queries Cited</div>
          <div className="text-xs text-gray-400">Rate: {Math.round(breakdown.informational.rate * 100)}%</div>
        </div>
      </div>

      {/* Top cited queries */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Top Cited Queries</h2>
        {citedQueries.length === 0 ? (
          <div className="bg-white border rounded-lg p-6 text-center text-gray-400">
            No citations detected yet — see recommendations below
          </div>
        ) : (
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Query</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Source</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Position</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {citedQueries.map((q, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{q.query}</td>
                    <td className="px-4 py-2 text-gray-500">{q.source}</td>
                    <td className="px-4 py-2 text-right">#{q.position}</td>
                    <td className="px-4 py-2 text-right">{Math.round(q.confidence * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Missed opportunities */}
      {missedOpportunities.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Missed Opportunities</h2>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Query</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Competitor Cited</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Opp. Score</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {missedOpportunities.map((m) => (
                  <tr key={m.gap_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{m.query}</td>
                    <td className="px-4 py-2 text-gray-500">{m.competitor_domain}</td>
                    <td className="px-4 py-2 text-right">
                      <span className="text-red-600 font-medium">{m.opportunity_score}</span>
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/client/${siteId}/suggestions`}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        Add Schema
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Schema opportunities */}
      {schemaOpportunities.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Schema Opportunities</h2>
          <div className="space-y-2">
            {schemaOpportunities.map((o) => (
              <div key={o.opportunity_id} className="bg-white border rounded-lg p-4 flex items-center gap-4">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[o.priority] ?? ''}`}>
                  {o.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{o.url}</div>
                  <div className="text-xs text-gray-500">
                    {o.page_type} — Missing: {o.missing_schema_types.join(', ')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-blue-600">{o.ai_impact_score}</div>
                  <div className="text-[10px] text-gray-400">impact score</div>
                </div>
                {o.can_auto_fix && (
                  <button className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">
                    Auto-Fix
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-3">Recommendations</h2>
          <ul className="space-y-2">
            {recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-blue-500 mt-0.5">&#x2192;</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
