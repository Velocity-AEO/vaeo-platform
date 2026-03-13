'use client';

import { useEffect, useRef, useState } from 'react';

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

interface LinkGraph {
  page_nodes: PageNode[];
  internal_links: InternalLink[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<AuthorityTier, string> = {
  hub: '#4F46E5', strong: '#0EA5E9', average: '#10B981',
  weak: '#F59E0B', isolated: '#EF4444',
};

const EDGE_COLORS: Record<LinkType, string> = {
  body_content: '#94A3B8', navigation: '#CBD5E1', footer: '#CBD5E1',
  breadcrumb: '#818CF8', sidebar: '#A5B4FC', pagination: '#E2E8F0',
};

const EDGE_OPACITY: Record<LinkType, number> = {
  body_content: 0.6, navigation: 0.3, footer: 0.2,
  breadcrumb: 0.5, sidebar: 0.4, pagination: 0.15,
};

type FilterKey = 'orphaned' | 'dead_ends' | 'deep' | 'hubs';
type LinkFilter = 'all' | 'body' | 'nav' | 'footer';

const MAX_NODES = 500;

// ── Component ────────────────────────────────────────────────────────────────

export default function LinkTreeMap({
  site_id,
  graph,
  authority_scores,
  onNodeClick,
}: {
  site_id: string;
  graph: LinkGraph;
  authority_scores: AuthorityScore[];
  onNodeClick?: (node: PageNode) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set());
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [zoom, setZoom] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [exporting, setExporting] = useState(false);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const scoreMap = new Map(authority_scores.map((s) => [s.url, s]));
  const truncated = graph.page_nodes.length > MAX_NODES;
  const nodes = truncated
    ? [...graph.page_nodes]
        .sort((a, b) => b.inbound_internal_count - a.inbound_internal_count)
        .slice(0, MAX_NODES)
    : graph.page_nodes;

  const nodeUrls = new Set(nodes.map((n) => n.url));

  // Filter nodes
  function isNodeVisible(node: PageNode): boolean {
    if (filters.size === 0) return true;
    if (filters.has('orphaned') && node.is_orphaned) return true;
    if (filters.has('dead_ends') && node.is_dead_end) return true;
    if (filters.has('deep') && node.depth > 3) return true;
    if (filters.has('hubs') && scoreMap.get(node.url)?.authority_tier === 'hub') return true;
    return filters.size === 0;
  }

  // Filter edges
  function isEdgeVisible(link: InternalLink): boolean {
    if (!nodeUrls.has(link.source_url) || !nodeUrls.has(link.destination_url)) return false;
    if (linkFilter === 'body') return link.link_type === 'body_content';
    if (linkFilter === 'nav') return link.link_type === 'navigation';
    if (linkFilter === 'footer') return link.link_type === 'footer';
    return true;
  }

  function getRadius(count: number): number {
    return Math.max(8, Math.min(40, Math.sqrt(count) * 8));
  }

  // Simple force-directed layout using canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Initialize positions if needed
    const positions = positionsRef.current;
    if (positions.size === 0) {
      nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / nodes.length;
        const r = 150 + node.depth * 60;
        positions.set(node.url, {
          x: width / 2 + r * Math.cos(angle),
          y: height / 2 + r * Math.sin(angle),
        });
      });
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(zoom.x, zoom.y);
      ctx.scale(zoom.scale, zoom.scale);

      // Draw edges
      const visibleLinks = graph.internal_links.filter(isEdgeVisible);
      for (const link of visibleLinks) {
        const src = positions.get(link.source_url);
        const dst = positions.get(link.destination_url);
        if (!src || !dst) continue;
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(dst.x, dst.y);
        ctx.strokeStyle = EDGE_COLORS[link.link_type] ?? '#CBD5E1';
        ctx.globalAlpha = EDGE_OPACITY[link.link_type] ?? 0.3;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Arrow head
        const angle = Math.atan2(dst.y - src.y, dst.x - src.x);
        const arrowLen = 6;
        ctx.beginPath();
        ctx.moveTo(dst.x, dst.y);
        ctx.lineTo(
          dst.x - arrowLen * Math.cos(angle - 0.3),
          dst.y - arrowLen * Math.sin(angle - 0.3),
        );
        ctx.moveTo(dst.x, dst.y);
        ctx.lineTo(
          dst.x - arrowLen * Math.cos(angle + 0.3),
          dst.y - arrowLen * Math.sin(angle + 0.3),
        );
        ctx.stroke();
      }

      ctx.globalAlpha = 1;

      // Draw nodes
      for (const node of nodes) {
        if (!isNodeVisible(node)) continue;
        const pos = positions.get(node.url);
        if (!pos) continue;

        const score = scoreMap.get(node.url);
        const tier = score?.authority_tier ?? 'average';
        const r = getRadius(node.inbound_internal_count);

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = TIER_COLORS[tier] ?? '#10B981';
        ctx.globalAlpha = 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Border for special nodes
        if (node.is_orphaned) {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = '#EF4444';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (node.is_dead_end) {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (node.depth > 3) {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = '#EAB308';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      ctx.restore();
    }

    draw();
  }, [nodes, graph.internal_links, filters, linkFilter, zoom]);

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - zoom.x) / zoom.scale;
    const my = (e.clientY - rect.top - zoom.y) / zoom.scale;

    for (const node of nodes) {
      const pos = positionsRef.current.get(node.url);
      if (!pos) continue;
      const r = getRadius(node.inbound_internal_count);
      const dx = mx - pos.x;
      const dy = my - pos.y;
      if (dx * dx + dy * dy < r * r) {
        const score = scoreMap.get(node.url);
        const url = node.url.length > 40 ? node.url.slice(0, 37) + '...' : node.url;
        const text = [
          url,
          node.title ?? '(no title)',
          `In: ${node.inbound_internal_count} | Out: ${node.outbound_internal_count}`,
          `Depth: ${node.depth}`,
          `Authority: ${score?.authority_tier ?? '—'}`,
        ].join('\n');
        setTooltip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 10, text });
        return;
      }
    }
    setTooltip(null);
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !onNodeClick) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - zoom.x) / zoom.scale;
    const my = (e.clientY - rect.top - zoom.y) / zoom.scale;

    for (const node of nodes) {
      const pos = positionsRef.current.get(node.url);
      if (!pos) continue;
      const r = getRadius(node.inbound_internal_count);
      if ((mx - pos.x) ** 2 + (my - pos.y) ** 2 < r * r) {
        onNodeClick(node);
        return;
      }
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => ({ ...z, scale: Math.max(0.1, Math.min(5, z.scale * factor)) }));
  }

  function handleMouseDown(e: React.MouseEvent) {
    setDragging(true);
    setDragStart({ x: e.clientX - zoom.x, y: e.clientY - zoom.y });
  }

  function handleMouseMoveForDrag(e: React.MouseEvent) {
    if (dragging) {
      setZoom((z) => ({ ...z, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }));
    }
    handleCanvasMouseMove(e);
  }

  function handleMouseUp() {
    setDragging(false);
  }

  function handleDoubleClick() {
    setZoom({ x: 0, y: 0, scale: 1 });
  }

  function toggleFilter(key: FilterKey) {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function exportAsPNG() {
    try {
      setExporting(true);
      const canvas = canvasRef.current;
      if (!canvas) { setExporting(false); return; }

      // Create 2x retina canvas
      const scale  = 2;
      const out    = document.createElement('canvas');
      out.width    = canvas.width  * scale;
      out.height   = canvas.height * scale;
      const ctx    = out.getContext('2d');
      if (!ctx) { setExporting(false); return; }
      ctx.scale(scale, scale);
      ctx.drawImage(canvas, 0, 0);

      out.toBlob((blob) => {
        try {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a   = document.createElement('a');
          a.href    = url;
          a.download = `vaeo-link-graph-${site_id}-${new Date().toISOString().slice(0, 10)}.png`;
          a.click();
          URL.revokeObjectURL(url);
        } catch { /* non-fatal */ } finally {
          setExporting(false);
        }
      }, 'image/png');
    } catch {
      setExporting(false);
    }
  }

  try {
    return (
      <div className="relative">
        {/* Truncation warning */}
        {truncated && (
          <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
            Large site — showing top {MAX_NODES} pages by authority. Export for full graph.
          </div>
        )}

        {/* Filter controls */}
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={() => toggleFilter('orphaned')}
            className={`px-3 py-1 text-xs rounded-full border ${filters.has('orphaned') ? 'bg-red-50 border-red-300 text-red-700' : 'border-slate-200 text-slate-500'}`}
          >Show Orphaned</button>
          <button
            onClick={() => toggleFilter('dead_ends')}
            className={`px-3 py-1 text-xs rounded-full border ${filters.has('dead_ends') ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-slate-200 text-slate-500'}`}
          >Show Dead Ends</button>
          <button
            onClick={() => toggleFilter('deep')}
            className={`px-3 py-1 text-xs rounded-full border ${filters.has('deep') ? 'bg-yellow-50 border-yellow-300 text-yellow-700' : 'border-slate-200 text-slate-500'}`}
          >Show Deep Pages</button>
          <button
            onClick={() => toggleFilter('hubs')}
            className={`px-3 py-1 text-xs rounded-full border ${filters.has('hubs') ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-500'}`}
          >Show Hubs Only</button>

          <span className="w-px h-6 bg-slate-200 self-center" />

          {(['all', 'body', 'nav', 'footer'] as LinkFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setLinkFilter(f)}
              className={`px-3 py-1 text-xs rounded-full border ${linkFilter === f ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 text-slate-500'}`}
            >
              {f === 'all' ? 'All Links' : f === 'body' ? 'Body Links' : f === 'nav' ? 'Nav Links' : 'Footer Links'}
            </button>
          ))}

          <span className="w-px h-6 bg-slate-200 self-center" />

          <button
            onClick={exportAsPNG}
            disabled={exporting}
            className="px-3 py-1 text-xs rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export PNG'}
          </button>
        </div>

        {/* Canvas */}
        <div className="relative border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
          <canvas
            ref={canvasRef}
            width={960}
            height={600}
            className="w-full cursor-grab active:cursor-grabbing"
            onMouseMove={handleMouseMoveForDrag}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { setDragging(false); setTooltip(null); }}
            onClick={handleCanvasClick}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
          />

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute pointer-events-none bg-slate-800 text-white text-xs px-3 py-2 rounded shadow-lg whitespace-pre-line max-w-xs"
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              {tooltip.text}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="font-medium">Node size = inbound links</span>
          <span className="w-px h-4 bg-slate-200 self-center" />
          {Object.entries(TIER_COLORS).map(([tier, color]) => (
            <span key={tier} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: color }} />
              {tier}
            </span>
          ))}
          <span className="w-px h-4 bg-slate-200 self-center" />
          <span className="flex items-center gap-1">
            <span className="w-6 border-t-2 border-dashed border-red-400 inline-block" /> orphaned
          </span>
          <span className="flex items-center gap-1">
            <span className="w-6 border-t-2 border-dashed border-orange-400 inline-block" /> dead end
          </span>
          <span className="flex items-center gap-1">
            <span className="w-6 border-t-2 border-dashed border-yellow-400 inline-block" /> deep page
          </span>
        </div>
      </div>
    );
  } catch {
    return <div className="text-sm text-slate-400">Unable to render link graph.</div>;
  }
}
