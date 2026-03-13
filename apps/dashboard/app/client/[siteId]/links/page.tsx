'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import LinkTreeMap from '@/components/LinkTreeMap';
import LinkNodeDetail from '@/components/LinkNodeDetail';
import LinkGraphExport from '@/components/LinkGraphExport';

// ── Types (inlined) ──────────────────────────────────────────────────────────

type AuthorityTier = 'hub' | 'strong' | 'average' | 'weak' | 'isolated';
type LinkType = 'body_content' | 'navigation' | 'footer' | 'breadcrumb' | 'sidebar' | 'pagination';

interface PageNode {
  url: string; title: string | null; depth: number;
  inbound_internal_count: number; outbound_internal_count: number;
  is_orphaned: boolean; is_dead_end: boolean; is_in_sitemap: boolean;
  health_score: number | null; outbound_link_count: number; link_limit: number;
}

interface InternalLink {
  source_url: string; destination_url: string; anchor_text: string;
  link_type: LinkType; is_nofollow: boolean; is_redirect: boolean;
}

interface AuthorityScore { url: string; score: number; authority_tier: AuthorityTier; }
interface AnchorTextProfile { url: string; diversity_score: number; dominant_anchor: string; has_generic_anchors: boolean; generic_anchor_count: number; is_over_optimized: boolean; }
interface EquityLeak { url: string; total_links: number; equity_per_link: number; severity: 'low' | 'medium' | 'high'; recommendations: string[]; }
interface LinkSuggestion { source_url: string; destination_url: string; suggested_anchor: string; priority: 'high' | 'medium' | 'low'; reason: string; }
interface RedirectChain { source_page: string; linked_url: string; final_url: string; hops: number; }

interface LinkGraph { page_nodes: PageNode[]; internal_links: InternalLink[]; }
interface AnalysisData {
  authority_scores: AuthorityScore[]; anchor_profiles: AnchorTextProfile[];
  equity_leaks: EquityLeak[]; suggestions: LinkSuggestion[];
  redirect_chains: RedirectChain[];
}

type TabKey = 'treemap' | 'orphaned' | 'dead_ends' | 'deep' | 'redirects' | 'anchors' | 'opportunities' | 'external';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'treemap', label: 'Tree Map' },
  { key: 'orphaned', label: 'Orphaned Pages' },
  { key: 'dead_ends', label: 'Dead Ends' },
  { key: 'deep', label: 'Deep Pages' },
  { key: 'redirects', label: 'Redirect Chains' },
  { key: 'anchors', label: 'Anchor Text' },
  { key: 'opportunities', label: 'Link Opportunities' },
  { key: 'external', label: 'External Links' },
];

