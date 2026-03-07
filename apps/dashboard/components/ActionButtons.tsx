'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ExecutionStatus } from '@/lib/types';

interface Props {
  itemId:   string;
  tenantId: string;
  status:   ExecutionStatus;
  onDone:   () => void;
}

export default function ActionButtons({ itemId, tenantId, status, onDone }: Props) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function update(newStatus: string) {
    setLoading(true);
    setError(null);
    const { error: err } = await supabase
      .from('action_queue')
      .update({ execution_status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('tenant_id', tenantId);
    setLoading(false);
    if (err) { setError(err.message); return; }
    onDone();
  }

  if (loading) return <span className="text-xs text-slate-400">Saving…</span>;

  return (
    <div className="flex flex-col gap-1">
      {error && <p className="text-[10px] text-red-600">{error}</p>}
      {status === 'pending_approval' && (
        <div className="flex gap-1">
          <button
            onClick={() => update('deployed')}
            className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => update('failed')}
            className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            Reject
          </button>
        </div>
      )}
      {(status === 'deployed' || status === 'regression_detected') && (
        <button
          onClick={() => update('rolled_back')}
          className="px-2 py-1 text-xs rounded bg-slate-600 text-white hover:bg-slate-700 transition-colors"
        >
          Rollback
        </button>
      )}
    </div>
  );
}
