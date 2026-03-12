/**
 * apps/dashboard/lib/auth_guard.ts
 *
 * Client route auth guard — checks if a user is allowed
 * to access a specific site. Never throws.
 */

export interface AuthGuardResult {
  allowed:      boolean;
  reason?:      'not_authenticated' | 'not_authorized' | 'site_not_found';
  redirect_to?: string;
}

export interface SiteRecord {
  site_id: string;
  user_id: string;
  domain:  string;
}

export interface AuthGuardDeps {
  loadSite: (site_id: string) => Promise<SiteRecord | null>;
}

const defaultLoadSite: AuthGuardDeps['loadSite'] = async () => null;

export async function checkClientAccess(
  user_id: string | null,
  site_id: string,
  deps?: Partial<AuthGuardDeps>,
): Promise<AuthGuardResult> {
  try {
    if (!user_id) {
      return { allowed: false, reason: 'not_authenticated', redirect_to: '/login' };
    }

    const loadSite = deps?.loadSite ?? defaultLoadSite;
    const site = await loadSite(site_id);

    if (!site) {
      return { allowed: false, reason: 'site_not_found', redirect_to: '/dashboard' };
    }

    if (site.user_id !== user_id) {
      return { allowed: false, reason: 'not_authorized', redirect_to: '/dashboard' };
    }

    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'not_authenticated', redirect_to: '/login' };
  }
}
