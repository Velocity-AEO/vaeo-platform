import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const code  = req.nextUrl.searchParams.get('code');
    const state = req.nextUrl.searchParams.get('state');

    if (!code || !state) {
      return NextResponse.redirect(new URL('/sites?gsc=error&reason=missing_params', req.url));
    }

    // Validate state cookie
    const savedState = req.cookies.get('gsc_state')?.value;
    if (!savedState || savedState !== state) {
      return NextResponse.redirect(new URL('/sites?gsc=error&reason=invalid_state', req.url));
    }

    // Extract site_id from state (format: site_id:uuid)
    const siteId = state.split(':')[0];
    if (!siteId) {
      return NextResponse.redirect(new URL('/sites?gsc=error&reason=missing_site_id', req.url));
    }

    const clientId     = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri  = process.env.GSC_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.redirect(new URL('/sites?gsc=error&reason=not_configured', req.url));
    }

    // Exchange code for tokens
    const body = new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL('/sites?gsc=error&reason=token_exchange_failed', req.url));
    }

    const tokens = await tokenRes.json() as {
      access_token:  string;
      refresh_token: string;
      expires_in:    number;
    };

    // Store token in sites.extra_data
    const supabase = createServerClient();
    const { data: site } = await supabase
      .from('sites')
      .select('extra_data')
      .eq('id', siteId)
      .single();

    const extraData = (site?.extra_data as Record<string, unknown>) ?? {};
    extraData.gsc_token = {
      site_id:       siteId,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope:         'webmasters.readonly',
      created_at:    new Date().toISOString(),
    };

    await supabase
      .from('sites')
      .update({ extra_data: extraData })
      .eq('id', siteId);

    // Clear state cookie and redirect
    const response = NextResponse.redirect(new URL('/sites?gsc=connected', req.url));
    response.cookies.delete('gsc_state');
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('GSC callback error:', message);
    return NextResponse.redirect(new URL('/sites?gsc=error&reason=unexpected', req.url));
  }
}
