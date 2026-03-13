/**
 * tools/multisite/multisite_account_resolver.ts
 *
 * Resolves which sites belong to an account and determines account type.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type AccountType = 'direct' | 'agency';

export interface AccountSites {
  account_id:   string;
  account_type: AccountType;
  site_ids:     string[];
  site_count:   number;
}

// ── detectAccountType ─────────────────────────────────────────────────────────

export interface DetectAccountTypeDeps {
  /** Returns true when the account_id belongs to an agency record. */
  isAgencyFn?: (account_id: string) => Promise<boolean>;
}

export async function detectAccountType(
  account_id: string,
  deps?:      DetectAccountTypeDeps,
): Promise<AccountType> {
  try {
    const id       = account_id ?? '';
    const isAgency = deps?.isAgencyFn ?? defaultIsAgency;
    const agency   = await isAgency(id).catch(() => false);
    return agency ? 'agency' : 'direct';
  } catch {
    return 'direct';
  }
}

// ── resolveAccountSites ───────────────────────────────────────────────────────

export interface ResolveAccountSitesDeps {
  /** Returns site_ids for a direct (non-agency) account. */
  loadDirectSitesFn?:  (account_id: string) => Promise<string[]>;
  /** Returns site_ids for an agency account (all client sites). */
  loadAgencySitesFn?:  (account_id: string) => Promise<string[]>;
  /** Optional override for detectAccountType — useful in tests. */
  detectAccountTypeFn?: (account_id: string) => Promise<AccountType>;
}

export async function resolveAccountSites(
  account_id: string,
  deps?:       ResolveAccountSitesDeps,
): Promise<AccountSites> {
  try {
    const id = account_id ?? '';

    const detectFn      = deps?.detectAccountTypeFn ?? ((aid) => detectAccountType(aid));
    const account_type  = await detectFn(id).catch((): AccountType => 'direct');

    let site_ids: string[];
    if (account_type === 'agency') {
      const loadFn = deps?.loadAgencySitesFn ?? defaultLoadAgencySites;
      site_ids = await loadFn(id).catch(() => []);
    } else {
      const loadFn = deps?.loadDirectSitesFn ?? defaultLoadDirectSites;
      site_ids = await loadFn(id).catch(() => []);
    }

    const ids = Array.isArray(site_ids) ? site_ids : [];

    return {
      account_id:   id,
      account_type,
      site_ids:     ids,
      site_count:   ids.length,
    };
  } catch {
    return {
      account_id:   account_id ?? '',
      account_type: 'direct',
      site_ids:     [],
      site_count:   0,
    };
  }
}

// ── hasMultipleSites ──────────────────────────────────────────────────────────

export function hasMultipleSites(account: AccountSites): boolean {
  try {
    return (account?.site_count ?? 0) > 1;
  } catch {
    return false;
  }
}

// ── shouldShowMultisiteDashboard ──────────────────────────────────────────────

export function shouldShowMultisiteDashboard(account: AccountSites): boolean {
  try {
    if (!account) return false;
    if (account.account_type === 'agency') return true;
    return hasMultipleSites(account);
  } catch {
    return false;
  }
}

// ── Defaults ──────────────────────────────────────────────────────────────────

async function defaultIsAgency(_account_id: string): Promise<boolean> {
  return false;
}

async function defaultLoadDirectSites(_account_id: string): Promise<string[]> {
  return [];
}

async function defaultLoadAgencySites(_account_id: string): Promise<string[]> {
  return [];
}
