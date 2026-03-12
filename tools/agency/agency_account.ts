/**
 * tools/agency/agency_account.ts
 *
 * Core agency account types and pure helpers.
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type AgencyPlan = 'starter' | 'growth' | 'enterprise';

export interface AgencyAccount {
  agency_id:           string;
  agency_name:         string;
  owner_user_id:       string;
  plan:                AgencyPlan;
  max_client_sites:    number;
  active_client_sites: number;
  whitelabel_enabled:  boolean;
  created_at:          string;
  active:              boolean;
}

// ── Plan limits ───────────────────────────────────────────────────────────────

export const AGENCY_PLAN_LIMITS: Record<AgencyPlan, number> = {
  starter:    10,
  growth:     50,
  enterprise: 200,
};

// ── buildAgencyAccount ────────────────────────────────────────────────────────

export function buildAgencyAccount(
  agency_name:   string,
  owner_user_id: string,
  plan:          AgencyPlan,
): AgencyAccount {
  try {
    return {
      agency_id:           `agency_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      agency_name:         agency_name ?? '',
      owner_user_id:       owner_user_id ?? '',
      plan,
      max_client_sites:    AGENCY_PLAN_LIMITS[plan] ?? 10,
      active_client_sites: 0,
      whitelabel_enabled:  plan !== 'starter',
      created_at:          new Date().toISOString(),
      active:              true,
    };
  } catch {
    return {
      agency_id:           'agency_err',
      agency_name:         '',
      owner_user_id:       '',
      plan:                'starter',
      max_client_sites:    10,
      active_client_sites: 0,
      whitelabel_enabled:  false,
      created_at:          new Date().toISOString(),
      active:              true,
    };
  }
}

// ── canAddClientSite ──────────────────────────────────────────────────────────

export function canAddClientSite(agency: AgencyAccount): boolean {
  try {
    return agency.active_client_sites < agency.max_client_sites;
  } catch {
    return false;
  }
}

// ── isAgencyAtCapacity ────────────────────────────────────────────────────────

export function isAgencyAtCapacity(agency: AgencyAccount): boolean {
  try {
    return agency.active_client_sites >= agency.max_client_sites;
  } catch {
    return true;
  }
}

// ── getAgencyCapacityMessage ──────────────────────────────────────────────────

export function getAgencyCapacityMessage(agency: AgencyAccount): string {
  try {
    return `${agency.active_client_sites} of ${agency.max_client_sites} client sites used`;
  } catch {
    return '0 of 0 client sites used';
  }
}

// ── upgradeAgencyPlan ─────────────────────────────────────────────────────────

export function upgradeAgencyPlan(
  agency:   AgencyAccount,
  new_plan: AgencyPlan,
): AgencyAccount {
  try {
    return {
      ...agency,
      plan:               new_plan,
      max_client_sites:   AGENCY_PLAN_LIMITS[new_plan] ?? agency.max_client_sites,
      whitelabel_enabled: new_plan !== 'starter',
    };
  } catch {
    return agency;
  }
}
