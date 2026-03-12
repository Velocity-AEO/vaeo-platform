import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  findKnownApp,
  calculateMonthlySavings,
  generateROIStatement,
  type KnownApp,
} from '../../../../../../../tools/apps/known_seo_apps.js';

/**
 * GET /api/apps/roi?site_id=xxx
 * Returns ROI calculation based on replaced apps for a site.
 */
export async function GET(req: NextRequest) {
  try {
    const siteId = req.nextUrl.searchParams.get('site_id');
    if (!siteId) {
      return NextResponse.json({ error: 'site_id is required' }, { status: 400 });
    }

    const db = createServerClient();
    const { data: rows } = await db
      .from('app_replacements')
      .select('app_name')
      .eq('site_id', siteId);

    const appNames = (rows ?? []).map((r: Record<string, unknown>) => r.app_name as string);
    const matchedApps: KnownApp[] = [];

    for (const name of appNames) {
      const known = findKnownApp(name);
      if (known) matchedApps.push(known);
    }

    const monthlySavings = calculateMonthlySavings(matchedApps);
    const vaeoMonthlyCost = 49; // Pro plan default
    const roiStatement = generateROIStatement(matchedApps, vaeoMonthlyCost);

    return NextResponse.json({
      monthly_savings: monthlySavings,
      apps_replaced:   matchedApps,
      roi_statement:   roiStatement,
    }, {
      status: 200,
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
