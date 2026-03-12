import { NextResponse } from 'next/server';

// ── Inline types ──────────────────────────────────────────────────────────────

interface GSCSiteStatus {
  site_id:        string;
  domain:         string;
  gsc_onboarded:  boolean;
  verified:       boolean;
  account_id:     string | null;
  last_synced_at: string | null;
  ranking_count:  number;
  data_source:    'gsc_live' | 'simulated';
  status_message: string;
}

function buildStubStatus(site_id: string): GSCSiteStatus {
  return {
    site_id,
    domain: '',
    gsc_onboarded: false,
    verified: false,
    account_id: null,
    last_synced_at: null,
    ranking_count: 0,
    data_source: 'simulated',
    status_message: 'GSC setup in progress',
  };
}

// ── GET /api/sites/[siteId]/gsc-status ────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: { siteId: string } },
) {
  try {
    const siteId = params.siteId;
    const status = buildStubStatus(siteId);
    return NextResponse.json(status, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(buildStubStatus(''), {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
