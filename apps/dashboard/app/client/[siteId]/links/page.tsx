'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import LinkTreeMap from '@/components/LinkTreeMap';
import LinkNodeDetail from '@/components/LinkNodeDetail';
import LinkGraphExport from '@/components/LinkGraphExport';
import LinkVelocityPanel from '@/components/LinkVelocityPanel';
import { getReputationBadge, getBrokenLinkSeverity, formatResponseTime } from '@/lib/external_link_display';

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

type DomainReputation = 'trusted' | 'unknown' | 'low_value' | 'spammy' | 'unchecked';
interface ExternalCheckResult {
  url: string; destination_url: string; destination_domain: string;
  status_code: number | null; is_broken: boolean; is_redirect: boolean;
  final_url: string | null; redirect_hops: number; response_time_ms: number;
  is_nofollow: boolean; domain_reputation: DomainReputation;
  check_error: string | null; checked_at: string;
}
interface ExternalAuditData {
  results: ExternalCheckResult[];
  summary: {
    total_checked: number; broken_count: number; redirect_count: number;
    low_value_domain_count: number; trusted_domain_count: number;
    domains_by_link_count: Array<{ domain: string; count: number }>;
  };
}

interface CanonicalConflict { source_url: string; linked_url: string; canonical_url: string | null; conflict_type: string; equity_impact: string; fix_action: string; fix_href: string | null; description: string; }
interface LinkLimitViolation { url: string; title: string | null; total_links: number; over_limit_by: number; severity: string; recommendations: string[]; }

type TabKey = 'treemap' | 'orphaned' | 'dead_ends' | 'deep' | 'redirects' | 'canonical' | 'anchors' | 'link_limits' | 'opportunities' | 'velocity' | 'external';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'treemap', label: 'Tree Map' },
  { key: 'orphaned', label: 'Orphaned Pages' },
  { key: 'dead_ends', label: 'Dead Ends' },
  { key: 'deep', label: 'Deep Pages' },
  { key: 'redirects', label: 'Redirect Chains' },
  { key: 'canonical', label: 'Canonical Conflicts' },
  { key: 'anchors', label: 'Anchor Text' },
  { key: 'link_limits', label: 'Link Limits' },
  { key: 'opportunities', label: 'Link Opportunities' },
  { key: 'velocity', label: 'Velocity' },
  { key: 'external', label: 'External Links' },
];

