import { NextRequest, NextResponse } from 'next/server';

// ── Sample events for demo ────────────────────────────────────────────────────

function makeSampleEvents(siteId: string) {
  const now = Date.now();
  return [
    {
      id: 'evt-001',
      timestamp: new Date(now - 120_000).toISOString(),
      session_id: 'sess-abc123',
      site_id: siteId,
      event_type: 'decision',
      issue_type: 'title_missing',
      url: 'https://mystore.myshopify.com/products/summer-dress',
      reasoning: 'Selected fix type: meta_title',
      confidence_score: 0.87,
    },
    {
      id: 'evt-002',
      timestamp: new Date(now - 118_000).toISOString(),
      session_id: 'sess-abc123',
      site_id: siteId,
      event_type: 'fix_applied',
      issue_type: 'title_missing',
      url: 'https://mystore.myshopify.com/products/summer-dress',
      reasoning: 'Fix applied successfully: meta_title',
      confidence_score: 0.87,
      health_delta: 5,
      duration_ms: 342,
    },
    {
      id: 'evt-003',
      timestamp: new Date(now - 117_500).toISOString(),
      session_id: 'sess-abc123',
      site_id: siteId,
      event_type: 'learning_write',
      issue_type: 'title_missing',
      url: 'https://mystore.myshopify.com/products/summer-dress',
      reasoning: 'Learning written: pattern=title_missing::mystore.myshopify.com, delta=0.050',
      confidence_score: 0.87,
    },
    {
      id: 'evt-004',
      timestamp: new Date(now - 90_000).toISOString(),
      session_id: 'sess-def456',
      site_id: siteId,
      event_type: 'decision',
      issue_type: 'schema_missing',
      url: 'https://mystore.myshopify.com/products/linen-shirt',
      reasoning: 'Selected fix type: schema',
      confidence_score: 0.72,
    },
    {
      id: 'evt-005',
      timestamp: new Date(now - 88_000).toISOString(),
      session_id: 'sess-def456',
      site_id: siteId,
      event_type: 'fix_failed',
      issue_type: 'schema_missing',
      url: 'https://mystore.myshopify.com/products/linen-shirt',
      reasoning: 'Fix failed: Shopify resource lookup failed (404)',
      confidence_score: 0.72,
      health_delta: 0,
      duration_ms: 1205,
    },
    {
      id: 'evt-006',
      timestamp: new Date(now - 60_000).toISOString(),
      session_id: 'sess-ghi789',
      site_id: siteId,
      event_type: 'confidence_check',
      issue_type: 'meta_desc_missing',
      url: 'https://mystore.myshopify.com/pages/about',
      reasoning: 'Confidence check passed (0.81 > threshold 0.6)',
      confidence_score: 0.81,
    },
    {
      id: 'evt-007',
      timestamp: new Date(now - 55_000).toISOString(),
      session_id: 'sess-ghi789',
      site_id: siteId,
      event_type: 'approval_gate',
      issue_type: 'meta_desc_missing',
      url: 'https://mystore.myshopify.com/pages/about',
      reasoning: 'Auto-approved: confidence 0.81 exceeds threshold',
      confidence_score: 0.81,
    },
    {
      id: 'evt-008',
      timestamp: new Date(now - 50_000).toISOString(),
      session_id: 'sess-ghi789',
      site_id: siteId,
      event_type: 'fix_applied',
      issue_type: 'meta_desc_missing',
      url: 'https://mystore.myshopify.com/pages/about',
      reasoning: 'Fix applied successfully: meta_description',
      confidence_score: 0.81,
      health_delta: 5,
      duration_ms: 289,
    },
    {
      id: 'evt-009',
      timestamp: new Date(now - 30_000).toISOString(),
      session_id: 'sess-jkl012',
      site_id: siteId,
      event_type: 'sandbox_run',
      issue_type: 'canonical_missing',
      url: 'https://mystore.myshopify.com/collections/sale',
      reasoning: 'Sandbox verification passed: canonical tag present after patch',
      confidence_score: 0.65,
    },
    {
      id: 'evt-010',
      timestamp: new Date(now - 10_000).toISOString(),
      session_id: 'sess-jkl012',
      site_id: siteId,
      event_type: 'learning_write',
      issue_type: 'canonical_missing',
      url: 'https://mystore.myshopify.com/collections/sale',
      reasoning: 'Learning written: pattern=canonical_missing::mystore.myshopify.com, delta=0.050',
      confidence_score: 0.65,
    },
  ];
}

// ── GET /api/debug/[siteId] ───────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { siteId: string } },
) {
  const { siteId } = await params;
  const events = makeSampleEvents(siteId).slice(0, 50);

  return NextResponse.json(
    { site_id: siteId, events, total: events.length },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

// ── POST /api/debug/[siteId] ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { events?: unknown[] };
    const events = Array.isArray(body.events) ? body.events : [];
    if (process.env['NODE_ENV'] === 'development') {
      console.log('[debug] received', events.length, 'events');
    }
    return NextResponse.json({ received: events.length });
  } catch {
    return NextResponse.json({ received: 0 }, { status: 400 });
  }
}
