'use client';

// ── Types (inlined for Next.js bundler) ──────────────────────────────────────

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
  link_type: string;
  is_nofollow: boolean;
  is_redirect: boolean;
}

interface LinkSuggestion {
  source_url: string;
  destination_url: string;
  suggested_anchor: string;
  priority: string;
  reason: string;
}

interface LinkGraph {
  page_nodes: PageNode[];
  internal_links: InternalLink[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function downloadCSV(filename: string, rows: string[][]) {
  try {
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // non-fatal
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function LinkGraphExport({
  site_id,
  graph,
  suggestions,
}: {
  site_id: string;
  graph: LinkGraph;
  suggestions?: LinkSuggestion[];
}) {
  function exportPages() {
    const header = ['url', 'title', 'depth', 'inbound_count', 'outbound_count', 'is_orphaned', 'is_dead_end', 'is_in_sitemap'];
    const rows = [header, ...graph.page_nodes.map((n) => [
      n.url, n.title ?? '', String(n.depth), String(n.inbound_internal_count),
      String(n.outbound_internal_count), String(n.is_orphaned), String(n.is_dead_end), String(n.is_in_sitemap),
    ])];
    downloadCSV(`${site_id}_pages.csv`, rows);
  }

  function exportLinks() {
    const header = ['source_url', 'destination_url', 'anchor_text', 'link_type', 'is_nofollow', 'is_redirect'];
    const rows = [header, ...graph.internal_links.map((l) => [
      l.source_url, l.destination_url, l.anchor_text, l.link_type,
      String(l.is_nofollow), String(l.is_redirect),
    ])];
    downloadCSV(`${site_id}_links.csv`, rows);
  }

  function exportSuggestions() {
    const suggs = suggestions ?? [];
    const header = ['source_url', 'destination_url', 'suggested_anchor', 'priority', 'reason'];
    const rows = [header, ...suggs.map((s) => [
      s.source_url, s.destination_url, s.suggested_anchor, s.priority, s.reason,
    ])];
    downloadCSV(`${site_id}_opportunities.csv`, rows);
  }

  function exportPNG() {
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${site_id}_link_graph.png`;
        a.click();
        URL.revokeObjectURL(url);
      });
    } catch {
      // non-fatal
    }
  }

  try {
    return (
      <div className="flex flex-wrap gap-2">
        <button onClick={exportPages} className="px-3 py-1.5 text-xs border border-slate-200 rounded hover:bg-slate-50 text-slate-600">
          Export CSV — All Pages
        </button>
        <button onClick={exportLinks} className="px-3 py-1.5 text-xs border border-slate-200 rounded hover:bg-slate-50 text-slate-600">
          Export CSV — Internal Links
        </button>
        <button onClick={exportSuggestions} className="px-3 py-1.5 text-xs border border-slate-200 rounded hover:bg-slate-50 text-slate-600">
          Export CSV — Link Opportunities
        </button>
        <button onClick={exportPNG} className="px-3 py-1.5 text-xs border border-slate-200 rounded hover:bg-slate-50 text-slate-600">
          Export PNG — Tree Map
        </button>
      </div>
    );
  } catch {
    return null;
  }
}
