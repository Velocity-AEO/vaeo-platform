/**
 * tools/billing/stripe_client.ts
 *
 * Stripe API client wrapper for checkout sessions and subscription status.
 * Uses raw fetch — no Stripe SDK needed.
 * Never throws.
 */

import type { PlanTier } from './plan_definitions.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StripeCheckoutParams {
  tenant_id:    string;
  tenant_email: string;
  plan_tier:    'pro' | 'agency' | 'enterprise';
  success_url:  string;
  cancel_url:   string;
}

export interface StripeSubscriptionStatus {
  subscription_id:      string;
  customer_id:          string;
  status:               'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
  plan_tier:            string;
  current_period_end:   string;
  cancel_at_period_end: boolean;
}

export interface StripeDeps {
  fetch: typeof globalThis.fetch;
  priceMap: Record<string, string>;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

function defaultPriceMap(): Record<string, string> {
  return {
    pro:        process.env.STRIPE_PRICE_PRO        ?? '',
    agency:     process.env.STRIPE_PRICE_AGENCY     ?? '',
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? '',
  };
}

function defaultDeps(): StripeDeps {
  return { fetch: globalThis.fetch, priceMap: defaultPriceMap() };
}

// ── Checkout session ─────────────────────────────────────────────────────────

export async function createCheckoutSession(
  params:          StripeCheckoutParams,
  stripeSecretKey: string,
  deps:            StripeDeps = defaultDeps(),
): Promise<{ url: string; session_id: string } | null> {
  try {
    const priceId = deps.priceMap[params.plan_tier];
    if (!priceId) return null;

    const body = new URLSearchParams({
      'mode':                                  'subscription',
      'customer_email':                        params.tenant_email,
      'success_url':                           params.success_url,
      'cancel_url':                            params.cancel_url,
      'line_items[0][price]':                  priceId,
      'line_items[0][quantity]':               '1',
      'metadata[tenant_id]':                   params.tenant_id,
      'subscription_data[metadata][tenant_id]': params.tenant_id,
    });

    const res = await deps.fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${stripeSecretKey}`,
        'Content-Type':   'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!res.ok) return null;

    const data = await res.json() as Record<string, unknown>;
    const url       = data.url as string | undefined;
    const sessionId = data.id  as string | undefined;

    if (!url || !sessionId) return null;
    return { url, session_id: sessionId };
  } catch {
    return null;
  }
}

// ── Subscription status ──────────────────────────────────────────────────────

const VALID_STATUSES = new Set(['active', 'past_due', 'canceled', 'trialing', 'incomplete']);

export async function getSubscriptionStatus(
  subscriptionId:  string,
  stripeSecretKey: string,
  deps:            StripeDeps = defaultDeps(),
): Promise<StripeSubscriptionStatus | null> {
  try {
    const res = await deps.fetch(
      `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${stripeSecretKey}` },
      },
    );

    if (!res.ok) return null;

    const data = await res.json() as Record<string, unknown>;
    const status = data.status as string;
    if (!VALID_STATUSES.has(status)) return null;

    const items = data.items as Record<string, unknown> | undefined;
    const itemsData = (items?.data ?? []) as Record<string, unknown>[];
    const priceId = itemsData.length > 0
      ? (((itemsData[0] as Record<string, unknown>).price as Record<string, unknown>)?.id as string) ?? ''
      : '';

    const planTier = mapStripePlanTier(priceId, deps.priceMap);

    return {
      subscription_id:      data.id as string,
      customer_id:          data.customer as string,
      status:               status as StripeSubscriptionStatus['status'],
      plan_tier:            planTier,
      current_period_end:   new Date(((data.current_period_end as number) ?? 0) * 1000).toISOString(),
      cancel_at_period_end: (data.cancel_at_period_end as boolean) ?? false,
    };
  } catch {
    return null;
  }
}

// ── Plan tier mapper ─────────────────────────────────────────────────────────

export function mapStripePlanTier(
  priceId:  string,
  priceMap: Record<string, string>,
): PlanTier {
  for (const [tier, id] of Object.entries(priceMap)) {
    if (id && id === priceId) return tier as PlanTier;
  }
  return 'starter';
}
