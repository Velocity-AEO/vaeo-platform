import { createClient } from '@supabase/supabase-js';

const url     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Private service role key — available server-side via doppler, never sent to browser.
// Falls back to anon key in environments where SERVICE_ROLE_KEY is not set.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? anonKey;

// Browser / client-component singleton — anon key, safe to expose.
export const supabase = createClient(url, anonKey);

// Server-side helper — uses service role key to bypass RLS.
// Only call from server components, API routes, or server actions.
export function createServerClient() {
  return createClient(url, serviceKey);
}
