import { NextResponse } from 'next/server';

// ── Inline types ──────────────────────────────────────────────────────────────

type AgencyReportPeriod = 'last_7_days' | 'last_30_days' | 'last_90_days';

interface AgencyReport {
  agency_id:            string;
  period:               AgencyReportPeriod;
  generated_at:         string;
  total_sites:          number;
  total_fixes_applied:  number;
  total_issues_resolved: number;
  average_health_score: number | null;
  top_fix_types:        Array<{ fix_type: string; count: number }>;
  sites_improved:       number;
  sites_declined:       number;
  gsc_connected_count:  number;
}

function buildStubReport(agency_id: string, period: AgencyReportPeriod): AgencyReport {
  return {
    agency_id,
    period,
    generated_at: new Date().toISOString(),
    total_sites: 0,
    total_fixes_applied: 0,
    total_issues_resolved: 0,
    average_health_score: null,
    top_fix_types: [],
    sites_improved: 0,
    sites_declined: 0,
    gsc_connected_count: 0,
  };
}

// ── GET /api/agency/[agencyId]/report ─────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: { agencyId: string } },
) {
  try {
    const url = new URL(request.url);
    const period = (url.searchParams.get('period') ?? 'last_30_days') as AgencyReportPeriod;
    const report = buildStubReport(params.agencyId, period);

    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      buildStubReport('', 'last_30_days'),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
