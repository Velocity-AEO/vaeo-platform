/**
 * tools/billing/billing_gate.ts
 *
 * Central billing gate — checks billing status, feature flags,
 * and usage limits before allowing protected actions.
 * Injectable DB deps. Never throws.
 */

import { type PlanTier, PLAN_DEFINITIONS } from './plan_definitions.js';
import {
  checkUsageLimit,
  getTenantPlan,
  type UsageDb,
} from './usage_tracker.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BillingGateResult {
  allowed:           boolean;
  reason?:           string;
  upgrade_required?: PlanTier;
  current_tier?:     PlanTier;
}

export type GatedAction =
  | 'add_site' | 'start_crawl' | 'apply_fix'
  | 'export' | 'aeo' | 'vehicle_schema'
  | 'multi_site_jobs' | 'api_access';

// ── Feature flag mapping for non-countable actions ──────────────────────────

const FEATURE_FLAG_MAP: Partial<Record<GatedAction, keyof typeof PLAN_DEFINITIONS.starter>> = {
  export:          'exports_allowed',
  aeo:             'aeo_features',
  vehicle_schema:  'vehicle_schema',
  multi_site_jobs: 'multi_site_jobs',
  api_access:      'api_access',
};

// ── Tier ordering ───────────────────────────────────────────────────────────

const TIER_ORDER: PlanTier[] = ['starter', 'pro', 'agency', 'enterprise'];

// ── getUpgradeTier ──────────────────────────────────────────────────────────

export function getUpgradeTier(
  current: PlanTier,
  action:  GatedAction,
): PlanTier | undefined {
  const currentIdx = TIER_ORDER.indexOf(current);

  // For feature-flag actions, find the first tier that allows it
  const featureKey = FEATURE_FLAG_MAP[action];
  if (featureKey) {
    for (let i = currentIdx + 1; i < TIER_ORDER.length; i++) {
      const tier = TIER_ORDER[i]!;
      const val = PLAN_DEFINITIONS[tier][featureKey];
      if (val === true) return tier;
    }
    return undefined;
  }

  // For countable actions, next tier always has higher limits
  if (currentIdx < TIER_ORDER.length - 1) {
    return TIER_ORDER[currentIdx + 1];
  }
  return undefined;
}

// ── Past-due actions that are still allowed ─────────────────────────────────

const PAST_DUE_ALLOWED: Set<GatedAction> = new Set([
  'apply_fix',  // let existing fixes complete
]);

// ── checkBillingGate ────────────────────────────────────────────────────────

export async function checkBillingGate(
  tenant_id: string,
  action:    GatedAction,
  db:        UsageDb,
): Promise<BillingGateResult> {
  try {
    // 1. Get tenant plan
    const plan = await getTenantPlan(tenant_id, db);
    const tier = plan.tier;

    // 2. Check billing status
    if (plan.billing_status === 'canceled') {
      return {
        allowed:       false,
        reason:        'Subscription canceled',
        current_tier:  tier,
      };
    }

    if (plan.billing_status === 'past_due' && !PAST_DUE_ALLOWED.has(action)) {
      return {
        allowed:       false,
        reason:        'Subscription past due — please update payment method',
        current_tier:  tier,
      };
    }

    // 3. Check feature flags for non-countable actions
    const featureKey = FEATURE_FLAG_MAP[action];
    if (featureKey) {
      const allowed = PLAN_DEFINITIONS[tier][featureKey] === true;
      if (!allowed) {
        return {
          allowed:          false,
          reason:           `${action} is not available on the ${tier} plan`,
          upgrade_required: getUpgradeTier(tier, action),
          current_tier:     tier,
        };
      }
      return { allowed: true, current_tier: tier };
    }

    // 4. Check usage limits for countable actions
    const usageAction = action as 'add_site' | 'start_crawl' | 'apply_fix';
    const limitResult = await checkUsageLimit(tenant_id, tier, usageAction, db);
    if (!limitResult.allowed) {
      return {
        allowed:          false,
        reason:           limitResult.reason,
        upgrade_required: getUpgradeTier(tier, action),
        current_tier:     tier,
      };
    }

    return { allowed: true, current_tier: tier };
  } catch {
    // Non-fatal — default to allowed on unexpected error
    return { allowed: true };
  }
}