export default function LinksPage() {
  const params = useParams();
  const siteId = typeof params?.siteId === 'string' ? params.siteId : '';

  const [graph, setGraph] = useState<LinkGraph | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [externalAudit, setExternalAudit] = useState<ExternalAuditData | null>(null);
  const [fixConfirm, setFixConfirm] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('treemap');
  const [selectedNode, setSelectedNode] = useState<PageNode | null>(null);
  const [error, setError] = useState(false);
  const [canonicalConflicts, setCanonicalConflicts] = useState<CanonicalConflict[]>([]);
  const [canonicalSummary, setCanonicalSummary] = useState<{ total_conflicts: number; high_impact_count: number; fixable_count: number }>({ total_conflicts: 0, high_impact_count: 0, fixable_count: 0 });
  const [linkLimitViolations, setLinkLimitViolations] = useState<LinkLimitViolation[]>([]);

  useEffect(() => {
    if (!siteId) return;
    Promise.all([
      fetch(`/api/sites/${siteId}/link-graph`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/sites/${siteId}/link-graph/analysis`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/sites/${siteId}/link-graph/canonical-conflicts`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/sites/${siteId}/link-graph/link-limits`).then((r) => r.ok ? r.json() : null),
    ])
      .then(([g, a, cc, ll]) => {
        setGraph(g); setAnalysis(a);
        if (cc) { setCanonicalConflicts(cc.conflicts ?? []); setCanonicalSummary({ total_conflicts: cc.total_conflicts ?? 0, high_impact_count: cc.high_impact_count ?? 0, fixable_count: cc.fixable_count ?? 0 }); }
        if (ll) setLinkLimitViolations(ll.violations ?? []);
      })
      .catch(() => setError(true));
  }, [siteId]);

  useEffect(() => {
    if (!siteId || tab !== 'external') return;
    fetch(`/api/sites/${siteId}/link-graph/external-audit`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setExternalAudit(d); })
      .catch(() => {});
  }, [siteId, tab]);

  async function applyFix(fix: { fix_type: string; source_url: string; original_href: string; replacement_href: string | null }) {
    try {
      await fetch(`/api/sites/${siteId}/link-graph/fix-external`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fix }),
      });
      setFixConfirm(null);
    } catch { /* non-fatal */ }
  }

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

        {tab === 'canonical' && (
          <div>
            <div className="flex gap-4 mb-4 text-xs">
              <span className="text-red-600"><strong>{canonicalSummary.high_impact_count}</strong> High Impact</span>
              <span className="text-green-600"><strong>{canonicalSummary.fixable_count}</strong> Auto-fixable</span>
              <span className="text-slate-500"><strong>{canonicalSummary.total_conflicts}</strong> Total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b">
                    <th className="pb-2 pr-3">Source Page</th>
                    <th className="pb-2 pr-3">Linked URL</th>
                    <th className="pb-2 pr-3">Canonical</th>
                    <th className="pb-2 pr-3">Type</th>
                    <th className="pb-2 pr-3">Impact</th>
                    <th className="pb-2">Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {canonicalConflicts.map((c, i) => (
                    <tr key={i} className="border-b border-slate-100 text-slate-600">
                      <td className="py-2 pr-3 truncate max-w-[160px]">{c.source_url.replace(/^https?:\/\//, '')}</td>
                      <td className="py-2 pr-3 truncate max-w-[160px]">{c.linked_url.replace(/^https?:\/\//, '')}</td>
                      <td className="py-2 pr-3 truncate max-w-[160px]">{c.canonical_url?.replace(/^https?:\/\//, '') ?? '—'}</td>
                      <td className="py-2 pr-3">{c.conflict_type.replace(/_/g, ' ')}</td>
                      <td className="py-2 pr-3"><span className={c.equity_impact === 'high' ? 'text-red-600' : c.equity_impact === 'medium' ? 'text-orange-600' : 'text-yellow-600'}>{c.equity_impact}</span></td>
                      <td className="py-2">{c.fix_action === 'update_link_to_canonical' ? <button className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100">Update Link</button> : <span className="text-slate-400">{c.fix_action === 'investigate' ? 'Review' : 'Add Canonical'}</span>}</td>
                    </tr>
                  ))}
                  {canonicalConflicts.length === 0 && (
                    <tr><td colSpan={6} className="py-4 text-slate-400 text-center">No canonical conflicts found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'link_limits' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b">
                  <th className="pb-2 pr-3">URL</th>
                  <th className="pb-2 pr-3">Title</th>
                  <th className="pb-2 pr-3">Total Links</th>
                  <th className="pb-2 pr-3">Over By</th>
                  <th className="pb-2 pr-3">Severity</th>
                  <th className="pb-2">Recommendations</th>
                </tr>
              </thead>
              <tbody>
                {linkLimitViolations.map((v, i) => (
                  <tr key={i} className="border-b border-slate-100 text-slate-600">
                    <td className="py-2 pr-3 truncate max-w-[200px]">{v.url.replace(/^https?:\/\//, '')}</td>
                    <td className="py-2 pr-3 truncate max-w-[150px]">{v.title ?? '—'}</td>
                    <td className="py-2 pr-3">{v.total_links}</td>
                    <td className="py-2 pr-3">+{v.over_limit_by}</td>
                    <td className="py-2 pr-3"><span className={v.severity === 'critical' ? 'text-red-600' : v.severity === 'high' ? 'text-orange-600' : 'text-yellow-600'}>{v.severity}</span></td>
                    <td className="py-2">{v.recommendations.length > 0 ? <ul className="space-y-0.5">{v.recommendations.map((r, j) => <li key={j}>• {r}</li>)}</ul> : '—'}</td>
                  </tr>
                ))}
                {linkLimitViolations.length === 0 && (
                  <tr><td colSpan={6} className="py-4 text-slate-400 text-center">No link limit violations found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'velocity' && (
          <LinkVelocityPanel site_id={siteId} />
        )}

        {tab === 'external' && (
          <div className="space-y-6">
            {externalAudit?.summary && (
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-red-600 font-semibold">{externalAudit.summary.broken_count} Broken</span>
                <span className="text-yellow-600 font-semibold">{externalAudit.summary.redirect_count} Redirected</span>
                <span className="text-orange-600 font-semibold">{externalAudit.summary.low_value_domain_count} Low-value</span>
                <span className="text-green-600 font-semibold">{externalAudit.summary.trusted_domain_count} Trusted</span>
              </div>
            )}
            {externalAudit && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Domains</h3>
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-slate-400 border-b"><th className="pb-2 pr-3">Domain</th><th className="pb-2 pr-3">Links</th><th className="pb-2 pr-3">Reputation</th><th className="pb-2">Status</th></tr></thead>
                  <tbody>
                    {[...externalAudit.results].filter((r,i,arr)=>arr.findIndex(x=>x.destination_domain===r.destination_domain)===i).sort((a,b)=>{if(a.is_broken&&!b.is_broken)return -1;if(!a.is_broken&&b.is_broken)return 1;if(a.domain_reputation==='low_value'&&b.domain_reputation!=='low_value')return -1;return 0;}).map((r)=>{
                      const badge=getReputationBadge(r.domain_reputation);
                      const count=externalAudit.summary.domains_by_link_count.find(d=>d.domain===r.destination_domain)?.count??1;
                      return(<tr key={r.destination_domain} className="border-b border-slate-100 text-slate-600"><td className="py-2 pr-3 font-mono">{r.destination_domain}</td><td className="py-2 pr-3">{count}</td><td className="py-2 pr-3 font-medium">{badge.label}</td><td className="py-2">{r.is_broken?<span className="text-red-600">Broken</span>:r.is_redirect?<span className="text-yellow-600">Redirect</span>:<span className="text-slate-400">OK</span>}</td></tr>);
                    })}
                    {externalAudit.results.length===0&&(<tr><td colSpan={4} className="py-4 text-slate-400 text-center">No external links audited yet</td></tr>)}
                  </tbody>
                </table>
              </div>
            )}
            {externalAudit&&externalAudit.results.filter(r=>r.is_broken).length>0&&(
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Broken Links</h3>
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-slate-400 border-b"><th className="pb-2 pr-3">Source Page</th><th className="pb-2 pr-3">Destination</th><th className="pb-2 pr-3">Status</th><th className="pb-2 pr-3">Error</th><th className="pb-2">Fix</th></tr></thead>
                  <tbody>
                    {externalAudit.results.filter(r=>r.is_broken).map((r,i)=>(
                      <tr key={i} className="border-b border-slate-100 text-slate-600"><td className="py-2 pr-3 truncate max-w-xs">{r.url.replace(/^https?:\/\//,'')}</td><td className="py-2 pr-3 truncate max-w-xs">{r.destination_url.replace(/^https?:\/\//,'')}</td><td className="py-2 pr-3">{r.status_code??'—'}</td><td className="py-2 pr-3">{r.check_error??'—'}</td>
                      <td className="py-2">{fixConfirm===`broken-${i}`?(<span className="flex gap-1"><button onClick={()=>applyFix({fix_type:'remove_link',source_url:r.url,original_href:r.destination_url,replacement_href:null})} className="text-red-600 underline text-xs">Confirm</button><button onClick={()=>setFixConfirm(null)} className="text-slate-400 text-xs">Cancel</button></span>):(<button onClick={()=>setFixConfirm(`broken-${i}`)} className="px-2 py-0.5 text-xs bg-red-50 text-red-700 rounded border border-red-200">Remove Link</button>)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {externalAudit&&externalAudit.results.filter(r=>r.is_redirect).length>0&&(
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Redirect Chains</h3>
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-slate-400 border-b"><th className="pb-2 pr-3">Source Page</th><th className="pb-2 pr-3">Current Href</th><th className="pb-2 pr-3">Final URL</th><th className="pb-2 pr-3">Hops</th><th className="pb-2">Fix</th></tr></thead>
                  <tbody>
                    {externalAudit.results.filter(r=>r.is_redirect).map((r,i)=>(
                      <tr key={i} className="border-b border-slate-100 text-slate-600"><td className="py-2 pr-3 truncate max-w-[140px]">{r.url.replace(/^https?:\/\//,'')}</td><td className="py-2 pr-3 truncate max-w-[140px]">{r.destination_url.replace(/^https?:\/\//,'')}</td><td className="py-2 pr-3 truncate max-w-[140px]">{(r.final_url??'').replace(/^https?:\/\//,'')}</td><td className="py-2 pr-3">{r.redirect_hops}</td><td className="py-2">{r.final_url&&(<button onClick={()=>applyFix({fix_type:'update_to_final_url',source_url:r.url,original_href:r.destination_url,replacement_href:r.final_url})} className="px-2 py-0.5 text-xs bg-yellow-50 text-yellow-700 rounded border border-yellow-200">Update to Final URL</button>)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {externalAudit&&externalAudit.results.filter(r=>r.domain_reputation==='low_value'&&!r.is_nofollow).length>0&&(
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Low-value Domains</h3>
                <div className="space-y-1">
                  {[...new Set(externalAudit.results.filter(r=>r.domain_reputation==='low_value'&&!r.is_nofollow).map(r=>r.destination_domain))].map((domain)=>{
                    const count=externalAudit.results.filter(r=>r.destination_domain===domain).length;
                    return(<div key={domain} className="flex items-center gap-3 p-2 bg-orange-50 border border-orange-100 rounded text-xs"><span className="font-mono text-orange-800 flex-1">{domain}</span><span className="text-orange-600">{count} link{count!==1?'s':''}</span><button onClick={()=>externalAudit.results.filter(r=>r.destination_domain===domain&&!r.is_nofollow).forEach(r=>applyFix({fix_type:'add_nofollow',source_url:r.url,original_href:r.destination_url,replacement_href:r.destination_url}))} className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded border border-orange-200">Add nofollow</button></div>);
                  })}
                </div>
              </div>
            )}
            {!externalAudit&&(<div className="text-sm text-slate-400 text-center py-8">Loading external link audit…</div>)}
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
