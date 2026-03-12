'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import HealthTrend from './HealthTrend';

type Tab = 'overview' | 'fixes' | 'performance' | 'regressions' | 'aeo' | 'gsc';

interface SiteReport {
  site_id: string;
  site_url: string;
  generated_at: string;
  health: {
    current_score: number;
    current_grade: string;
    score_7d_ago: number;
    score_30d_ago: number;
    trend: 'improving' | 'declining' | 'stable';
  };
  fixes: {
    total_applied: number;
    this_week: number;
    this_month: number;
    by_type: Record<string, number>;
    recent: Array<{
      url: string;
      issue_type: string;
      applied_at: string;
      confidence: number;
      auto_approved: boolean;
    }>;
  };
  performance: {
    lighthouse_current?: { score: number; lcp: number; cls: number; measured_at: string };
    lighthouse_30d_ago?: { score: number; lcp: number; cls: number; measured_at: string };
    lcp_delta?: number;
    performance_delta?: number;
  };
  regressions: {
    active: number;
    resolved_this_week: number;
    recent: Array<{
      url: string;
      signal: string;
      detected_at: string;
      severity: string;
    }>;
  };
  aeo: {
    speakable_pages: number;
    faq_pages: number;
    answer_blocks: number;
  };
  gsc: {
    total_clicks_28d: number;
    total_impressions_28d: number;
    avg_position: number;
    top_pages: Array<{
      url: string;
      clicks: number;
      impressions: number;
      position: number;
    }>;
  };
  error?: string;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'fixes', label: 'Fixes' },
  { key: 'performance', label: 'Performance' },
  { key: 'regressions', label: 'Regressions' },
  { key: 'aeo', label: 'AEO' },
  { key: 'gsc', label: 'GSC' },
];

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-slate-200 rounded w-1/3" />
      <div className="h-4 bg-slate-200 rounded w-1/4" />
      <div className="grid grid-cols-3 gap-4 mt-6">
        <div className="h-32 bg-slate-200 rounded-xl" />
        <div className="h-32 bg-slate-200 rounded-xl" />
        <div className="h-32 bg-slate-200 rounded-xl" />
      </div>
      <div className="h-64 bg-slate-200 rounded-xl mt-4" />
    </div>
  );
}

export default function ReportPage() {
  const params = useParams();
  const siteId = params.siteId as string;

  const [report, setReport] = useState<SiteReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/report/${siteId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [siteId]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
          Failed to load report: {error}
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">{report.site_url}</h1>
          <p className="text-xs text-slate-400 mt-1">
            Last updated: {new Date(report.generated_at).toLocaleString()}
          </p>
        </div>
        <a
          href={`/api/report/${siteId}/export`}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Export Report
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors rounded-t-lg ${
              activeTab === tab.key
                ? 'bg-white border border-b-white border-slate-200 text-blue-600 -mb-px'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <HealthTrend health={report.health} />}
      {activeTab === 'fixes' && (
        <div className="text-sm text-slate-500">Fixes panel — see Fixes tab</div>
      )}
      {activeTab === 'performance' && (
        <div className="text-sm text-slate-500">Performance panel — see Performance tab</div>
      )}
      {activeTab === 'regressions' && (
        <div className="text-sm text-slate-500">Regressions panel — see Regressions tab</div>
      )}
      {activeTab === 'aeo' && (
        <div className="text-sm text-slate-500">AEO panel — see AEO tab</div>
      )}
      {activeTab === 'gsc' && (
        <div className="text-sm text-slate-500">GSC panel — see GSC tab</div>
      )}
    </div>
  );
}
