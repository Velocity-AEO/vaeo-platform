'use client';

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QAStatusResponse {
  fix_id:           string;
  site_id:          string;
  qa_run:           boolean;
  passed?:          boolean;
  failed_viewports?: string[];
  checked_at?:      string;
  message?:         string;
}

type BadgeState = 'loading' | 'not-run' | 'passed' | 'failed';

// ── Component ─────────────────────────────────────────────────────────────────

export default function QAStatusBadge({
  fix_id,
  site_id,
}: {
  fix_id: string;
  site_id: string;
}) {
  const [state, setState]     = useState<BadgeState>('loading');
  const [failed, setFailed]   = useState<string[]>([]);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/fixes/${encodeURIComponent(fix_id)}/qa-status?siteId=${encodeURIComponent(site_id)}`,
        );
        if (!res.ok) { if (!cancelled) setState('not-run'); return; }
        const data: QAStatusResponse = await res.json();

        if (!cancelled) {
          if (!data.qa_run) {
            setState('not-run');
          } else if (data.passed) {
            setState('passed');
          } else {
            setState('failed');
            setFailed(data.failed_viewports ?? []);
          }
        }
      } catch {
        if (!cancelled) setState('not-run');
      }
    })();

    return () => { cancelled = true; };
  }, [fix_id, site_id]);

  // ── Loading spinner ─────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-400 text-xs">
        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  // ── Not run ─────────────────────────────────────────────────────────────
  if (state === 'not-run') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-slate-100 text-slate-500 text-xs font-medium">
        QA Pending
      </span>
    );
  }

  // ── Passed ──────────────────────────────────────────────────────────────
  if (state === 'passed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-green-200 bg-green-100 text-green-800 text-xs font-medium">
        ✓ All Viewports
      </span>
    );
  }

  // ── Failed ──────────────────────────────────────────────────────────────
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setShowTip(t => !t)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-red-200 bg-red-100 text-red-800 text-xs font-medium cursor-pointer"
        aria-label={`${failed.length} viewport${failed.length !== 1 ? 's' : ''} failed QA`}
      >
        ✗ {failed.length} Viewport{failed.length !== 1 ? 's' : ''} Failed
      </button>
      {showTip && failed.length > 0 && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs text-slate-700 z-20 whitespace-nowrap">
          <p className="font-medium text-slate-500 mb-1">Failed viewports:</p>
          {failed.map(v => (
            <p key={v} className="text-red-600">{v}</p>
          ))}
        </div>
      )}
    </span>
  );
}
