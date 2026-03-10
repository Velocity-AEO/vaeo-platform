/**
 * app/api/auth/callback/route.ts
 *
 * Exchanges the one-time code from a magic-link email for a full session.
 * Supabase redirects the user here after they click the link:
 *   /api/auth/callback?code=<one-time-code>
 */

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const next = req.nextUrl.searchParams.get('next') ?? '/';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', req.url));
  }

  const pendingCookies: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cs) => { pendingCookies.push(...cs); },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const url = new URL('/login', req.url);
    url.searchParams.set('error', error.message);
    return NextResponse.redirect(url);
  }

  const destination = new URL(next.startsWith('/') ? next : '/', req.url);
  const response = NextResponse.redirect(destination);

  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options as Record<string, unknown>);
  }

  return response;
}
