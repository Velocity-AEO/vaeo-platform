import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

function buildGSCAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         GSC_SCOPE,
    state,
    access_type:   'offline',
    prompt:        'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const clientId    = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GSC_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        { ok: false, error: 'GSC OAuth not configured' },
        { status: 500 },
      );
    }

    const siteId = req.nextUrl.searchParams.get('site_id') ?? '';
    const state  = `${siteId}:${crypto.randomUUID()}`;

    const authUrl = buildGSCAuthUrl(clientId, redirectUri, state);

    const response = NextResponse.redirect(authUrl);
    response.cookies.set('gsc_state', state, {
      httpOnly: true,
      secure:   true,
      sameSite: 'lax',
      maxAge:   600,
      path:     '/',
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
