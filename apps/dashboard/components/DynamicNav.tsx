'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { buildNavItems, getNavState, type NavSite } from '../lib/nav_logic';

export default function DynamicNav() {
  const [sites, setSites] = useState<NavSite[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/client/sites');
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (!cancelled) setSites(Array.isArray(data) ? data : data.sites ?? []);
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const state = getNavState(sites, loading, error);
  const items = sites ? buildNavItems(sites) : [];

  return (
    <div className="space-y-1">
      <div className="text-xs text-slate-500 uppercase tracking-wider px-3 mb-2">
        Your Sites
      </div>

      {state === 'loading' && (
        <div className="space-y-2 px-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-slate-700/50 rounded animate-pulse" />
          ))}
        </div>
      )}

      {state === 'error' && (
        <div className="px-3 text-sm text-red-400">Unable to load sites</div>
      )}

      {state === 'empty' && (
        <div className="px-3 text-sm text-slate-400">No sites connected</div>
      )}

      {state === 'ready' && sites?.map((site) => {
        const mainItem = items.find((i) => i.href === `/client/${site.site_id}`);
        return (
          <div key={site.site_id}>
            <Link
              href={`/client/${site.site_id}`}
              className="block px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-white/10 rounded transition-colors"
            >
              {mainItem?.label ?? site.domain}
            </Link>
            <Link
              href={`/client/${site.site_id}/links`}
              className="block px-6 py-1 text-xs text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
            >
              Link Graph
            </Link>
          </div>
        );
      })}

      <div className="border-t border-slate-700/50 mt-3 pt-3 space-y-1">
        <Link
          href="/onboard/shopify"
          className="block px-3 py-1.5 text-sm text-emerald-400 hover:text-emerald-300 hover:bg-white/5 rounded transition-colors"
        >
          + Add Shopify site
        </Link>
        <Link
          href="/onboard/wordpress"
          className="block px-3 py-1.5 text-sm text-blue-400 hover:text-blue-300 hover:bg-white/5 rounded transition-colors"
        >
          + Add WordPress site
        </Link>
      </div>
    </div>
  );
}
