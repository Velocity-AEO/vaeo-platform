/**
 * tools/billing/plan_definitions.ts
 *
 * Plan tier definitions, feature flags, and usage limits.
 * Pure functions — no I/O, never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type PlanTier = 'starter' | 'pro' | 'agency' | 'enterprise';

export interface PlanLimits {
  sites_allowed:    number;
  crawls_per_month: number;
  fixes_per_month:  number;
  exports_allowed:  boolean;
  aeo_features:     boolean;
  vehicle_schema:   boolean;
  multi_site_jobs:  boolean;
  email_digest:     boolean;
  api_access:       boolean;
  support_level:    'community' | 'email' | 'priority';
}

// ── Plan definitions ─────────────────────────────────────────────────────────

export const PLAN_DEFINITIONS: Record<PlanTier, PlanLimits> = {
  starter: {
    sites_allowed:    1,
    crawls_per_month: 10,
    fixes_per_month:  25,
    exports_allowed:  false,
    aeo_features:     false,
    vehicle_schema:   false,
    multi_site_jobs:  false,
    email_digest:     false,
    api_access:       false,
    support_level:    'community',
  },
  pro: {
    sites_allowed:    5,
    crawls_per_month: 100,
    fixes_per_month:  500,
    exports_allowed:  true,
    aeo_features:     true,
    vehicle_schema:   true,
    multi_site_jobs:  false,
    email_digest:     true,
    api_access:       false,
    support_level:    'email',
  },
  agency: {
    sites_allowed:    25,
    crawls_per_month: 1000,
    fixes_per_month:  5000,
    exports_allowed:  true,
    aeo_features:     true,
    vehicle_schema:   true,
    multi_site_jobs:  true,
    email_digest:     true,
    api_access:       true,
    support_level:    'priority',
  },
  enterprise: {
    sites_allowed:    999,
    crawls_per_month: 999999,
    fixes_per_month:  999999,
    exports_allowed:  true,
    aeo_features:     true,
    vehicle_schema:   true,
    multi_site_jobs:  true,
    email_digest:     true,
    api_access:       true,
    support_level:    'priority',
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getPlanLimits(tier: PlanTier): PlanLimits {
  return PLAN_DEFINITIONS[tier];
}

export function isFeatureAllowed(
  tier:    PlanTier,
  feature: keyof PlanLimits,
): boolean {
  const val = PLAN_DEFINITIONS[tier][feature];
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number')  return val > 0;
  // support_level is always available
  return true;
}

export function isWithinLimit(
  tier:          PlanTier,
  limit:         'sites_allowed' | 'crawls_per_month' | 'fixes_per_month',
  current_usage: number,
): boolean {
  return current_usage < PLAN_DEFINITIONS[tier][limit];
}
