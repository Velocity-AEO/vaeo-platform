import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser / client-component singleton
export const supabase = createClient(url, key);

// Server-side helper (same anon key — RLS enforces access)
export function createServerClient() {
  return createClient(url, key);
}
