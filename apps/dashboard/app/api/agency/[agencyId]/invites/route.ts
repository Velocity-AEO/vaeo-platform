import { NextResponse } from 'next/server';

// ── Inline types ──────────────────────────────────────────────────────────────

interface AgencyInvite {
  invite_id:    string;
  agency_id:    string;
  site_id:      string;
  client_email: string;
  client_name:  string | null;
  invited_at:   string;
  expires_at:   string;
  accepted_at:  string | null;
  status:       'pending' | 'accepted' | 'expired';
}

function buildInvite(agency_id: string, site_id: string, client_email: string, client_name?: string): AgencyInvite {
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    invite_id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agency_id,
    site_id,
    client_email,
    client_name: client_name ?? null,
    invited_at: now.toISOString(),
    expires_at: expires.toISOString(),
    accepted_at: null,
    status: 'pending',
  };
}

// ── GET /api/agency/[agencyId]/invites ────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: { agencyId: string } },
) {
  try {
    // Stub: return empty invite list
    return NextResponse.json({ invites: [], agency_id: params.agencyId }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ invites: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
}

// ── POST /api/agency/[agencyId]/invites ───────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: { agencyId: string } },
) {
  try {
    const body = await request.json();
    const { site_id, client_email, client_name } = body ?? {};

    if (!site_id || !client_email) {
      return NextResponse.json(
        { error: 'site_id and client_email are required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const invite = buildInvite(params.agencyId, site_id, client_email, client_name);

    // TODO: save to Supabase agency_invites table
    // TODO: send invite email via sendEmailFn

    return NextResponse.json(invite, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to create invite' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
