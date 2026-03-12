/**
 * tools/gsc/gsc_account_pool.ts
 *
 * Manages the pool of VAEO-owned Google accounts used for GSC.
 * Each account supports up to max_properties GSC properties.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface GSCAccount {
  account_id:      string;
  google_email:    string;
  property_count:  number;
  max_properties:  number;
  active:          boolean;
  created_at:      string;
}

export interface GSCAccountPool {
  accounts:           GSCAccount[];
  total_capacity:     number;
  total_used:         number;
  available_capacity: number;
}

// ── buildAccountPool ──────────────────────────────────────────────────────────

export function buildAccountPool(accounts: GSCAccount[]): GSCAccountPool {
  try {
    const arr = Array.isArray(accounts) ? accounts : [];
    const total_capacity     = arr.reduce((s, a) => s + (a.max_properties ?? 0), 0);
    const total_used         = arr.reduce((s, a) => s + (a.property_count  ?? 0), 0);
    const available_capacity = Math.max(0, total_capacity - total_used);
    return { accounts: arr, total_capacity, total_used, available_capacity };
  } catch {
    return { accounts: [], total_capacity: 0, total_used: 0, available_capacity: 0 };
  }
}

// ── getAvailableAccount ───────────────────────────────────────────────────────

export function getAvailableAccount(pool: GSCAccountPool): GSCAccount | null {
  try {
    for (const account of pool.accounts) {
      if (account.active && account.property_count < account.max_properties) {
        return account;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── isPoolNearCapacity ────────────────────────────────────────────────────────

export function isPoolNearCapacity(
  pool:              GSCAccountPool,
  warning_threshold: number,
): boolean {
  try {
    return pool.available_capacity <= warning_threshold;
  } catch {
    return false;
  }
}

// ── getPoolWarningMessage ─────────────────────────────────────────────────────

const CAPACITY_WARNING_PCT = 0.8;

export function getPoolWarningMessage(pool: GSCAccountPool): string | null {
  try {
    const near = pool.accounts.filter((a) => {
      if (!a.active) return false;
      if (a.max_properties <= 0) return false;
      return a.property_count / a.max_properties >= CAPACITY_WARNING_PCT;
    });
    if (near.length === 0) return null;
    return `GSC account pool warning: ${near.length} account(s) at 80%+ capacity`;
  } catch {
    return null;
  }
}

// ── loadAccountPool ───────────────────────────────────────────────────────────

export async function loadAccountPool(deps?: {
  loadAccountsFn?: () => Promise<GSCAccount[]>;
}): Promise<GSCAccountPool> {
  try {
    const loadFn = deps?.loadAccountsFn ?? defaultLoadAccounts;
    const accounts = await loadFn();
    return buildAccountPool(accounts);
  } catch {
    return buildAccountPool([]);
  }
}

async function defaultLoadAccounts(): Promise<GSCAccount[]> {
  return [];
}
