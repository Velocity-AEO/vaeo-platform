/**
 * app/api/tenants/me/route.ts
 *
 * GET  /api/tenants/me      — return current user's tenant (404 if none).
 * POST /api/tenants/me      — create or return tenant (idempotent).
 *
 * x-user-id header is injected by middleware.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';
import { handleGetTenant, handleEnsureTenant, type TenantRow, type TenantDeps } from './handler';

function buildDeps(): TenantDeps {
  const db = createServerClient();

  return {
    async getTenantByUserId(userId) {
      const { data, error } = await db
        .from('tenants')
        .select('id, name, owner_user_id, plan, created_at')
        .eq('owner_user_id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as TenantRow | null;
    },

    async createTenant(userId, name) {
      const { data, error } = await db
        .from('tenants')
        .insert({ owner_user_id: userId, name, plan: 'starter' })
        .select('id, name, owner_user_id, plan, created_at')
        .single();
      if (error) throw new Error(error.message);
      return data as TenantRow;
    },
  };
}

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const result = await handleGetTenant(userId, buildDeps());
  return NextResponse.json(
    result.ok ? result.tenant : { error: result.error },
    { status: result.status },
  );
}

export async function POST(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { name = '' } = await req.json().catch(() => ({}));

  const result = await handleEnsureTenant(userId, name, buildDeps());
  return NextResponse.json(
    result.ok ? { tenant: result.tenant, created: result.created } : { error: result.error },
    { status: result.status },
  );
}
