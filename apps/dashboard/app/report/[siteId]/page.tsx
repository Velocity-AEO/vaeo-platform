'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import HealthTrend from './HealthTrend';
import FixesPanel from './FixesPanel';
import PerformancePanel from './PerformancePanel';
import RegressionsPanel from './RegressionsPanel';
import AEOPanel from './AEOPanel';
import GSCPanel from './GSCPanel';

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
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
      <div className="px-4 md:px-6 w-full max-w-5xl mx-auto">
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 md:px-6 w-full max-w-5xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
          Failed to load report: {error}
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="px-4 md:px-6 w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg md:text-xl font-semibold truncate max-w-xs md:max-w-none">{report.site_url}</h1>
          <p className="text-xs text-slate-400 mt-1">
            Last updated: {new Date(report.generated_at).toLocaleString()}
          </p>
        </div>
        <a
          href={`/api/report/${siteId}/export`}
          className="inline-flex items-center justify-center h-11 sm:h-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto"
        >
          Export Report
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 sm:px-4 py-2 text-sm font-medium transition-colors rounded-t-lg whitespace-nowrap h-11 sm:h-auto ${
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
      {activeTab === 'fixes' && <FixesPanel fixes={report.fixes} />}
      {activeTab === 'performance' && <PerformancePanel performance={report.performance} />}
      {activeTab === 'regressions' && <RegressionsPanel regressions={report.regressions} />}
      {activeTab === 'aeo' && <AEOPanel aeo={report.aeo} />}
      {activeTab === 'gsc' && <GSCPanel gsc={report.gsc} />}
    </div>
  );
}
