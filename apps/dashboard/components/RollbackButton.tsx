'use client';

import { useState } from 'react';
import { canShowRollbackButton, getRollbackStatusMessage, buildRollbackRequest } from '../lib/rollback_api_logic';
import type { RollbackResult } from '../../../tools/rollback/rollback_engine';

interface RollbackButtonProps {
  fix_id:                 string;
  site_id:                string;
  applied_at:             string;
  original_value:         string | null;
  on_rollback_complete?:  () => void;
}

type State = 'idle' | 'confirming' | 'loading' | 'success' | 'error';

export default function RollbackButton({
  fix_id,
  site_id,
  applied_at,
  original_value,
  on_rollback_complete,
}: RollbackButtonProps) {
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Guard: don't render when rollback is not allowed
  if (!canShowRollbackButton({ applied_at, original_value })) {
    return null;
  }

  function handleUndoClick(e: React.MouseEvent) {
    e.stopPropagation();
    setState('confirming');
  }

  function handleCancel(e: React.MouseEvent) {
    e.stopPropagation();
    setState('idle');
  }

  async function handleConfirm(e: React.MouseEvent) {
    e.stopPropagation();
    setState('loading');

    try {
      const body = buildRollbackRequest(fix_id);
      const res = await fetch(`/api/sites/${site_id}/rollback`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      const data = await res.json() as { result?: RollbackResult; error?: string };

      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? 'Rollback failed');
        setState('error');
        return;
      }

      const msg = getRollbackStatusMessage(data.result!);
      if (data.result?.success) {
        setState('success');
        on_rollback_complete?.();
      } else {
        setErrorMsg(msg);
        setState('error');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
      setState('error');
    }
  }

  function handleRetry(e: React.MouseEvent) {
    e.stopPropagation();
    setState('idle');
    setErrorMsg('');
  }

  if (state === 'confirming') {
    return (
      <div
        className="flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs text-slate-600">
          Are you sure? This will restore the original value for this fix.
        </span>
        <button
          onClick={handleConfirm}
          className="text-xs font-medium px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          Yes, Undo
        </button>
        <button
          onClick={handleCancel}
          className="text-xs font-medium px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        {/* Spinner */}
        <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Undoing...
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
        {/* Checkmark */}
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
          <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Fix undone
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs text-red-600">{errorMsg}</span>
        <button
          onClick={handleRetry}
          className="text-xs font-medium px-2 py-0.5 border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // idle
  return (
    <button
      onClick={handleUndoClick}
      className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors px-2 py-0.5 border border-gray-200 rounded hover:border-red-300"
      title="Undo this fix"
    >
      {/* Undo icon */}
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
        <path
          d="M3.5 5.5H9a4 4 0 010 8H4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3.5 5.5L1.5 3.5M3.5 5.5L1.5 7.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Undo Fix
    </button>
  );
}
