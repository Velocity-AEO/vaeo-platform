'use client';

/**
 * apps/dashboard/components/OrphanedPagesPanel.tsx
 *
 * Displays orphaned pages (no inbound internal links) for a site.
 * These are flagged for human review — VAEO never auto-modifies link structure.
 */

import { useEffect, useState, useCallback } from 'react';
import type { OrphanedPageIssue } from '@/../tools/orphaned/orphaned_page_issue_builder';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrphanedResponse {
  total:             number;
  pages:             OrphanedPageIssue[];
  last_detected_at:  string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncateUrl(url: string, max = 50): string {
  if (!url) return '';
  return url.length > max ? url.slice(0, max) + '…' : url;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-slate-100 rounded animate-pulse ${className}`} />;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  site_id: string;
}

const PAGE_SIZE = 20;

export default function OrphanedPagesPanel({ site_id }: Props) {
  const [data,    setData]    = useState<OrphanedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [offset,  setOffset]  = useState(0);
  const [copied,  setCopied]  = useState<string | null>(null);

  const load = useCallback(async (off: number) => {
    if (!site_id) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sites/${encodeURIComponent(site_id)}/orphaned?limit=${PAGE_SIZE}&offset=${off}`,
      );
      if (res.ok) {
        const json = await res.json() as OrphanedResponse;
        setData(json);
      } else {
        setData({ total: 0, pages: [], last_detected_at: null });
      }
    } catch {
      setData({ total: 0, pages: [], last_detected_at: null });
    } finally {
      setLoading(false);
    }
  }, [site_id]);

  useEffect(() => { load(offset); }, [load, offset]);

  function copyUrl(url: string) {
    try {
      navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard not available
    }
  }

  const total = data?.total ?? 0;
  const pages = data?.pages ?? [];
  const hasMore = offset + PAGE_SIZE < total;

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-72" />
        <div className="space-y-2">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}
        </div>
      </section>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!loading && total === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Orphaned Pages</h2>
        <p className="text-xs text-slate-500 mb-3">
          These pages have no internal links pointing to them. Add links from related content to
          improve crawlability and ranking potential.
        </p>
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <span className="text-lg leading-none">✓</span>
          <span className="font-medium">No orphaned pages found</span>
        </div>
      </section>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Orphaned Pages</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            These pages have no internal links pointing to them. Add links from related content to
            improve crawlability and ranking potential.
          </p>
        </div>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
          total > 0
            ? 'bg-yellow-50 text-yellow-800 border-yellow-300'
            : 'bg-green-50 text-green-800 border-green-200'
        }`}>
          {total} {total === 1 ? 'page' : 'pages'} found
        </span>
      </div>

      {/* Table */}
      <div className="border border-slate-100 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 font-medium">Page</th>
              <th className="px-4 py-2.5 font-medium hidden sm:table-cell">URL</th>
              <th className="px-4 py-2.5 font-medium text-center whitespace-nowrap">Links in</th>
              <th className="px-4 py-2.5 font-medium text-right">Copy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pages.map((p, i) => (
              <tr key={`${p.url}-${i}`} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-800 text-sm">
                    {p.page_title ?? truncateUrl(p.url, 40)}
                  </div>
                  <div className="sm:hidden text-xs text-slate-400 font-mono mt-0.5">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-600 truncate inline-block max-w-[200px]"
                      title={p.url}
                    >
                      {truncateUrl(p.url, 36)}
                    </a>
                  </div>
                </td>
                <td className="px-4 py-2.5 hidden sm:table-cell">
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-slate-500 hover:text-blue-600 truncate inline-block max-w-xs"
                    title={p.url}
                  >
                    {truncateUrl(p.url, 50)}
                  </a>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium border border-slate-200">
                    No internal links
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => copyUrl(p.url)}
                    className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                    title="Copy URL"
                  >
                    {copied === p.url ? '✓ Copied' : 'Copy URL'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Showing {offset + 1}–{offset + pages.length} of {total}</span>
          <button
            onClick={() => setOffset(o => o + PAGE_SIZE)}
            disabled={loading}
            className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {/* Info callout */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-600">
        VAEO flags these pages for your review. Internal linking decisions are made by you — we
        never auto-modify site navigation or link structure.
      </div>

    </section>
  );
}
