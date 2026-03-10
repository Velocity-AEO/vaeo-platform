/**
 * apps/dashboard/lib/auth.ts
 *
 * Server-side auth helpers for API route handlers.
 *
 * The middleware injects x-user-id and x-tenant-id headers on every
 * authenticated request, so handlers can read them cheaply without
 * an extra DB round-trip.
 */

// ── Header readers ────────────────────────────────────────────────────────────

/**
 * Read the tenant_id injected by middleware.
 * Returns null if the header is absent (e.g. on public routes or in tests).
 */
export function getTenantIdFromRequest(req: Request): string | null {
  return req.headers.get('x-tenant-id');
}

/**
 * Read the user_id injected by middleware.
 * Returns null if absent.
 */
export function getUserIdFromRequest(req: Request): string | null {
  return req.headers.get('x-user-id');
}

/**
 * Assert that a tenant_id is present; throw if missing.
 * Use in API routes that must be scoped to a tenant.
 */
export function requireTenantId(req: Request): string {
  const id = getTenantIdFromRequest(req);
  if (!id) throw new Error('No tenant_id on request — is middleware configured?');
  return id;
}

/**
 * Assert that a user_id is present; throw if missing.
 */
export function requireUserId(req: Request): string {
  const id = getUserIdFromRequest(req);
  if (!id) throw new Error('No user_id on request — is middleware configured?');
  return id;
}
