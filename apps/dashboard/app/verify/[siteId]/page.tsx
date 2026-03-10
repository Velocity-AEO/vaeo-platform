'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

// ── Types ────────────────────────────────────────────────────────────────────

interface VerifyData {
  site_url:         string;
  domain:           string;
  health_score:     number;
  grade:            string;
  last_verified_at: string | null;
  issues_resolved:  number;
  checks_performed: string[];
  badge_state:      'verified' | 'needs_work' | 'inactive';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function gradeColor(grade: string) {
  switch (grade) {
    case 'A': return { bg: 'bg-emerald-500', text: 'text-emerald-600', ring: 'ring-emerald-200', light: 'bg-emerald-50' };
    case 'B': return { bg: 'bg-blue-500',    text: 'text-blue-600',    ring: 'ring-blue-200',    light: 'bg-blue-50' };
    case 'C': return { bg: 'bg-yellow-500',  text: 'text-yellow-600',  ring: 'ring-yellow-200',  light: 'bg-yellow-50' };
    case 'D': return { bg: 'bg-orange-500',  text: 'text-orange-600',  ring: 'ring-orange-200',  light: 'bg-orange-50' };
    default:  return { bg: 'bg-red-500',     text: 'text-red-600',     ring: 'ring-red-200',     light: 'bg-red-50' };
  }
}

function badgeLabel(state: string) {
  switch (state) {
    case 'verified':   return { label: 'Verified',        color: 'bg-emerald-100 text-emerald-700 ring-emerald-300' };
    case 'needs_work': return { label: 'In Progress',     color: 'bg-yellow-100 text-yellow-700 ring-yellow-300' };
    default:           return { label: 'Awaiting Review',  color: 'bg-slate-100 text-slate-600 ring-slate-300' };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function VerifyPage() {
  const params = useParams();
  const siteId = params.siteId as string;

  const [data, setData]       = useState<VerifyData | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/verify/${siteId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? 'Site not found');
        }
        return res.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [siteId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="animate-pulse space-y-4 w-full max-w-lg px-6">
          <div className="h-8 bg-slate-700 rounded w-48 mx-auto" />
          <div className="h-64 bg-slate-700 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center px-6">
          <div className="text-6xl mb-4">?</div>
          <h1 className="text-xl font-semibold text-white mb-2">Site Not Found</h1>
          <p className="text-slate-400">This verification page is not available.</p>
        </div>
      </div>
    );
  }

  const gc = gradeColor(data.grade);
  const badge = badgeLabel(data.badge_state);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex flex-col">
      {/* Card */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {/* Verification Card */}
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-8 py-6 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-1">
                Velocity Verified
              </p>
              <h1 className="text-xl font-bold text-white">{data.domain}</h1>
              <div className="mt-3">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ring-1 ${badge.color}`}>
                  {data.badge_state === 'verified' && (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                  )}
                  {badge.label}
                </span>
              </div>
            </div>

            {/* Score */}
            <div className="px-8 py-8 text-center border-b border-slate-100">
              <div className="inline-flex items-center gap-5">
                <div className={`w-20 h-20 rounded-full ${gc.bg} flex items-center justify-center shadow-lg`}>
                  <span className="text-3xl font-bold text-white">{data.grade}</span>
                </div>
                <div className="text-left">
                  <p className="text-4xl font-bold text-slate-900">{data.health_score}</p>
                  <p className="text-sm text-slate-500">Health Score</p>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
              <div className="px-8 py-5 text-center">
                <p className="text-2xl font-bold text-emerald-600">{data.issues_resolved}</p>
                <p className="text-xs text-slate-500 mt-1">Issues Resolved</p>
              </div>
              <div className="px-8 py-5 text-center">
                <p className="text-2xl font-bold text-slate-900">
                  {data.last_verified_at ? formatDate(data.last_verified_at) : 'Pending'}
                </p>
                <p className="text-xs text-slate-500 mt-1">Last Verified</p>
              </div>
            </div>

            {/* What Was Checked */}
            <div className="px-8 py-6">
              <h2 className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-3">
                What Was Checked
              </h2>
              <div className="flex flex-wrap gap-2">
                {data.checks_performed.map((check) => (
                  <span
                    key={check}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-xs font-medium"
                  >
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    {check}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-6">
            <a
              href="https://velocityaeo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-300 transition-colors text-sm"
            >
              <span className="font-semibold">Powered by Velocity AEO</span>
            </a>
            <p className="text-xs text-slate-600 mt-2">
              Automated SEO health monitoring and optimization
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
