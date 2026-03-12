'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ViewportScreenshotStrip from '../../../../components/ViewportScreenshotStrip';
import { getExpandedFixId, isFixExpanded } from '../../../../lib/fix_expand_logic';

interface Fix {
  fix_id: string;
  label: string;
  url: string;
  issue: string;
  status: string;
  confidence: number;
}

export default function ClientFixesPage() {
  const params = useParams();
  const siteId = params?.siteId as string;

  const [fixes, setFixes] = useState<Fix[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/sites/${siteId}/fixes`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed');
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setFixes(json.fixes ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [siteId]);

  function handleRowClick(fix_id: string) {
    setExpandedId(getExpandedFixId(expandedId, fix_id));
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-200 rounded-lg" />
        ))}
      </div>
    );
  }

  if (fixes.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-gray-500">No fixes found for this site.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <h2 className="text-sm font-semibold text-slate-700 mb-3">Fix History</h2>

      {fixes.map((fix) => {
        const expanded = isFixExpanded(expandedId, fix.fix_id);

        return (
          <div key={fix.fix_id}>
            {/* Fix row */}
            <button
              onClick={() => handleRowClick(fix.fix_id)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
            >
              {/* Chevron */}
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M6 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{fix.label}</p>
                <p className="text-xs text-slate-400 truncate">{fix.url}</p>
              </div>

              <span
                className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                  fix.status === 'applied'
                    ? 'bg-green-100 text-green-700'
                    : fix.status === 'pending'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {fix.status}
              </span>

              {fix.confidence > 0 && (
                <span className="shrink-0 text-xs text-slate-400">{fix.confidence}%</span>
              )}
            </button>

            {/* Expanded section */}
            {expanded && (
              <div className="ml-7 mt-2 mb-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-xs font-medium text-slate-500 mb-3">Before/After Screenshots</p>
                <ViewportScreenshotStrip fix_id={fix.fix_id} site_id={siteId} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
