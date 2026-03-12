'use client';

import { useEffect, useState } from 'react';
import type { RollbackRecord } from '../../../tools/rollback/rollback_history';

interface RollbackHistoryProps {
  site_id: string;
}

export default function RollbackHistory({ site_id }: RollbackHistoryProps) {
  const [records, setRecords] = useState<RollbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(`/api/sites/${site_id}/rollback/history`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed');
        return res.json() as Promise<RollbackRecord[]>;
      })
      .then((data) => {
        if (!cancelled) {
          setRecords(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [site_id]);

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2].map((i) => (
          <div key={i} className="h-10 bg-gray-200 rounded" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-gray-500">Unable to load rollback history</p>
    );
  }

  if (records.length === 0) {
    return (
      <p className="text-sm text-gray-500">No rollbacks yet</p>
    );
  }

  return (
    <div className="space-y-1">
      {records.map((rec) => (
        <div
          key={rec.rollback_id}
          className="flex items-center gap-3 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 truncate">{rec.signal_type}</p>
            <p className="text-xs text-slate-400 truncate">{rec.url}</p>
          </div>

          <span className="text-xs text-slate-400 shrink-0">
            {new Date(rec.rolled_back_at).toLocaleDateString()}
          </span>

          <span
            className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
              rec.success
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-600'
            }`}
          >
            {rec.success ? 'undone' : 'failed'}
          </span>
        </div>
      ))}
    </div>
  );
}
