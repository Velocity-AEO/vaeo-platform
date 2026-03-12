/**
 * apps/dashboard/middleware.ts
 *
 * Auth guard + tenant header injection.
 *
 * For every non-public request:
 *   1. Verify the Supabase session (refreshes token if expired).
 *   2. If no valid session → redirect page routes to /login, reject API routes with 401.
 *   3. Look up the user's tenant and inject X-Tenant-Id header so API routes
 *      can read it cheaply without an extra DB round-trip.
 *
 * Public paths (no auth required):
 *   /login            — login page
 *   /api/auth/**      — auth endpoints (login, magic-link, callback, logout)
 *   /_next/**         — Next.js static assets (handled by matcher exclusion)
 *   /favicon.ico      — static asset
 */

import { createServerClient } from '@supabase/ssr';
import { createClient }       from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// ── Public path detection ─────────────────────────────────────────────────────

const PUBLIC_PREFIXES = ['/login', '/onboarding', '/api/auth/', '/api/badge/', '/api/verify/', '/verify/', '/api/onboarding/', '/api/shopify/', '/api/gsc/', '/favicon.ico'];

/** Exported for unit testing the pure routing logic. */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

// ── Tenant lookup (service-role, single indexed query) ────────────────────────

async function fetchTenantId(userId: string): Promise<string | null> {
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
                     ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const db = createClient(url, serviceKey);
  const { data } = await db
    .from('tenants')
    .select('id')
    .eq('owner_user_id', userId)
    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Build a mutable response so @supabase/ssr can refresh the session cookie.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Propagate refreshed cookies to both the request and response.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() validates the JWT and refreshes if near-expired.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const isApi = request.nextUrl.pathname.startsWith('/api/');
    if (isApi) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Inject tenant_id as a request header for downstream API routes.
  const tenantId = await fetchTenantId(user.id);

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.set('x-user-id', user.id);
  if (tenantId) forwardHeaders.set('x-tenant-id', tenantId);

  response = NextResponse.next({
    request: { headers: forwardHeaders },
  });

  return response;
}

export const config = {
  matcher: [
    // Match everything except Next.js internals and static files.
    '/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
