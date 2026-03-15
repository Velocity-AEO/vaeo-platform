/**
 * POST /api/sites/[siteId]/crawl
 *
 * Runs a full crawl + audit pipeline for the site and writes new issues to
 * action_queue with execution_status='queued'. Existing approved/deployed rows
 * are untouched (upsert with ignoreDuplicates=true in the audit writeQueue).
 *
 * Never sets execution_status='approved' — only the dashboard UI approval action
 * (POST /api/sites/[siteId]/fixes with action='approve') may do that.
 *
 * Returns: { urls_crawled, issues_found, issues_written }
 * Errors:  { error: string } with 4xx/5xx status.
 *
 * maxDuration=300 — crawls of large sites take 60–120 seconds; must not time out.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { runCrawl } from '../../../../../../../packages/commands/src/crawl.js';
import { runAudit } from '../../../../../../../packages/commands/src/audit.js';
import type { CmsType } from '../../../../../../../packages/core/types.js';

// Allow up to 5 minutes — crawls of large sites can take 60–120 s.
export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
): Promise<NextResponse> {
  const { siteId } = await params;

  // Look up tenant_id + cms_type — both required by the crawl/audit commands.
  const db = createServerClient();
  const { data: site, error: siteError } = await db
    .from('sites')
    .select('tenant_id, cms_type')
    .eq('site_id', siteId)
    .maybeSingle();

  if (siteError || !site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  }

  const tenantId = site.tenant_id as string;
  const cmsType  = site.cms_type  as CmsType;

  // ── Crawl ──────────────────────────────────────────────────────────────────

  const crawlResult = await runCrawl({
    site_id:   siteId,
    tenant_id: tenantId,
  });

  if (crawlResult.status === 'failed') {
    return NextResponse.json(
      { error: crawlResult.error ?? 'Crawl failed' },
      { status: 500 },
    );
  }

  // ── Audit ──────────────────────────────────────────────────────────────────
  // Run audit even when crawl status is 'partial' — some URLs crawled is enough.

  const auditResult = await runAudit({
    run_id:    crawlResult.run_id,
    tenant_id: tenantId,
    site_id:   siteId,
    cms:       cmsType,
  });

  if (auditResult.status === 'failed') {
    return NextResponse.json(
      { error: auditResult.error ?? 'Audit failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    urls_crawled:   crawlResult.urls_crawled,
    issues_found:   auditResult.issues_found,
    issues_written: auditResult.action_queue_populated ? auditResult.issues_found : 0,
  });
}
