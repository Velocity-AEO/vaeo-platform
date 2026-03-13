'use client';

import { useState } from 'react';

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

interface ExternalLink {
  source_url: string;
  destination_url: string;
  destination_domain: string;
  anchor_text: string | null;
  is_nofollow: boolean;
  status_code: number | null;
  is_broken: boolean;
}

interface LinkSuggestion {
  source_url: string;
  destination_url: string;
  suggested_anchor: string;
  priority: string;
  reason: string;
}

interface VelocityTrend {
  url: string;
  current_inbound: number;
  change_7d: number | null;
  change_30d: number | null;
  trend_type: string;
  is_hub_page: boolean;
  alert_required: boolean;
}

interface LinkGraph {
  page_nodes: PageNode[];
  internal_links: InternalLink[];
  external_links?: ExternalLink[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function csvEscape(val: string | number | boolean | null | undefined): string {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildCSVString(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
}

function triggerDownload(filename: string, content: string, type = 'text/csv') {
  try {
    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch { /* non-fatal */ }
}

function boolStr(v: boolean): string { return v ? 'Yes' : 'No'; }

// ── Component ────────────────────────────────────────────────────────────────

export default function LinkGraphExport({
  site_id,
  graph,
  suggestions,
  velocity_trends,
}: {
  site_id:          string;
  graph:            LinkGraph;
  suggestions?:     LinkSuggestion[];
  velocity_trends?: VelocityTrend[];
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function downloadExport(type: string, url: string) {
    try {
      setLoading(type);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const text     = await res.text();
      const date     = new Date().toISOString().slice(0, 10);
      triggerDownload(`vaeo-${type}-${site_id}-${date}.csv`, text);
      showToast(`${type} exported`, true);
    } catch {
      showToast(`Export failed`, false);
    } finally {
      setLoading(null);
    }
  }

  function exportPages() {
    const headers = ['URL', 'Title', 'Depth', 'Inbound Internal', 'Outbound Internal', 'Is Orphaned', 'Is Dead End', 'Is In Sitemap'];
    const rows    = (graph.page_nodes ?? []).map((n) => [
      n.url, n.title ?? '', String(n.depth),
      String(n.inbound_internal_count), String(n.outbound_internal_count),
      boolStr(n.is_orphaned), boolStr(n.is_dead_end), boolStr(n.is_in_sitemap),
    ]);
    const date = new Date().toISOString().slice(0, 10);
    triggerDownload(`vaeo-pages-${site_id}-${date}.csv`, buildCSVString(headers, rows));
    showToast('Pages exported', true);
  }

  function exportLinks() {
    const headers = ['Source URL', 'Destination URL', 'Anchor Text', 'Link Type', 'Is Nofollow', 'Is Redirect'];
    const rows    = (graph.internal_links ?? []).map((l) => [
      l.source_url, l.destination_url, l.anchor_text, l.link_type,
      boolStr(l.is_nofollow), boolStr(l.is_redirect),
    ]);
    const date = new Date().toISOString().slice(0, 10);
    triggerDownload(`vaeo-internal-links-${site_id}-${date}.csv`, buildCSVString(headers, rows));
    showToast('Internal links exported', true);
  }

  function exportExternalLinks() {
    const headers = ['Source URL', 'Destination URL', 'Domain', 'Anchor Text', 'Is Nofollow', 'Status Code', 'Is Broken'];
    const rows    = (graph.external_links ?? []).map((l) => [
      l.source_url, l.destination_url, l.destination_domain,
      l.anchor_text ?? '', boolStr(l.is_nofollow),
      String(l.status_code ?? ''), boolStr(l.is_broken),
    ]);
    const date = new Date().toISOString().slice(0, 10);
    triggerDownload(`vaeo-external-links-${site_id}-${date}.csv`, buildCSVString(headers, rows));
    showToast('External links exported', true);
  }

  function exportSuggestions() {
    const suggs   = suggestions ?? [];
    const headers = ['Priority', 'Source URL', 'Destination URL', 'Suggested Anchor', 'Reason'];
    const rows    = suggs.map((s) => [s.priority, s.source_url, s.destination_url, s.suggested_anchor, s.reason]);
    const date    = new Date().toISOString().slice(0, 10);
    triggerDownload(`vaeo-opportunities-${site_id}-${date}.csv`, buildCSVString(headers, rows));
    showToast('Opportunities exported', true);
  }

  function exportVelocity() {
    const trends  = velocity_trends ?? [];
    const headers = ['URL', 'Current Inbound', 'Change 7d', 'Change 30d', 'Trend Type', 'Is Hub', 'Alert'];
    const rows    = trends.map((t) => [
      t.url, String(t.current_inbound),
      t.change_7d != null ? String(t.change_7d) : '',
      t.change_30d != null ? String(t.change_30d) : '',
      t.trend_type, boolStr(t.is_hub_page), boolStr(t.alert_required),
    ]);
    const date = new Date().toISOString().slice(0, 10);
    triggerDownload(`vaeo-velocity-${site_id}-${date}.csv`, buildCSVString(headers, rows));
    showToast('Velocity trends exported', true);
  }

  function exportPNG() {
    try {
      setLoading('png');
      const canvas = document.querySelector('canvas');
      if (!canvas) { setLoading(null); showToast('Tree map not ready', false); return; }

      // 2x retina quality
      const scale = 2;
      const out   = document.createElement('canvas');
      out.width   = canvas.width  * scale;
      out.height  = canvas.height * scale;
      const ctx   = out.getContext('2d');
      if (!ctx) { setLoading(null); return; }
      ctx.scale(scale, scale);
      ctx.drawImage(canvas, 0, 0);

      const date = new Date().toISOString().slice(0, 10);
      out.toBlob((blob) => {
        try {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a   = document.createElement('a');
          a.href    = url;
          a.download = `vaeo-link-graph-${site_id}-${date}.png`;
          a.click();
          URL.revokeObjectURL(url);
          showToast('PNG exported', true);
        } catch { showToast('PNG export failed', false); } finally { setLoading(null); }
      }, 'image/png');
    } catch {
      setLoading(null);
      showToast('PNG export failed', false);
    }
  }

  const pageCount    = graph.page_nodes?.length ?? 0;
  const linkCount    = graph.internal_links?.length ?? 0;
  const extCount     = graph.external_links?.length ?? 0;
  const suggCount    = suggestions?.length ?? 0;
  const velCount     = velocity_trends?.length ?? 0;

  const btnCls = (key: string) =>
    `flex flex-col items-start px-4 py-3 border rounded-lg hover:bg-slate-50 text-left transition-colors ${loading === key ? 'opacity-60 cursor-wait' : 'border-slate-200 cursor-pointer'}`;

  try {
    return (
      <div className="relative">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Export Link Graph Data</h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button onClick={exportPages} disabled={loading !== null} className={btnCls('pages')}>
            <span className="text-sm font-medium text-slate-700">{loading === 'pages' ? 'Exporting…' : 'Pages CSV'}</span>
            <span className="text-xs text-slate-400 mt-0.5">{pageCount} pages</span>
          </button>

          <button onClick={exportLinks} disabled={loading !== null} className={btnCls('links')}>
            <span className="text-sm font-medium text-slate-700">{loading === 'links' ? 'Exporting…' : 'Internal Links CSV'}</span>
            <span className="text-xs text-slate-400 mt-0.5">{linkCount} links</span>
          </button>

          <button onClick={exportExternalLinks} disabled={loading !== null} className={btnCls('external')}>
            <span className="text-sm font-medium text-slate-700">{loading === 'external' ? 'Exporting…' : 'External Links CSV'}</span>
            <span className="text-xs text-slate-400 mt-0.5">{extCount} links</span>
          </button>

          <button onClick={exportSuggestions} disabled={loading !== null} className={btnCls('opportunities')}>
            <span className="text-sm font-medium text-slate-700">{loading === 'opportunities' ? 'Exporting…' : 'Opportunities CSV'}</span>
            <span className="text-xs text-slate-400 mt-0.5">{suggCount} suggestions</span>
          </button>

          <button onClick={exportVelocity} disabled={loading !== null} className={btnCls('velocity')}>
            <span className="text-sm font-medium text-slate-700">{loading === 'velocity' ? 'Exporting…' : 'Velocity CSV'}</span>
            <span className="text-xs text-slate-400 mt-0.5">{velCount} pages tracked</span>
          </button>

          <button onClick={exportPNG} disabled={loading !== null} className={btnCls('png')}>
            <span className="text-sm font-medium text-slate-700">{loading === 'png' ? 'Exporting…' : 'Tree Map PNG'}</span>
            <span className="text-xs text-slate-400 mt-0.5">Current view</span>
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`absolute bottom-0 right-0 mt-2 px-3 py-1.5 rounded text-xs font-medium shadow ${toast.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {toast.msg}
          </div>
        )}
      </div>
    );
  } catch {
    return null;
  }
}
