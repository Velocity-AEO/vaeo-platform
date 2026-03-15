import { createClient } from '@supabase/supabase-js';

// Browser / client-component singleton — anon key, safe to expose.
// Constants read at module-load time for the browser bundle.
const browserUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const browserAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const supabase = createClient(browserUrl, browserAnonKey);

/**
 * Server-side Supabase client — always uses the service role key to bypass RLS.
 *
 * Env vars are read at call time (not module-load time) so the correct values
 * are picked up regardless of when dotenv/doppler loads them.
 *
 * Only call from server components, API routes, or server actions — never
 * expose this client to the browser.
 */
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return createClient(url, key);
}
