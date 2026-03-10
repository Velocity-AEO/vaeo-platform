import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { calculateHealthScore } from '@/lib/scoring';

export async function GET(
  _req: Request,
  { params }: { params: { siteId: string } },
) {
  const { siteId } = params;

  try {
    const db = createServerClient();

    // Fetch site info
    const { data: site, error: siteErr } = await db
      .from('sites')
      .select('site_id, site_url, cms_type')
      .eq('site_id', siteId)
      .maybeSingle();

    if (siteErr) return NextResponse.json({ error: siteErr.message }, { status: 500 });
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    // Open issues for health score
    const { data: issues, error: issErr } = await db
      .from('action_queue')
      .select('issue_type, execution_status')
      .eq('site_id', siteId)
      .in('execution_status', ['queued', 'pending_approval', 'failed']);

    if (issErr) return NextResponse.json({ error: issErr.message }, { status: 500 });

    const score = calculateHealthScore(issues ?? []);

    // Count by severity bucket
    const statusCounts = { critical: 0, major: 0, minor: 0 };
    for (const row of issues ?? []) {
      const type = row.issue_type as string;
      if (type.startsWith('ERR_') || type === 'H1_MISSING' || type === 'CANONICAL_MISSING') {
        statusCounts.critical++;
      } else if (type.includes('MISSING') || type.includes('DUPLICATE')) {
        statusCounts.major++;
      } else {
        statusCounts.minor++;
      }
    }

    return NextResponse.json({
      site_id:   site.site_id,
      site_url:  site.site_url,
      cms_type:  site.cms_type,
      score,
      issues_by_severity: statusCounts,
      total_issues: (issues ?? []).length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
