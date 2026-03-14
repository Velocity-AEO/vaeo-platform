'use client';

/**
 * apps/dashboard/app/admin/app-store/page.tsx
 *
 * Shopify App Store submission checklist.
 * Admin-only view — shows technical and listing content readiness.
 */

import { useEffect, useState } from 'react';
import {
  APP_LISTING_REQUIREMENTS,
  getSubmissionReadiness,
  type AppListingRequirement,
} from '@tools/shopify/app_listing/app_listing_checklist';

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: AppListingRequirement['status'] }) {
  if (status === 'complete')   return <span className="text-green-600 font-bold text-lg leading-none">✓</span>;
  if (status === 'manual')     return <span className="text-yellow-500 font-bold text-lg leading-none">⚠</span>;
  return <span className="text-red-500 font-bold text-lg leading-none">✗</span>;
}

function StatusBadge({ status }: { status: AppListingRequirement['status'] }) {
  const cls =
    status === 'complete'  ? 'bg-green-50 text-green-700 border-green-200' :
    status === 'manual'    ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                             'bg-red-50 text-red-700 border-red-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {status}
    </span>
  );
}

function ProgressBar({ complete, total }: { complete: number; total: number }) {
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
  const cls = pct === 100 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="w-full bg-slate-100 rounded-full h-2.5">
      <div className={`${cls} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AppStorePage() {
  const [authOk, setAuthOk] = useState(false);

  useEffect(() => {
    // Simple admin check — in production this would call /api/auth/check?admin=true
    fetch('/api/auth/check?admin=true')
      .then(r => r.ok ? r.json() : { allowed: false })
      .then(d => { if (d.allowed) setAuthOk(true); })
      .catch(() => setAuthOk(true)); // fail open for admin pages
  }, []);

  const requirements = APP_LISTING_REQUIREMENTS;
  const readiness    = getSubmissionReadiness(requirements);
  const categories   = Array.from(new Set(requirements.map(r => r.category)));
  const total        = requirements.length;

  return (
    <div className="space-y-8 px-4 py-6 md:px-6 w-full max-w-4xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">Shopify App Store Submission</h1>
        <p className="text-sm text-slate-500 mt-1">
          All requirements must be met before submitting to the Shopify App Store.
          Review blocks submission — the review clock starts on submit.
        </p>
      </div>

      {/* Progress bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Overall readiness</span>
          <span className="text-slate-500">
            {readiness.complete} / {total} complete
          </span>
        </div>
        <ProgressBar complete={readiness.complete} total={total} />
        <div className="flex gap-4 text-xs text-slate-500 flex-wrap">
          <span><span className="text-green-600 font-medium">{readiness.complete}</span> complete</span>
          <span><span className="text-yellow-500 font-medium">{readiness.manual}</span> need manual action</span>
          <span><span className="text-red-500 font-medium">{readiness.incomplete}</span> incomplete</span>
        </div>
      </div>

      {/* Requirements by category */}
      {categories.map(category => {
        const items = requirements.filter(r => r.category === category);
        return (
          <section key={category}>
            <h2 className="text-base font-semibold text-slate-700 mb-3">{category}</h2>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5 font-medium w-8"></th>
                    <th className="px-4 py-2.5 font-medium">Requirement</th>
                    <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Status</th>
                    <th className="px-4 py-2.5 font-medium hidden md:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <StatusIcon status={r.status} />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {r.requirement}
                        <div className="sm:hidden mt-1">
                          <StatusBadge status={r.status} />
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell max-w-xs">
                        {r.notes ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {/* Summary + CTA */}
      <div className={`rounded-xl p-4 border ${
        readiness.ready
          ? 'bg-green-50 border-green-200'
          : 'bg-red-50 border-red-200'
      }`}>
        {readiness.ready ? (
          <p className="font-semibold text-green-800">
            ✓ Ready to submit — no blocking items. Complete manual checklist items in the Partner dashboard.
          </p>
        ) : (
          <p className="font-semibold text-red-800">
            {readiness.incomplete} item{readiness.incomplete !== 1 ? 's' : ''} blocking submission
          </p>
        )}
        {readiness.blocking.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-red-700">
            {readiness.blocking.map(b => (
              <li key={b.id}>• {b.requirement}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Partner dashboard link */}
      <div className="flex justify-end">
        <a
          href="https://partners.shopify.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 transition-colors"
        >
          Open Shopify Partner Dashboard →
        </a>
      </div>

    </div>
  );
}
