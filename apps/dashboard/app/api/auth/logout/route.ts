/**
 * app/api/auth/logout/route.ts
 *
 * Signs the user out of Supabase and clears the session cookies.
 * Redirects to /login after sign-out.
 */

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
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

  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL('/login', req.url));

  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options as Record<string, unknown>);
  }

  return response;
}
