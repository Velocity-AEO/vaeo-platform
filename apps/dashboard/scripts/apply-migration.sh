#!/usr/bin/env bash
# apps/dashboard/scripts/apply-migration.sh
#
# Applies migration 011 (tenants + RLS) then runs the seed script.
#
# Usage:
#   DB_PASS="<your-db-password>" bash apps/dashboard/scripts/apply-migration.sh
#
# Get your DB password from:
#   https://supabase.com/dashboard/project/cynerpmdabqklsjchlix/settings/database
#   → "Connection string" → "URI" → the part after postgres: and before @
#
# Alternatively, set SUPABASE_ACCESS_TOKEN and this script will attempt
#   npx supabase db push instead.

set -euo pipefail

PROJECT_REF="cynerpmdabqklsjchlix"
MIGRATION="$(dirname "$0")/../../supabase/migrations/011_create_tenants_and_rls.sql"
MIGRATION="$(cd "$(dirname "$MIGRATION")" && pwd)/$(basename "$MIGRATION")"

PSQL="/opt/homebrew/opt/libpq/bin/psql"

if [[ ! -x "$PSQL" ]]; then
  echo "psql not found at $PSQL. Run: brew install libpq"
  exit 1
fi

if [[ -z "${DB_PASS:-}" ]]; then
  echo ""
  echo "ERROR: DB_PASS environment variable not set."
  echo ""
  echo "Get your database password from:"
  echo "  https://supabase.com/dashboard/project/${PROJECT_REF}/settings/database"
  echo "  (Connection string → URI → the password portion)"
  echo ""
  echo "Then run:"
  echo "  DB_PASS='<password>' bash apps/dashboard/scripts/apply-migration.sh"
  echo ""
  exit 1
fi

echo "[migrate] Applying migration 011 via connection pooler (IPv4)…"
echo "[migrate] Migration: $MIGRATION"
echo ""

# Try connection pooler first (IPv4-compatible, avoids IPv6 issues)
PGPASSWORD="$DB_PASS" "$PSQL" \
  "postgresql://postgres.${PROJECT_REF}:${DB_PASS}@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  -f "$MIGRATION" \
  -v ON_ERROR_STOP=1 \
  && echo "[migrate] ✓ Migration applied" \
  || {
    echo "[migrate] Pooler failed, trying direct connection…"
    PGPASSWORD="$DB_PASS" "$PSQL" \
      "postgresql://postgres:${DB_PASS}@db.${PROJECT_REF}.supabase.co:5432/postgres" \
      -f "$MIGRATION" \
      -v ON_ERROR_STOP=1 \
      && echo "[migrate] ✓ Migration applied (direct)"
  }

echo ""
echo "[seed] Running seed script…"
cd "$(dirname "$0")/.."
node --import tsx/esm scripts/seed.ts

echo ""
echo "✅  Done. Start the dev server with: npm run dev"
echo "   Login at http://localhost:3000/login"
echo "   Email:    dev@vaeo.test"
echo "   Password: dev-password-1"
