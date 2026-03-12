'use client';

import { useEffect, useState } from 'react';

type StatusLevel = 'operational' | 'degraded' | 'down' | 'maintenance';

interface ServiceStatus {
  name:        string;
  status:      StatusLevel;
  description: string;
  checked_at:  string;
}

interface PlatformStatus {
  overall:    StatusLevel;
  services:   ServiceStatus[];
  checked_at: string;
  message:    string;
}

function badgeColor(level: StatusLevel): string {
  switch (level) {
    case 'operational':  return 'bg-green-100 text-green-800';
    case 'degraded':     return 'bg-yellow-100 text-yellow-800';
    case 'down':         return 'bg-red-100 text-red-800';
    case 'maintenance':  return 'bg-blue-100 text-blue-800';
    default:             return 'bg-gray-100 text-gray-800';
  }
}

function dotColor(level: StatusLevel): string {
  switch (level) {
    case 'operational':  return 'bg-green-500';
    case 'degraded':     return 'bg-yellow-500';
    case 'down':         return 'bg-red-500';
    case 'maintenance':  return 'bg-blue-500';
    default:             return 'bg-gray-500';
  }
}

export default function StatusPage() {
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((data) => { setStatus(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8 md:px-6">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Platform Status</h1>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8 md:px-6">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Platform Status</h1>
          <p className="text-gray-600">Unable to load status. Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 md:px-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Platform Status</h1>

        {/* Overall status banner */}
        <div className={`rounded-lg p-4 mb-8 ${badgeColor(status.overall)}`}>
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${dotColor(status.overall)}`} />
            <span className="font-semibold text-lg">{status.message}</span>
          </div>
          <p className="text-sm mt-1 opacity-75">
            Last checked: {new Date(status.checked_at).toLocaleString()}
          </p>
        </div>

        {/* Service list */}
        <div className="space-y-3">
          {status.services.map((svc) => (
            <div
              key={svc.name}
              className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${dotColor(svc.status)}`} />
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{svc.name}</p>
                  <p className="text-sm text-gray-500 truncate">{svc.description}</p>
                </div>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${badgeColor(svc.status)}`}>
                {svc.status}
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 mt-8 text-center">
          Updated automatically. Refresh page for latest status.
        </p>
      </div>
    </div>
  );
}
