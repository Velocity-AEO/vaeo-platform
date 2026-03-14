/**
 * apps/dashboard/app/api/agency/[agencyId]/health/route.ts
 *
 * GET /api/agency/:agencyId/health
 * Returns aggregated health overview for all client sites in the agency.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchAgencyHealthOverview } from '@tools/agency/agency_health_overview.js';

export async function GET(
  _req: NextRequest,
  { params }: { params: { agencyId: string } },
) {
  try {
    const { agencyId } = params;
    if (!agencyId) {
      return NextResponse.json({ error: 'Missing agencyId' }, { status: 400 });
    }

    const overview = await fetchAgencyHealthOverview(agencyId);
    return NextResponse.json(overview);
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
