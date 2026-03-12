import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  buildVehicleSiteReport,
  type VehicleSiteReport,
} from '../../../../../../../tools/reports/vehicle_report.js';

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { siteId: string } },
) {
  try {
    const db = createServerClient();
    const siteId = params.siteId;

    // Verify site exists
    const { data: site, error: siteErr } = await db
      .from('sites')
      .select('site_id, site_url')
      .eq('site_id', siteId)
      .maybeSingle();

    if (siteErr) {
      return NextResponse.json({ error: siteErr.message }, { status: 500 });
    }
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Load crawled pages for this site
    const { data: pages, error: pagesErr } = await db
      .from('crawled_pages')
      .select('url, html')
      .eq('site_id', siteId)
      .not('html', 'is', null)
      .limit(500);

    if (pagesErr) {
      return NextResponse.json({ error: pagesErr.message }, { status: 500 });
    }

    const pageInputs = (pages ?? []).map((p: Record<string, unknown>) => ({
      url:  (p.url as string) ?? '',
      html: (p.html as string) ?? '',
    }));

    const report: VehicleSiteReport = buildVehicleSiteReport(siteId, pageInputs);

    return NextResponse.json(report, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
