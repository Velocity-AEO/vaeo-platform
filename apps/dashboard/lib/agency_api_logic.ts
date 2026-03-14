/**
 * apps/dashboard/lib/agency_api_logic.ts
 *
 * Pure helpers for the agency UI and API layer.
 * Never throws.
 */

import {
  AGENCY_PLAN_LIMITS,
  type AgencyPlan,
} from '@tools/agency/agency_account.js';
import {
  AGENCY_PLAN_PRICES_CENTS,
  formatAgencyAmount,
} from '@tools/agency/agency_billing.js';

// ── buildAgencyCreateRequest ──────────────────────────────────────────────────

export function buildAgencyCreateRequest(
  agency_name: string,
  plan:         AgencyPlan,
): { agency_name: string; plan: AgencyPlan } {
  try {
    return { agency_name: agency_name ?? '', plan: plan ?? 'starter' };
  } catch {
    return { agency_name: '', plan: 'starter' };
  }
}

// ── getAgencyPlanLabel ────────────────────────────────────────────────────────

export function getAgencyPlanLabel(plan: AgencyPlan): string {
  try {
    const labels: Record<AgencyPlan, string> = {
      starter:    `Starter — up to ${AGENCY_PLAN_LIMITS.starter} sites`,
      growth:     `Growth — up to ${AGENCY_PLAN_LIMITS.growth} sites`,
      enterprise: `Enterprise — up to ${AGENCY_PLAN_LIMITS.enterprise} sites`,
    };
    return labels[plan] ?? plan;
  } catch {
    return plan ?? 'unknown';
  }
}

// ── getAgencyPlanPrice ────────────────────────────────────────────────────────

export function getAgencyPlanPrice(plan: AgencyPlan): string {
  try {
    const cents = AGENCY_PLAN_PRICES_CENTS[plan] ?? 0;
    return `${formatAgencyAmount(cents)}/mo`;
  } catch {
    return '$0.00/mo';
  }
}
