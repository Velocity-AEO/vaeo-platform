import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  generateSiteReport,
  type ReportDeps,
  type GSCPageSummary,
} from '@tools/reports/report_aggregator.js';
import type { Grade } from '@tools/scoring/health_score.js';

// Re-use the same deps builder from the parent route.
// In a real app these would be shared, but keeping it self-contained
// avoids cross-route import issues in Next.js app router.

function buildRealDeps(): ReportDeps {
  const db = createServerClient();

  return {
    async loadSite(siteId) {
      const { data, error } = await db.from('sites').select('site_url').eq('site_id', siteId).maybeSingle();
      if (error) throw new Error(error.message);
      return data as { site_url: string } | null;
    },
    async loadHealthScore(siteId) {
      const { data } = await db.from('sites').select('health_score').eq('site_id', siteId).maybeSingle();
      if (!data?.health_score) return null;
      const hs = data.health_score as Record<string, unknown>;
      return { score: (hs.score as number) ?? 0, grade: (hs.grade as Grade) ?? 'F' };
    },
    async loadHealthScoreAt(siteId, daysAgo) {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - daysAgo);
      const { data } = await db.from('learnings').select('metadata').eq('site_id', siteId).eq('fix_type', 'health_snapshot').lte('applied_at', cutoff.toISOString()).order('applied_at', { ascending: false }).limit(1).maybeSingle();
      if (!data?.metadata) return null;
      return ((data.metadata as Record<string, unknown>).score as number) ?? null;
    },
    async loadFixes(siteId) {
      const { data } = await db.from('action_queue').select('url, issue_type, updated_at, proposed_fix, execution_status').eq('site_id', siteId).in('execution_status', ['deployed', 'completed']);
      return (data ?? []).map((row: Record<string, unknown>) => {
        const fix = (row.proposed_fix ?? {}) as Record<string, unknown>;
        return { url: (row.url as string) ?? '', issue_type: (row.issue_type as string) ?? '', applied_at: (row.updated_at as string) ?? '', confidence: (fix.confidence as number) ?? 0.8, auto_approved: (fix.auto_approved as boolean) ?? false };
      });
    },
    async loadLighthouseCurrent(siteId) {
      const { data } = await db.from('learnings').select('metadata, applied_at').eq('site_id', siteId).eq('fix_type', 'lighthouse').order('applied_at', { ascending: false }).limit(1).maybeSingle();
      if (!data?.metadata) return null;
      const m = data.metadata as Record<string, unknown>;
      return { score: (m.performance as number) ?? 0, lcp: (m.lcp as number) ?? 0, cls: (m.cls as number) ?? 0, measured_at: (data.applied_at as string) ?? '' };
    },
    async loadLighthouse30d(siteId) {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
      const { data } = await db.from('learnings').select('metadata, applied_at').eq('site_id', siteId).eq('fix_type', 'lighthouse').lte('applied_at', cutoff.toISOString()).order('applied_at', { ascending: false }).limit(1).maybeSingle();
      if (!data?.metadata) return null;
      const m = data.metadata as Record<string, unknown>;
      return { score: (m.performance as number) ?? 0, lcp: (m.lcp as number) ?? 0, cls: (m.cls as number) ?? 0, measured_at: (data.applied_at as string) ?? '' };
    },
    async loadRegressions(siteId) {
      const { data } = await db.from('learnings').select('url, fix_type, applied_at, metadata').eq('site_id', siteId).eq('issue_type', 'regression');
      return (data ?? []).map((row: Record<string, unknown>) => {
        const m = (row.metadata ?? {}) as Record<string, unknown>;
        return { url: (row.url as string) ?? '', signal: (row.fix_type as string) ?? '', detected_at: (row.applied_at as string) ?? '', severity: (m.severity as string) ?? 'minor', resolved: (m.resolved as boolean) ?? false };
      });
    },
    async loadAEOCoverage(siteId) {
      const { data } = await db.from('action_queue').select('issue_type').eq('site_id', siteId).in('execution_status', ['deployed', 'completed']).in('issue_type', ['SPEAKABLE_MISSING', 'FAQ_OPPORTUNITY', 'ANSWER_BLOCK_OPPORTUNITY']);
      const rows = data ?? [];
      return { speakable_pages: rows.filter((r: Record<string, unknown>) => r.issue_type === 'SPEAKABLE_MISSING').length, faq_pages: rows.filter((r: Record<string, unknown>) => r.issue_type === 'FAQ_OPPORTUNITY').length, answer_blocks: rows.filter((r: Record<string, unknown>) => r.issue_type === 'ANSWER_BLOCK_OPPORTUNITY').length };
    },
    async loadGSCData(siteId) {
      const { data } = await db.from('learnings').select('metadata').eq('site_id', siteId).eq('fix_type', 'gsc_summary').order('applied_at', { ascending: false }).limit(1).maybeSingle();
      if (!data?.metadata) return null;
      const m = data.metadata as Record<string, unknown>;
      return { total_clicks_28d: (m.total_clicks_28d as number) ?? 0, total_impressions_28d: (m.total_impressions_28d as number) ?? 0, avg_position: (m.avg_position as number) ?? 0, top_pages: (m.top_pages as GSCPageSummary[]) ?? [] };
    },
  };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { siteId: string } },
) {
  try {
    const report = await generateSiteReport(params.siteId, buildRealDeps());

    if (report.error) {
      const status = report.error.includes('not found') ? 404 : 500;
      return NextResponse.json({ error: report.error }, { status });
    }

    const date = new Date().toISOString().slice(0, 10);
    const filename = `vaeo-report-${date}.json`;

    return new NextResponse(JSON.stringify(report, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename=${filename}`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
