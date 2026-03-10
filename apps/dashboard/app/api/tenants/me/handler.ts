/**
 * app/api/tenants/me/handler.ts
 *
 * Pure business logic for tenant provisioning.
 * GET  → return current tenant (404 if none).
 * POST → get-or-create tenant for the authenticated user.
 *
 * No Next.js or Supabase imports. All DB access injectable via TenantDeps.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TenantRow {
  id:            string;
  name:          string;
  owner_user_id: string;
  plan:          'starter' | 'pro' | 'enterprise';
  created_at:    string;
}

export interface TenantDeps {
  /** Fetch tenant owned by userId. Returns null if none exists. */
  getTenantByUserId: (userId: string) => Promise<TenantRow | null>;
  /** Insert a new tenant for userId with the given display name. */
  createTenant: (userId: string, name: string) => Promise<TenantRow>;
}

export interface GetTenantResult {
  ok: boolean;
  tenant?: TenantRow;
  error?: string;
  status: number;
}

export interface EnsureTenantResult {
  ok: boolean;
  tenant?: TenantRow;
  created: boolean;
  error?: string;
  status: number;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/** GET — return existing tenant or 404. */
export async function handleGetTenant(
  userId: string,
  deps: TenantDeps,
): Promise<GetTenantResult> {
  try {
    const tenant = await deps.getTenantByUserId(userId);
    if (!tenant) {
      return { ok: false, error: 'No tenant found for this user', status: 404 };
    }
    return { ok: true, tenant, status: 200 };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      status: 500,
    };
  }
}

/** POST — get existing tenant or create one. Idempotent. */
export async function handleEnsureTenant(
  userId: string,
  name: string,
  deps: TenantDeps,
): Promise<EnsureTenantResult> {
  try {
    const existing = await deps.getTenantByUserId(userId);
    if (existing) {
      return { ok: true, tenant: existing, created: false, status: 200 };
    }

    const tenantName = typeof name === 'string' && name.trim() ? name.trim() : 'My Workspace';
    const tenant = await deps.createTenant(userId, tenantName);
    return { ok: true, tenant, created: true, status: 201 };
  } catch (err) {
    return {
      ok: false,
      created: false,
      error: err instanceof Error ? err.message : String(err),
      status: 500,
    };
  }
}
