'use client';

import { useEffect, useState } from 'react';

export default function GSCButton({ siteId }: { siteId: string }) {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
  const [lastConnected, setLastConnected] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/gsc/status/${siteId}`)
      .then((r) => r.json())
      .then((data: { connected: boolean; last_connected?: string }) => {
        setStatus(data.connected ? 'connected' : 'disconnected');
        if (data.last_connected) setLastConnected(data.last_connected);
      })
      .catch(() => setStatus('disconnected'));
  }, [siteId]);

  if (status === 'loading') {
    return <span className="text-xs text-slate-400">...</span>;
  }

  if (status === 'connected') {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium text-green-700 bg-green-50 border-green-200">
          GSC Connected
        </span>
        {lastConnected && (
          <span className="text-[10px] text-slate-400">
            {new Date(lastConnected).toLocaleDateString()}
          </span>
        )}
      </span>
    );
  }

  return (
    <a
      href={`/api/gsc/connect?site_id=${siteId}`}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-medium text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 transition-colors"
    >
      Connect GSC
    </a>
  );
}
