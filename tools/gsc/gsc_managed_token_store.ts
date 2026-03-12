/**
 * tools/gsc/gsc_managed_token_store.ts
 *
 * OAuth token storage for VAEO-managed Google accounts.
 * Stores tokens per VAEO account (not per client site).
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ManagedGSCToken {
  account_id:    string;
  google_email:  string;
  access_token:  string;
  refresh_token: string;
  expires_at:    string;
  scopes:        string[];
}

// ── isTokenExpired ───────────────────────────────────────────────────────────

export function isTokenExpired(token: ManagedGSCToken): boolean {
  try {
    if (!token?.expires_at) return true;
    const expiresAt = new Date(token.expires_at).getTime();
    const buffer = 5 * 60 * 1000; // 5 minutes
    return Date.now() > expiresAt - buffer;
  } catch {
    return true;
  }
}

// ── loadManagedToken ─────────────────────────────────────────────────────────

export async function loadManagedToken(
  account_id: string,
  deps?: { loadFn?: (account_id: string) => Promise<ManagedGSCToken | null> },
): Promise<ManagedGSCToken | null> {
  try {
    const loadFn = deps?.loadFn ?? defaultLoadToken;
    return await loadFn(account_id);
  } catch {
    return null;
  }
}

async function defaultLoadToken(_account_id: string): Promise<ManagedGSCToken | null> {
  return null;
}

// ── saveManagedToken ─────────────────────────────────────────────────────────

export async function saveManagedToken(
  token: ManagedGSCToken,
  deps?: { saveFn?: (token: ManagedGSCToken) => Promise<void> },
): Promise<boolean> {
  try {
    const saveFn = deps?.saveFn ?? defaultSaveToken;
    await saveFn(token);
    return true;
  } catch {
    return false;
  }
}

async function defaultSaveToken(_token: ManagedGSCToken): Promise<void> {}

// ── refreshManagedToken ──────────────────────────────────────────────────────

export async function refreshManagedToken(
  account_id: string,
  deps?: {
    loadFn?:    (account_id: string) => Promise<ManagedGSCToken | null>;
    refreshFn?: (refresh_token: string) => Promise<{ access_token: string; expires_at: string }>;
    saveFn?:    (token: ManagedGSCToken) => Promise<void>;
  },
): Promise<ManagedGSCToken | null> {
  try {
    const existing = await loadManagedToken(account_id, { loadFn: deps?.loadFn });
    if (!existing) return null;

    if (!isTokenExpired(existing)) return existing;

    if (!deps?.refreshFn) return null;
    const refreshed = await deps.refreshFn(existing.refresh_token);

    const updated: ManagedGSCToken = {
      ...existing,
      access_token: refreshed.access_token,
      expires_at:   refreshed.expires_at,
    };

    await saveManagedToken(updated, { saveFn: deps?.saveFn });
    return updated;
  } catch {
    return null;
  }
}

// ── getValidToken ────────────────────────────────────────────────────────────

export async function getValidToken(
  account_id: string,
  deps?: {
    loadFn?:    (account_id: string) => Promise<ManagedGSCToken | null>;
    refreshFn?: (refresh_token: string) => Promise<{ access_token: string; expires_at: string }>;
    saveFn?:    (token: ManagedGSCToken) => Promise<void>;
  },
): Promise<string | null> {
  try {
    const existing = await loadManagedToken(account_id, { loadFn: deps?.loadFn });
    if (!existing) return null;

    if (!isTokenExpired(existing)) return existing.access_token;

    const refreshed = await refreshManagedToken(account_id, deps);
    return refreshed?.access_token ?? null;
  } catch {
    return null;
  }
}
