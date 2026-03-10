/**
 * apps/dashboard/scripts/migrate.ts
 *
 * Applies pending SQL migrations to the live Supabase project
 * using the service role key + pg-meta API (Supabase internal).
 *
 * Usage (from apps/dashboard/):
 *   node --import tsx/esm scripts/migrate.ts
 *
 * Falls back to printing the SQL for manual application if the API is unavailable.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ── Env ───────────────────────────────────────────────────────────────────────

function loadEnvLocal(cwd: string) {
  try {
    const lines = readFileSync(join(cwd, '.env.local'), 'utf-8').split('\n');
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch { /* no .env.local */ }
}

const cwd = new URL('..', import.meta.url).pathname;
loadEnvLocal(cwd);

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// ── SQL execution via pg-meta ─────────────────────────────────────────────────

async function execSQL(sql: string): Promise<{ rows: unknown[]; error?: string }> {
  // Supabase exposes a SQL execution API at /pg-meta/v1/query (used by Studio SQL editor)
  const res = await fetch(`${SUPABASE_URL}/pg-meta/v1/query`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const data = await res.json() as unknown;
  if (!res.ok) return { rows: [], error: JSON.stringify(data) };
  return { rows: Array.isArray(data) ? data : [] };
}

// ── Check what's already applied ──────────────────────────────────────────────

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await execSQL(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${name}' LIMIT 1`,
  );
  return rows.length > 0;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function migrate() {
  const migrationsDir = resolve(cwd, '../../supabase/migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`\n[migrate] Supabase project: ${SUPABASE_URL}`);
  console.log(`[migrate] Found ${files.length} migration files\n`);

  // Quick connectivity check
  const { rows: versionRows, error: versionError } = await execSQL('SELECT version()');
  if (versionError) {
    console.error('[migrate] Cannot reach pg-meta API:', versionError);
    console.error('[migrate] pg-meta requires a Supabase project with Studio enabled.');
    console.log('\n── Manual application ──────────────────────────────────────');
    console.log('Apply migrations in the Supabase SQL editor at:');
    console.log(`  https://supabase.com/dashboard/project/cynerpmdabqklsjchlix/sql`);
    console.log('\nOR get your DB password from Settings > Database and run:');
    console.log('  npx supabase db push --db-url "postgresql://postgres:[PASSWORD]@db.cynerpmdabqklsjchlix.supabase.co:5432/postgres"');
    process.exit(1);
  }

  const version = (versionRows[0] as { version: string }).version;
  console.log(`[migrate] Connected: ${version.split(' ').slice(0, 2).join(' ')}`);

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');

    // Idempotency: skip migration 011 if tenants table already exists
    if (file === '011_create_tenants_and_rls.sql') {
      const exists = await tableExists('tenants');
      if (exists) {
        console.log(`[migrate] ✓ ${file} — already applied (tenants table exists)`);
        continue;
      }
    }

    console.log(`[migrate] Applying ${file}…`);
    const { error } = await execSQL(sql);
    if (error) {
      console.error(`[migrate] ✗ ${file} failed:`, error);
      process.exit(1);
    }
    console.log(`[migrate] ✓ ${file} — done`);
  }

  console.log('\n[migrate] All migrations complete.\n');
}

migrate().catch((err) => {
  console.error('[migrate] Fatal:', err);
  process.exit(1);
});
