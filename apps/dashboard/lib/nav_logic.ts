/**
 * apps/dashboard/lib/nav_logic.ts
 *
 * Logic layer for dynamic nav — builds nav items from site list
 * and determines nav state. Never throws.
 */

export interface NavSite {
  site_id:  string;
  domain:   string;
  platform?: string;
}

export interface NavItem {
  label: string;
  href:  string;
}

export function buildNavItems(
  sites: NavSite[],
): NavItem[] {
  try {
    return sites.map((s) => ({
      label: s.domain,
      href:  `/client/${s.site_id}`,
    }));
  } catch {
    return [];
  }
}

export type NavState = 'loading' | 'empty' | 'error' | 'ready';

export function getNavState(
  sites: NavSite[] | null,
  loading: boolean,
  error: boolean,
): NavState {
  try {
    if (loading) return 'loading';
    if (error) return 'error';
    if (!sites || sites.length === 0) return 'empty';
    return 'ready';
  } catch {
    return 'error';
  }
}
