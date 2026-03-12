import { NextResponse } from 'next/server';

// ── POST /api/invites/[inviteId]/accept ───────────────────────────────────────

export async function POST(
  _request: Request,
  { params }: { params: { inviteId: string } },
) {
  try {
    const inviteId = params.inviteId;

    if (!inviteId) {
      return NextResponse.json(
        { error: 'Invalid invite' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // TODO: Load invite from Supabase
    // TODO: Check isInviteValid
    // TODO: Create read-only user account
    // TODO: Associate user with site_id
    // TODO: Set accepted_at on invite

    // Stub: return success
    return NextResponse.json({
      success: true,
      invite_id: inviteId,
      site_id: 'stub_site',
      redirect_to: '/client/stub_site',
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to accept invite' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
