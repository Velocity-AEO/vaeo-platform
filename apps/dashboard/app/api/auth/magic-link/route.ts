import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { handleMagicLink } from './handler';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: () => { /* magic link send doesn't set cookies */ },
      },
    },
  );

  // The redirect URL must point to our callback route which exchanges the code.
  const emailRedirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/api/auth/callback`;

  const result = await handleMagicLink(body, {
    sendOtp: async (email) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo },
      });
      return { error: error?.message ?? null };
    },
  });

  return NextResponse.json(
    result.ok ? { ok: true } : { error: result.error },
    { status: result.status },
  );
}
