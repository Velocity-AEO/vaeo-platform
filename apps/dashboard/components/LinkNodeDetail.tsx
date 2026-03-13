'use client';

// ── Types (inlined for Next.js bundler) ──────────────────────────────────────

type AuthorityTier = 'hub' | 'strong' | 'average' | 'weak' | 'isolated';
type LinkType = 'body_content' | 'navigation' | 'footer' | 'breadcrumb' | 'sidebar' | 'pagination';

interface PageNode {
  url: string;
  title: string | null;
  depth: number;
  inbound_internal_count: number;
  outbound_internal_count: number;
  is_orphaned: boolean;
  is_dead_end: boolean;
  is_in_sitemap: boolean;
  health_score: number | null;
  outbound_link_count: number;
  link_limit: number;
}

interface InternalLink {
  source_url: string;
  destination_url: string;
  anchor_text: string;
  link_type: LinkType;
  is_nofollow: boolean;
  is_redirect: boolean;
}

interface AuthorityScore {
  url: string;
  score: number;
  authority_tier: AuthorityTier;
}

interface AnchorTextProfile {
  url: string;
  diversity_score: number;
  dominant_anchor: string;
  has_generic_anchors: boolean;
  generic_anchor_count: number;
  is_over_optimized: boolean;
}

interface EquityLeak {
  url: string;
  total_links: number;
  equity_per_link: number;
  severity: 'low' | 'medium' | 'high';
  recommendations: string[];
}

interface LinkSuggestion {
  source_url: string;
  destination_url: string;
  suggested_anchor: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

// ── Tier badge colors ────────────────────────────────────────────────────────

const TIER_BADGE: Record<AuthorityTier, { bg: string; text: string }> = {
  hub:      { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  strong:   { bg: 'bg-blue-100',   text: 'text-blue-700' },
  average:  { bg: 'bg-green-100',  text: 'text-green-700' },
  weak:     { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  isolated: { bg: 'bg-red-100',    text: 'text-red-700' },
};

const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function LinkNodeDetail({
  node,
  inbound_links,
  outbound_links,
  authority_score,
  anchor_profile,
  equity_leak,
  suggestions,
  onClose,
}: {
  node: PageNode;
  inbound_links: InternalLink[];
  outbound_links: InternalLink[];
  authority_score: AuthorityScore | null;
  anchor_profile: AnchorTextProfile | null;
  equity_leak: EquityLeak | null;
  suggestions: LinkSuggestion[];
  onClose: () => void;
}) {
  try {
    const tier = authority_score?.authority_tier ?? 'average';
    const badge = TIER_BADGE[tier] ?? TIER_BADGE.average;
    const truncUrl = node.url.length > 60 ? node.url.slice(0, 57) + '...' : node.url;
    const inbound = inbound_links ?? [];
    const outbound = outbound_links ?? [];
    const suggs = suggestions ?? [];

    return (
      <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-slate-200 shadow-xl overflow-y-auto z-50">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-800 truncate">
                {node.title ?? '(no title)'}
              </h2>
              <a
                href={node.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline truncate block"
              >
                {truncUrl}
              </a>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-2 text-lg leading-none">
              &times;
            </button>
          </div>
        </div>

        <div className="px-4 py-4 space-y-5">
          {/* Authority section */}
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Authority</h3>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl font-bold text-slate-800">
                {authority_score?.score ?? '—'}<span className="text-sm text-slate-400">/100</span>
              </span>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${badge.bg} ${badge.text}`}>
                {tier.charAt(0).toUpperCase() + tier.slice(1)}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Depth from homepage: <strong>{node.depth}</strong> clicks
            </p>
          </section>

          {/* Status badges */}
          {(node.is_orphaned || node.is_dead_end || node.depth > 3 || node.outbound_link_count > node.link_limit) && (
            <section className="flex flex-wrap gap-2">
              {node.is_orphaned && (
                <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">Orphaned page</span>
              )}
              {node.is_dead_end && (
                <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">Dead end</span>
              )}
              {node.depth > 3 && (
                <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">Deep page ({node.depth} clicks)</span>
              )}
              {node.outbound_link_count > node.link_limit && (
                <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">Exceeds link limit ({node.outbound_link_count})</span>
              )}
            </section>
          )}

          {/* Inbound links */}
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              {inbound.length} pages link to this page
            </h3>
            {inbound.slice(0, 10).map((link, i) => (
              <div key={i} className="text-xs text-slate-600 py-1 border-b border-slate-100 last:border-0">
                <span className="text-slate-800 truncate block">{link.source_url.replace(/^https?:\/\//, '').slice(0, 50)}</span>
                <span className="text-slate-400">"{link.anchor_text || '(empty)'}" · {link.link_type}</span>
              </div>
            ))}
            {inbound.length > 10 && (
              <p className="text-xs text-blue-500 mt-1">Show all {inbound.length} →</p>
            )}
          </section>

          {/* Outbound links */}
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              {outbound.length} links from this page
            </h3>
            {outbound.slice(0, 10).map((link, i) => (
              <div key={i} className="text-xs text-slate-600 py-1 border-b border-slate-100 last:border-0">
                <span className={`text-slate-800 truncate block ${link.is_redirect ? 'text-red-600' : ''}`}>
                  {link.destination_url.replace(/^https?:\/\//, '').slice(0, 50)}
                </span>
                <span className="text-slate-400">"{link.anchor_text || '(empty)'}" · {link.link_type}</span>
                {link.is_redirect && <span className="text-red-500 ml-1">(redirect)</span>}
              </div>
            ))}
          </section>

          {/* Anchor text profile */}
          {anchor_profile && (
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Anchor Text</h3>
              <p className="text-xs text-slate-600">
                Diversity score: <strong>{anchor_profile.diversity_score}/100</strong>
              </p>
              <p className="text-xs text-slate-600">
                Dominant anchor: "<strong>{anchor_profile.dominant_anchor}</strong>"
              </p>
              {anchor_profile.has_generic_anchors && (
                <p className="text-xs text-yellow-600 mt-1">
                  {anchor_profile.generic_anchor_count} generic anchors (click here, read more, etc.)
                </p>
              )}
              {anchor_profile.is_over_optimized && (
                <p className="text-xs text-red-600 mt-1">
                  Over-optimized — exact match anchors &gt; 50%
                </p>
              )}
            </section>
          )}

          {/* Equity leak */}
          {equity_leak && (
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Link Equity</h3>
              <p className="text-xs text-slate-600">
                Total links: {equity_leak.total_links} · Equity per link: {equity_leak.equity_per_link}%
              </p>
              <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${
                equity_leak.severity === 'high' ? 'bg-red-100 text-red-700' :
                equity_leak.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                'bg-green-100 text-green-700'
              }`}>
                {equity_leak.severity} severity
              </span>
              {equity_leak.recommendations.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {equity_leak.recommendations.map((r, i) => (
                    <li key={i} className="text-xs text-slate-500">• {r}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Suggestions */}
          {suggs.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                {suggs.length} link opportunities
              </h3>
              {suggs.map((s, i) => (
                <div key={i} className="text-xs py-2 border-b border-slate-100 last:border-0">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs mb-1 ${PRIORITY_BADGE[s.priority] ?? ''}`}>
                    {s.priority}
                  </span>
                  <p className="text-slate-600">{s.reason}</p>
                  <p className="text-slate-400 mt-0.5 truncate">
                    {s.source_url.replace(/^https?:\/\//, '').slice(0, 40)}
                  </p>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    );
  } catch {
    return null;
  }
}