export default function LinksPage() {
  const params = useParams();
  const siteId = typeof params?.siteId === 'string' ? params.siteId : '';

  const [graph, setGraph] = useState<LinkGraph | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [tab, setTab] = useState<TabKey>('treemap');
  const [selectedNode, setSelectedNode] = useState<PageNode | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    Promise.all([
      fetch(`/api/sites/${siteId}/link-graph`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/sites/${siteId}/link-graph/analysis`).then((r) => r.ok ? r.json() : null),
    ])
      .then(([g, a]) => { setGraph(g); setAnalysis(a); })
      .catch(() => setError(true));
  }, [siteId]);

  if (error) {
    return <div className="p-6 text-sm text-red-500">Failed to load link graph.</div>;
  }
  if (!graph) {
    return <div className="p-6 text-sm text-slate-400">Loading link graph...</div>;
  }

  const nodes = graph.page_nodes;
  const orphaned = nodes.filter((n) => n.is_orphaned);
  const deadEnds = nodes.filter((n) => n.is_dead_end);
  const deep = nodes.filter((n) => n.depth > 3).sort((a, b) => b.depth - a.depth);
  const scoreMap = new Map((analysis?.authority_scores ?? []).map((s) => [s.url, s]));
  const anchorMap = new Map((analysis?.anchor_profiles ?? []).map((p) => [p.url, p]));
  const equityMap = new Map((analysis?.equity_leaks ?? []).map((e) => [e.url, e]));
  const suggestions = analysis?.suggestions ?? [];
  const redirectChains = analysis?.redirect_chains ?? [];

  function handleNodeClick(node: PageNode) {
    setSelectedNode(node);
  }

  function getInbound(url: string) {
    return graph!.internal_links.filter((l) => l.destination_url === url);
  }
  function getOutbound(url: string) {
    return graph!.internal_links.filter((l) => l.source_url === url);
  }
  function getNodeSuggestions(url: string) {
    return suggestions.filter((s) => s.destination_url === url || s.source_url === url);
  }

  // Summary counts
  const orphanedCount = orphaned.length;
  const deadEndCount = deadEnds.length;
  const deepCount = deep.length;
  const suggestionsCount = suggestions.length;

  try {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Summary bar */}
        <div className="flex flex-wrap gap-4 mb-4 text-sm">
          <button onClick={() => setTab('treemap')} className="text-slate-600 hover:text-blue-600">
            <strong>{nodes.length}</strong> Pages
          </button>
          <button onClick={() => setTab('orphaned')} className="text-red-600 hover:underline">
            <strong>{orphanedCount}</strong> Orphaned
          </button>
          <button onClick={() => setTab('dead_ends')} className="text-orange-600 hover:underline">
            <strong>{deadEndCount}</strong> Dead Ends
          </button>
          <button onClick={() => setTab('deep')} className="text-yellow-600 hover:underline">
            <strong>{deepCount}</strong> Deep Pages
          </button>
          <button onClick={() => setTab('redirects')} className="text-slate-600 hover:underline">
            <strong>{redirectChains.length}</strong> Redirect Chains
          </button>
          <button onClick={() => setTab('opportunities')} className="text-blue-600 hover:underline">
            <strong>{suggestionsCount}</strong> Opportunities
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 ${
                tab === t.key
                  ? 'border-blue-500 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'treemap' && (
          <div>
            <div className="mb-3">
              <LinkGraphExport site_id={siteId} graph={graph} suggestions={suggestions} />
            </div>
            <LinkTreeMap
              site_id={siteId}
              graph={graph}
              authority_scores={analysis?.authority_scores ?? []}
              onNodeClick={handleNodeClick}
            />
          </div>
        )}

        {tab === 'orphaned' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b">
                  <th className="pb-2 pr-3">URL</th>
                  <th className="pb-2 pr-3">Title</th>
                  <th className="pb-2 pr-3">In Sitemap</th>
                  <th className="pb-2">Depth</th>
                </tr>
              </thead>
              <tbody>
                {orphaned.sort((a, b) => (b.is_in_sitemap ? 1 : 0) - (a.is_in_sitemap ? 1 : 0)).map((n) => (
                  <tr key={n.url} className="border-b border-slate-100 text-slate-600">
                    <td className="py-2 pr-3 truncate max-w-xs">{n.url.replace(/^https?:\/\//, '')}</td>
                    <td className="py-2 pr-3 truncate max-w-xs">{n.title ?? '—'}</td>
                    <td className="py-2 pr-3">{n.is_in_sitemap ? 'Yes' : 'No'}</td>
                    <td className="py-2">{n.depth}</td>
                  </tr>
                ))}
                {orphaned.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-slate-400 text-center">No orphaned pages found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'dead_ends' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b">
                  <th className="pb-2 pr-3">URL</th>
                  <th className="pb-2 pr-3">Title</th>
                  <th className="pb-2 pr-3">Inbound Links</th>
                  <th className="pb-2">Authority</th>
                </tr>
              </thead>
              <tbody>
                {deadEnds.sort((a, b) => (scoreMap.get(b.url)?.score ?? 0) - (scoreMap.get(a.url)?.score ?? 0)).map((n) => (
                  <tr key={n.url} className="border-b border-slate-100 text-slate-600">
                    <td className="py-2 pr-3 truncate max-w-xs">{n.url.replace(/^https?:\/\//, '')}</td>
                    <td className="py-2 pr-3 truncate max-w-xs">{n.title ?? '—'}</td>
                    <td className="py-2 pr-3">{n.inbound_internal_count}</td>
                    <td className="py-2">{scoreMap.get(n.url)?.score ?? '—'}</td>
                  </tr>
                ))}
                {deadEnds.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-slate-400 text-center">No dead end pages found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'deep' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b">
                  <th className="pb-2 pr-3">URL</th>
                  <th className="pb-2 pr-3">Title</th>
                  <th className="pb-2">Depth</th>
                </tr>
              </thead>
              <tbody>
                {deep.map((n) => (
                  <tr key={n.url} className="border-b border-slate-100 text-slate-600">
                    <td className="py-2 pr-3 truncate max-w-xs">{n.url.replace(/^https?:\/\//, '')}</td>
                    <td className="py-2 pr-3 truncate max-w-xs">{n.title ?? '—'}</td>
                    <td className="py-2">{n.depth}</td>
                  </tr>
                ))}
                {deep.length === 0 && (
                  <tr><td colSpan={3} className="py-4 text-slate-400 text-center">No deep pages found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'redirects' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b">
                  <th className="pb-2 pr-3">Source Page</th>
                  <th className="pb-2 pr-3">Linked URL</th>
                  <th className="pb-2 pr-3">Final URL</th>
                  <th className="pb-2">Hops</th>
                </tr>
              </thead>
              <tbody>
                {redirectChains.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 text-slate-600">
                    <td className="py-2 pr-3 truncate max-w-xs">{r.source_page.replace(/^https?:\/\//, '')}</td>
                    <td className="py-2 pr-3 truncate max-w-xs">{r.linked_url.replace(/^https?:\/\//, '')}</td>
                    <td className="py-2 pr-3 truncate max-w-xs">{r.final_url.replace(/^https?:\/\//, '')}</td>
                    <td className="py-2">{r.hops}</td>
                  </tr>
                ))}
                {redirectChains.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-slate-400 text-center">No redirect chains found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'anchors' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b">
                  <th className="pb-2 pr-3">URL</th>
                  <th className="pb-2 pr-3">Diversity</th>
                  <th className="pb-2 pr-3">Dominant Anchor</th>
                  <th className="pb-2 pr-3">Generic</th>
                  <th className="pb-2">Over-optimized</th>
                </tr>
              </thead>
              <tbody>
                {(analysis?.anchor_profiles ?? [])
                  .sort((a, b) => b.generic_anchor_count - a.generic_anchor_count)
                  .map((p) => (
                    <tr key={p.url} className="border-b border-slate-100 text-slate-600">
                      <td className="py-2 pr-3 truncate max-w-xs">{p.url.replace(/^https?:\/\//, '')}</td>
                      <td className="py-2 pr-3">{p.diversity_score}/100</td>
                      <td className="py-2 pr-3 truncate max-w-xs">{p.dominant_anchor}</td>
                      <td className="py-2 pr-3">{p.generic_anchor_count}</td>
                      <td className="py-2">{p.is_over_optimized ? <span className="text-red-500">Yes</span> : 'No'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'opportunities' && (
          <div className="space-y-3">
            {suggestions.map((s, i) => (
              <div key={i} className="p-3 border border-slate-200 rounded-lg">
                <span className={`inline-block px-2 py-0.5 text-xs rounded-full mb-1 ${
                  s.priority === 'high' ? 'bg-red-100 text-red-700' :
                  s.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>{s.priority}</span>
                <p className="text-xs text-slate-700 font-medium">{s.reason}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {s.source_url.replace(/^https?:\/\//, '').slice(0, 50)} → {s.destination_url.replace(/^https?:\/\//, '').slice(0, 50)}
                </p>
                {s.suggested_anchor && (
                  <p className="text-xs text-slate-400">Anchor: "{s.suggested_anchor}"</p>
                )}
              </div>
            ))}
            {suggestions.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">No link opportunities found</p>
            )}
          </div>
        )}

        {tab === 'external' && (
          <div className="text-sm text-slate-400 text-center py-8">
            External link analysis will appear here after the next crawl.
          </div>
        )}

        {/* Node detail panel */}
        {selectedNode && (
          <LinkNodeDetail
            node={selectedNode}
            inbound_links={getInbound(selectedNode.url)}
            outbound_links={getOutbound(selectedNode.url)}
            authority_score={scoreMap.get(selectedNode.url) ?? null}
            anchor_profile={anchorMap.get(selectedNode.url) ?? null}
            equity_leak={equityMap.get(selectedNode.url) ?? null}
            suggestions={getNodeSuggestions(selectedNode.url)}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    );
  } catch {
    return <div className="p-6 text-sm text-red-500">Unable to render link graph page.</div>;
  }
}
