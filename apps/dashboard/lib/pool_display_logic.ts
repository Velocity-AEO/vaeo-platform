/**
 * apps/dashboard/lib/pool_display_logic.ts
 *
 * Display helpers for GSC account pool admin page.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GSCAccountPool {
  accounts: Array<{
    account_id:     string;
    email:          string;
    property_count: number;
    max_properties: number;
  }>;
  total_used:     number;
  total_capacity: number;
}

// ── getAccountStatusColor ─────────────────────────────────────────────────────

export function getAccountStatusColor(
  account: { property_count: number; max_properties: number },
): 'green' | 'yellow' | 'red' {
  try {
    if (!account || account.max_properties <= 0) return 'green';
    const pct = (account.property_count / account.max_properties) * 100;
    if (pct >= 90) return 'red';
    if (pct >= 70) return 'yellow';
    return 'green';
  } catch {
    return 'green';
  }
}

// ── getUtilizationPercent ─────────────────────────────────────────────────────

export function getUtilizationPercent(used: number, capacity: number): number {
  try {
    if (!capacity || capacity <= 0) return 0;
    return Math.round((used / capacity) * 100);
  } catch {
    return 0;
  }
}

// ── getPoolHealthSummary ──────────────────────────────────────────────────────

export function getPoolHealthSummary(pool: GSCAccountPool): string {
  try {
    if (!pool) return '0 of 0 properties used across 0 accounts';
    const n = pool.accounts?.length ?? 0;
    return `${pool.total_used ?? 0} of ${pool.total_capacity ?? 0} properties used across ${n} accounts`;
  } catch {
    return '0 of 0 properties used across 0 accounts';
  }
}
