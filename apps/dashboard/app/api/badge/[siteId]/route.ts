/**
 * GET /api/badge/[siteId]
 *
 * Returns an inline SVG badge reflecting the site's current Velocity Verified status.
 *
 * Public endpoint — no auth required, CORS open for cross-site embedding.
 * Cached for 1 hour at CDN; does not expose internal scores or issue details.
 *
 * Badge states: verified | monitoring | at_risk | inactive
 */

import { NextResponse } from 'next/server';
import { getBadgeState, generateBadgeSvg } from '../../../../../../tools/badge/badge.js';
import type { BadgeDeps, BadgeSnapshot } from '../../../../../../tools/badge/badge.js';
import { createServerClient } from '../../../../lib/supabase.js';
import { calculateHealthScore } from '../../../../lib/scoring.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Issue types that classify as critical (mirrors classifyIssueSeverity in health/handler). */
function isCritical(issueType: string): boolean {
  return (
    issueType.startsWith('ERR_') ||
    issueType === 'H1_MISSING' ||
    issueType === 'CANONICAL_MISSING'
  );
}

export async function GET(
  _req: Request,
  { params }: { params: { siteId: string } },
) {
  const { siteId } = params;

  if (!UUID_RE.test(siteId)) {
    return NextResponse.json({ error: 'Invalid site ID' }, { status: 400 });
  }

  const db = createServerClient();

  const deps: BadgeDeps = {
    async getLatestSnapshot(id: string): Promise<BadgeSnapshot | null> {
      // Run in parallel: open issues (for score + critical count) + latest run timestamp.
      const [openResult, lastRunResult] = await Promise.all([
        db
          .from('action_queue')
          .select('issue_type')
          .eq('site_id', id)
          .in('execution_status', ['queued', 'pending_approval', 'failed']),
        db
          .from('action_queue')
          .select('updated_at')
          .eq('site_id', id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      // If the site has never been scanned, both queries return nothing.
      if (!lastRunResult.data) return null;

      const issues = openResult.data ?? [];
      const score  = calculateHealthScore(issues as { issue_type: string }[]);
      const critical = issues.filter((i) => isCritical(i.issue_type)).length;

      return {
        health_score:     score.total,
        critical_issues:  critical,
        last_run_at:      lastRunResult.data.updated_at as string,
      };
    },
  };

  // Fetch site URL for the accessible label — failure is non-fatal.
  const siteResult = await db
    .from('sites')
    .select('site_url')
    .eq('site_id', siteId)
    .maybeSingle();

  const siteUrl = (siteResult.data as { site_url?: string } | null)?.site_url ?? '';

  let state: Awaited<ReturnType<typeof getBadgeState>>;
  try {
    state = await getBadgeState(siteId, deps);
  } catch {
    // On DB error, return inactive badge rather than exposing an error.
    state = 'inactive';
  }

  const svg = generateBadgeSvg(state, siteUrl);

  return new Response(svg, {
    headers: {
      'Content-Type':                'image/svg+xml; charset=utf-8',
      'Cache-Control':               'public, max-age=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options':      'nosniff',
    },
  });
}
