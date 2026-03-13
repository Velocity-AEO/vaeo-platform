'use client';

/**
 * components/SuspensionBadge.tsx
 *
 * Shows a 'Suspended' badge with tooltip and 'Resume Now' button
 * for suspended pipeline sites. Admin/agency role only.
 * Never throws.
 */

import { useState } from 'react';

export interface SuspensionBadgeProps {
  siteId:              string;
  suspendedUntil:      string;     // ISO string
  consecutiveFailures: number;
  /** Only renders when true — caller checks role */
  isAdmin:             boolean;
}

export default function SuspensionBadge({
  siteId,
  suspendedUntil,
  consecutiveFailures,
  isAdmin,
}: SuspensionBadgeProps) {
  const [loading,  setLoading]  = useState(false);
  const [resumed,  setResumed]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  if (!isAdmin || resumed) return null;

  const tooltipText = `Suspended until ${new Date(suspendedUntil).toLocaleString()} — ${consecutiveFailures} consecutive failure${consecutiveFailures === 1 ? '' : 's'}`;

  async function handleResume() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/sites/${siteId}/resume`, { method: 'POST' });
      if (res.ok) {
        setResumed(true);
      } else {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? 'Resume failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resume failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        title={tooltipText}
        className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-orange-50 text-orange-700 border-orange-200 cursor-default"
      >
        Suspended
      </span>
      <button
        onClick={handleResume}
        disabled={loading}
        title="Resume pipeline for this site"
        className="text-xs text-blue-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Resuming…' : 'Resume Now'}
      </button>
      {error && (
        <span className="text-xs text-red-500" title={error}>!</span>
      )}
    </span>
  );
}
