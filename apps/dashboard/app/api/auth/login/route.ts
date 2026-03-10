import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { validateLoginInput, handleLogin } from './handler';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const validation = validateLoginInput(body);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Collect cookies set during auth so we can apply them to the response.
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

  const result = await handleLogin(validation, {
    signIn: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      return { session: data.session, error: error?.message ?? null };
    },
  });

  const response = result.ok
    ? NextResponse.json({ ok: true }, { status: 200 })
    : NextResponse.json({ error: result.error }, { status: result.status });

  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options as Record<string, unknown>);
  }

  return response;
}
