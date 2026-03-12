/**
 * tools/billing/usage_tracker.ts
 *
 * Tracks tenant usage against plan limits.
 * Injectable DB deps for testing. Never throws.
 */

import { type PlanTier, PLAN_DEFINITIONS } from './plan_definitions.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UsageRecord {
  tenant_id:        string;
  period:           string;
  sites_count:      number;
  crawls_this_month: number;
  fixes_this_month:  number;
  last_updated:     string;
}

export interface UsageLimitResult {
  allowed:  boolean;
  reason?:  string;
  current:  number;
  limit:    number;
}

export interface TenantPlan {
  tier:           PlanTier;
  billing_status: 'active' | 'past_due' | 'canceled' | 'trialing';
}

export interface UsageDb {
  /** Count sites belonging to tenant. */
  countSites:  (tenant_id: string) => Promise<number>;
  /** Count crawl jobs this calendar month. */
  countCrawls: (tenant_id: string, period: string) => Promise<number>;
  /** Count deployed fixes this calendar month. */
  countFixes:  (tenant_id: string, period: string) => Promise<number>;
  /** Get tenant plan tier and billing status. */
  getTenantPlan: (tenant_id: string) => Promise<TenantPlan | null>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function currentPeriod(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// ── getCurrentUsage ─────────────────────────────────────────────────────────

export async function getCurrentUsage(
  tenant_id: string,
  db:        UsageDb,
): Promise<UsageRecord> {
  const period = currentPeriod();
  try {
    const [sites_count, crawls_this_month, fixes_this_month] = await Promise.all([
      db.countSites(tenant_id).catch(() => 0),
      db.countCrawls(tenant_id, period).catch(() => 0),
      db.countFixes(tenant_id, period).catch(() => 0),
    ]);
    return {
      tenant_id,
      period,
      sites_count,
      crawls_this_month,
      fixes_this_month,
      last_updated: new Date().toISOString(),
    };
  } catch {
    return {
      tenant_id,
      period,
      sites_count:       0,
      crawls_this_month: 0,
      fixes_this_month:  0,
      last_updated:      new Date().toISOString(),
    };
  }
}

// ── Action to limit mapping ─────────────────────────────────────────────────

type BillingAction = 'add_site' | 'start_crawl' | 'apply_fix'
                   | 'export' | 'aeo' | 'vehicle_schema';

const ACTION_TO_LIMIT: Record<BillingAction, { countField: keyof UsageRecord | null, limitField: keyof typeof PLAN_DEFINITIONS.starter | null }> = {
  add_site:       { countField: 'sites_count',       limitField: 'sites_allowed' },
  start_crawl:    { countField: 'crawls_this_month',  limitField: 'crawls_per_month' },
  apply_fix:      { countField: 'fixes_this_month',   limitField: 'fixes_per_month' },
  export:         { countField: null,                  limitField: 'exports_allowed' },
  aeo:            { countField: null,                  limitField: 'aeo_features' },
  vehicle_schema: { countField: null,                  limitField: 'vehicle_schema' },
};

// ── checkUsageLimit ─────────────────────────────────────────────────────────

export async function checkUsageLimit(
  tenant_id: string,
  tier:      PlanTier,
  action:    BillingAction,
  db:        UsageDb,
): Promise<UsageLimitResult> {
  try {
    const mapping = ACTION_TO_LIMIT[action];
    if (!mapping) {
      return { allowed: true, current: 0, limit: 0 };
    }

    const limits = PLAN_DEFINITIONS[tier];

    // Feature flag check (boolean limits)
    if (mapping.limitField && typeof limits[mapping.limitField] === 'boolean') {
      const allowed = limits[mapping.limitField] as boolean;
      return {
        allowed,
        current: 0,
        limit:   allowed ? 1 : 0,
        reason:  allowed ? undefined : `${action} is not available on the ${tier} plan`,
      };
    }

    // Numeric usage check
    if (mapping.countField && mapping.limitField) {
      const usage = await getCurrentUsage(tenant_id, db);
      const current = usage[mapping.countField] as number;
      const limit   = limits[mapping.limitField] as number;
      const allowed = current < limit;
      return {
        allowed,
        current,
        limit,
        reason: allowed ? undefined : `${action} limit reached: ${current}/${limit} on ${tier} plan`,
      };
    }

    return { allowed: true, current: 0, limit: 0 };
  } catch {
    // Non-fatal — default to allowed on error
    return { allowed: true, current: 0, limit: 0 };
  }
}

// ── getTenantPlan ───────────────────────────────────────────────────────────

export async function getTenantPlan(
  tenant_id: string,
  db:        UsageDb,
): Promise<TenantPlan> {
  try {
    const plan = await db.getTenantPlan(tenant_id);
    if (!plan) {
      return { tier: 'starter', billing_status: 'active' };
    }
    return plan;
  } catch {
    return { tier: 'starter', billing_status: 'active' };
  }
}
