// tools/billing/billing_state.ts — Billing state computation + plan pricing

export interface BillingState {
  tenant_id: string;
  plan: 'starter' | 'pro' | 'agency' | 'enterprise';
  billing_status: 'active' | 'past_due' | 'canceled' | 'trialing';
  current_period_end?: string;
  sites_used: number;
  sites_limit: number;
  crawls_used: number;
  crawls_limit: number;
  fixes_used: number;
  fixes_limit: number;
  sites_pct: number;
  crawls_pct: number;
  fixes_pct: number;
  is_over_limit: boolean;
  days_until_renewal?: number;
}

export interface PlanPrice {
  monthly_usd: number;
  annual_usd: number;
  label: string;
  features: string[];
}

export const PLAN_PRICES: Record<string, PlanPrice> = {
  starter: {
    monthly_usd: 49,
    annual_usd: 39,
    label: 'Starter',
    features: [
      '1 site',
      '10 crawls/month',
      '25 fixes/month',
      'Weekly digest',
      'Email support',
    ],
  },
  pro: {
    monthly_usd: 99,
    annual_usd: 79,
    label: 'Pro',
    features: [
      '5 sites',
      '100 crawls/month',
      '500 fixes/month',
      'Priority support',
      'GSC integration',
    ],
  },
  agency: {
    monthly_usd: 249,
    annual_usd: 199,
    label: 'Agency',
    features: [
      '25 sites',
      '1000 crawls/month',
      '5000 fixes/month',
      'Multi-site jobs',
      'White-label reports',
      'Slack support',
    ],
  },
  enterprise: {
    monthly_usd: 0,
    annual_usd: 0,
    label: 'Enterprise',
    features: [
      'Unlimited sites',
      'Unlimited crawls',
      'Unlimited fixes',
      'Dedicated support',
      'Custom SLA',
      'SSO',
    ],
  },
};

function computePct(used: number, limit: number): number {
  if (limit >= 9999) return 0;
  if (limit <= 0) return 100;
  const pct = (used / limit) * 100;
  return pct > 100 ? 100 : Math.round(pct * 100) / 100;
}

export function computeBillingState(
  tenant_id: string,
  plan: string,
  billing_status: string,
  usage: { sites: number; crawls: number; fixes: number },
  limits: { sites: number; crawls: number; fixes: number },
  current_period_end?: string,
): BillingState {
  const validPlans = ['starter', 'pro', 'agency', 'enterprise'] as const;
  const validStatuses = ['active', 'past_due', 'canceled', 'trialing'] as const;

  const normalizedPlan = validPlans.includes(plan as any)
    ? (plan as BillingState['plan'])
    : 'starter';
  const normalizedStatus = validStatuses.includes(billing_status as any)
    ? (billing_status as BillingState['billing_status'])
    : 'active';

  const sites_pct = computePct(usage.sites, limits.sites);
  const crawls_pct = computePct(usage.crawls, limits.crawls);
  const fixes_pct = computePct(usage.fixes, limits.fixes);

  const is_over_limit =
    sites_pct >= 100 ||
    crawls_pct >= 100 ||
    fixes_pct >= 100 ||
    normalizedStatus === 'canceled';

  let days_until_renewal: number | undefined;
  if (current_period_end) {
    const end = new Date(current_period_end);
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    days_until_renewal = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  return {
    tenant_id,
    plan: normalizedPlan,
    billing_status: normalizedStatus,
    current_period_end,
    sites_used: usage.sites,
    sites_limit: limits.sites,
    crawls_used: usage.crawls,
    crawls_limit: limits.crawls,
    fixes_used: usage.fixes,
    fixes_limit: limits.fixes,
    sites_pct,
    crawls_pct,
    fixes_pct,
    is_over_limit,
    days_until_renewal,
  };
}
