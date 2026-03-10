/**
 * apps/dashboard/scripts/seed.ts
 *
 * Dev seed — creates a test tenant + test user in Supabase.
 *
 * Run from apps/dashboard/:
 *   node --import tsx/esm scripts/seed.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * (load from .env.local automatically if present).
 *
 * Idempotent: safe to run multiple times; skips creation if already exists.
 *
 * Dev credentials:
 *   email:    dev@vaeo.test
 *   password: dev-password-1
 *   tenant:   00000000-0000-0000-0000-000000000001  (matches HARDCODED_TENANT)
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ── Load .env.local ───────────────────────────────────────────────────────────

function loadEnvLocal() {
  try {
    const lines = readFileSync('.env.local', 'utf-8').split('\n');
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // .env.local absent — rely on existing env
  }
}

loadEnvLocal();

// ── Constants ─────────────────────────────────────────────────────────────────

const DEV_EMAIL     = 'dev@vaeo.test';
const DEV_PASSWORD  = 'dev-password-1';
const DEV_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEV_TENANT_NAME = 'Dev Workspace';

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('[seed] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const db = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. Create or find test user ──────────────────────────────────────────

  console.log('[seed] Looking for dev user…');

  const { data: existingUsers } = await db.auth.admin.listUsers();
  const existing = existingUsers?.users.find((u) => u.email === DEV_EMAIL);

  let userId: string;

  if (existing) {
    userId = existing.id;
    console.log(`[seed] User exists: ${userId}`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email:             DEV_EMAIL,
      password:          DEV_PASSWORD,
      email_confirm:     true,
    });

    if (error || !data.user) {
      console.error('[seed] Failed to create user:', error?.message);
      process.exit(1);
    }

    userId = data.user.id;
    console.log(`[seed] Created user: ${userId}`);
  }

  // ── 2. Create or find test tenant ────────────────────────────────────────

  console.log('[seed] Looking for dev tenant…');

  const { data: existingTenant } = await db
    .from('tenants')
    .select('id')
    .eq('id', DEV_TENANT_ID)
    .maybeSingle();

  if (existingTenant) {
    console.log(`[seed] Tenant exists: ${DEV_TENANT_ID}`);
  } else {
    const { error } = await db.from('tenants').insert({
      id:            DEV_TENANT_ID,
      name:          DEV_TENANT_NAME,
      owner_user_id: userId,
      plan:          'starter',
    });

    if (error) {
      console.error('[seed] Failed to create tenant:', error.message);
      process.exit(1);
    }

    console.log(`[seed] Created tenant: ${DEV_TENANT_ID}`);
  }

  // ── 3. Summary ───────────────────────────────────────────────────────────

  console.log('\n✅  Seed complete.\n');
  console.log(`  Email:     ${DEV_EMAIL}`);
  console.log(`  Password:  ${DEV_PASSWORD}`);
  console.log(`  User ID:   ${userId}`);
  console.log(`  Tenant ID: ${DEV_TENANT_ID}`);
  console.log('\nRun the dashboard with: npm run dev\n');
}

seed().catch((err) => {
  console.error('[seed] Fatal:', err);
  process.exit(1);
});
