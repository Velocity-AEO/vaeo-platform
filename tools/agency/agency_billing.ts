/**
 * tools/agency/agency_billing.ts
 *
 * Agency-tier billing: plan prices, bill calculation, summaries.
 * Never throws.
 */

import type { AgencyAccount, AgencyPlan } from './agency_account.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgencyBillingRecord {
  billing_id:   string;
  agency_id:    string;
  period_start: string;
  period_end:   string;
  active_sites: number;
  plan:         AgencyPlan;
  amount_cents: number;
  status:       'pending' | 'paid' | 'overdue' | 'cancelled';
}

// ── Plan prices (cents) ───────────────────────────────────────────────────────

export const AGENCY_PLAN_PRICES_CENTS: Record<AgencyPlan, number> = {
  starter:    29_900,    // $299/mo
  growth:     79_900,    // $799/mo
  enterprise: 199_900,   // $1999/mo
};

// ── calculateAgencyBill ───────────────────────────────────────────────────────

export function calculateAgencyBill(
  agency:       AgencyAccount,
  period_start: string,
  period_end:   string,
): AgencyBillingRecord {
  try {
    return {
      billing_id:   `bill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      agency_id:    agency.agency_id,
      period_start,
      period_end,
      active_sites: agency.active_client_sites,
      plan:         agency.plan,
      amount_cents: AGENCY_PLAN_PRICES_CENTS[agency.plan] ?? 0,
      status:       'pending',
    };
  } catch {
    return {
      billing_id:   'bill_err',
      agency_id:    agency?.agency_id ?? '',
      period_start: period_start ?? '',
      period_end:   period_end ?? '',
      active_sites: 0,
      plan:         'starter',
      amount_cents: 0,
      status:       'pending',
    };
  }
}

// ── getAgencyBillingSummary ───────────────────────────────────────────────────

export function getAgencyBillingSummary(records: AgencyBillingRecord[]): {
  total_billed_cents:  number;
  total_paid_cents:    number;
  outstanding_cents:   number;
  overdue_count:       number;
} {
  try {
    const arr = Array.isArray(records) ? records : [];
    const total_billed_cents = arr.reduce((s, r) => s + (r.amount_cents ?? 0), 0);
    const total_paid_cents   = arr
      .filter((r) => r.status === 'paid')
      .reduce((s, r) => s + r.amount_cents, 0);
    const outstanding_cents  = arr
      .filter((r) => r.status === 'pending' || r.status === 'overdue')
      .reduce((s, r) => s + r.amount_cents, 0);
    const overdue_count = arr.filter((r) => r.status === 'overdue').length;
    return { total_billed_cents, total_paid_cents, outstanding_cents, overdue_count };
  } catch {
    return { total_billed_cents: 0, total_paid_cents: 0, outstanding_cents: 0, overdue_count: 0 };
  }
}

// ── isAgencyOverdue ───────────────────────────────────────────────────────────

export function isAgencyOverdue(records: AgencyBillingRecord[]): boolean {
  try {
    return Array.isArray(records) && records.some((r) => r.status === 'overdue');
  } catch {
    return false;
  }
}

// ── formatAgencyAmount ────────────────────────────────────────────────────────

export function formatAgencyAmount(amount_cents: number): string {
  try {
    const dollars = (amount_cents ?? 0) / 100;
    return `$${dollars.toFixed(2)}`;
  } catch {
    return '$0.00';
  }
}
