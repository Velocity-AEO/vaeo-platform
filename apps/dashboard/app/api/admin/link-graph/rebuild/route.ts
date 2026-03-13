import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/admin/link-graph/rebuild
 * Triggers a manual link graph rebuild. Admin only.
 * Body: { scope: 'single'|'stale'|'all', site_id?: string, reason: string }
 */
export async function POST(
  req: NextRequest,
) {
  try {
    // TODO: check admin session — return 403 if not admin

    const body = await req.json().catch(() => null);
    if (!body?.scope) {
      return NextResponse.json({ error: 'missing_scope' }, { status: 400 });
    }

    if (!['single', 'stale', 'all'].includes(body.scope)) {
      return NextResponse.json({ error: 'invalid_scope' }, { status: 400 });
    }

    if (body.scope === 'single' && !body.site_id) {
      return NextResponse.json({ error: 'missing_site_id' }, { status: 400 });
    }

    // In production: call triggerGraphRebuild with queue deps
    const queuedSites = body.scope === 'single'
      ? [body.site_id]
      : body.scope === 'stale'
        ? ['site_2']
        : ['site_1', 'site_2'];

    return NextResponse.json({
      success: true,
      queued_count: queuedSites.length,
      queued_sites: queuedSites,
      error: null,
      requested_at: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
