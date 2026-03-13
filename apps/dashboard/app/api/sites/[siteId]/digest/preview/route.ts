/**
 * GET /api/sites/[siteId]/digest/preview
 *
 * Returns an HTML preview of the digest email for a site.
 * Use case: preview email in browser before sending to real clients.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildDigestEmailHTML, type DigestEmailData } from '../../../../../../../tools/notifications/digest_email_template.js';
import { loadWhiteLabelConfig, applyWhiteLabelToDigest } from '../../../../../../../tools/notifications/digest_white_label.js';

interface RouteContext {
  params: Promise<{ siteId: string }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { siteId } = await context.params;

    if (!siteId) {
      return NextResponse.json({ error: 'missing site_id' }, { status: 400 });
    }

    // Build sample digest data — in production this would load real site data
    let data: DigestEmailData = {
      site_domain:         'example.com',
      period_label:        'This Week',
      health_score:        82,
      health_score_change: 5,
      fixes_applied:       7,
      fixes_failed:        0,
      open_issues:         3,
      top_fixes: [
        { issue_type: 'Missing Title Tag', url: 'https://example.com/products/widget', applied_at: new Date().toISOString(), impact_label: 'Critical' },
        { issue_type: 'Missing Meta Description', url: 'https://example.com/about', applied_at: new Date().toISOString(), impact_label: 'High' },
        { issue_type: 'Invalid Schema', url: 'https://example.com/contact', applied_at: new Date().toISOString(), impact_label: 'High' },
        { issue_type: 'Missing Alt Text', url: 'https://example.com/blog/post-1', applied_at: new Date().toISOString(), impact_label: 'Low' },
      ],
      biggest_ranking_gain: { keyword: 'best widgets 2026', change: 12 },
      gsc_connected:       true,
      agency_name:         null,
      white_label_color:   null,
      unsubscribe_url:     '#unsubscribe',
      dashboard_url:       `/client/${siteId}`,
    };

    // Apply white label if available
    try {
      const wlConfig = await loadWhiteLabelConfig(siteId);
      data = applyWhiteLabelToDigest(data, wlConfig);
    } catch { /* non-fatal */ }

    const html = buildDigestEmailHTML(data);

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type':  'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'preview generation failed' }, { status: 500 });
  }
}
