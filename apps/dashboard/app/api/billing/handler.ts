/**
 * apps/dashboard/app/api/billing/handler.ts
 *
 * Business logic for Stripe billing integration.
 * Pure functions with injectable deps — route files are thin wrappers.
 * Never throws — returns result objects with error fields on failure.
 */

import { PLANS, type PlanId, type Tenant } from '../../../lib/types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateCheckoutRequest {
  tenant_id:   string;
  plan:        string;
  success_url: string;
  cancel_url:  string;
}

export interface CreateCheckoutResult {
  ok:      boolean;
  url?:    string;
  error?:  string;
}

export interface WebhookEvent {
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export interface WebhookResult {
  ok:      boolean;
  action?: string;
  error?:  string;
}

export interface SiteGateResult {
  allowed:        boolean;
  reason?:        string;
  current_count?: number;
  site_limit?:    number;
}

// ── Injectable deps ──────────────────────────────────────────────────────────

export interface BillingDeps {
  loadTenant:                 (tenantId: string) => Promise<Tenant | null>;
  loadTenantByStripeCustomer: (customerId: string) => Promise<Tenant | null>;
  updateTenant:               (tenantId: string, fields: Partial<Tenant>) => Promise<void>;
  countSites:                 (tenantId: string) => Promise<number>;
  createCheckoutSession:      (params: {
    customer_id?: string;
    price_id:     string;
    success_url:  string;
    cancel_url:   string;
    metadata:     Record<string, string>;
  }) => Promise<string>;
}

// ── Plan → Stripe Price mapping ──────────────────────────────────────────────

export function getPriceId(plan: PlanId): string {
  const map: Record<PlanId, string> = {
    starter:    process.env.STRIPE_PRICE_STARTER    ?? 'price_starter',
    pro:        process.env.STRIPE_PRICE_PRO        ?? 'price_pro',
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? 'price_enterprise',
  };
  return map[plan];
}

// ── Create Checkout Session ──────────────────────────────────────────────────

export async function createCheckout(
  req:  CreateCheckoutRequest,
  deps: BillingDeps,
): Promise<CreateCheckoutResult> {
  if (!req.plan || !(req.plan in PLANS)) {
    return { ok: false, error: `Invalid plan: ${req.plan}. Must be starter, pro, or enterprise.` };
  }
  if (!req.tenant_id) {
    return { ok: false, error: 'tenant_id is required' };
  }

  const plan = req.plan as PlanId;

  let tenant: Tenant | null;
  try {
    tenant = await deps.loadTenant(req.tenant_id);
  } catch (err) {
    return { ok: false, error: `Failed to load tenant: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!tenant) {
    return { ok: false, error: 'Tenant not found' };
  }

  try {
    const url = await deps.createCheckoutSession({
      customer_id: tenant.stripe_customer_id ?? undefined,
      price_id:    getPriceId(plan),
      success_url: req.success_url,
      cancel_url:  req.cancel_url,
      metadata:    { tenant_id: req.tenant_id, plan },
    });
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: `Stripe error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Webhook handler ──────────────────────────────────────────────────────────

export async function handleWebhook(
  event: WebhookEvent,
  deps:  BillingDeps,
): Promise<WebhookResult> {
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        return await handleCheckoutCompleted(event.data.object, deps);
      case 'customer.subscription.deleted':
        return await handleSubscriptionDeleted(event.data.object, deps);
      case 'customer.subscription.updated':
        return await handleSubscriptionUpdated(event.data.object, deps);
      case 'invoice.payment_failed':
        return await handlePaymentFailed(event.data.object, deps);
      default:
        return { ok: true, action: 'ignored' };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleCheckoutCompleted(
  obj:  Record<string, unknown>,
  deps: BillingDeps,
): Promise<WebhookResult> {
  const metadata = obj['metadata'] as Record<string, string> | undefined;
  const tenantId = metadata?.['tenant_id'];
  const plan     = metadata?.['plan'] as PlanId | undefined;

  if (!tenantId || !plan) {
    return { ok: false, error: 'Missing tenant_id or plan in session metadata' };
  }
  if (!(plan in PLANS)) {
    return { ok: false, error: `Unknown plan in metadata: ${plan}` };
  }

  const customerId     = obj['customer'] as string | undefined;
  const subscriptionId = obj['subscription'] as string | undefined;

  await deps.updateTenant(tenantId, {
    plan,
    billing_status:          'active',
    stripe_customer_id:      customerId ?? null,
    stripe_subscription_id:  subscriptionId ?? null,
    site_limit:              PLANS[plan].site_limit,
  });

  return { ok: true, action: `activated_${plan}` };
}

async function handleSubscriptionDeleted(
  obj:  Record<string, unknown>,
  deps: BillingDeps,
): Promise<WebhookResult> {
  const tenantId = await resolveTenantId(obj, deps);
  if (!tenantId) {
    return { ok: false, error: 'No tenant found for deleted subscription' };
  }

  await deps.updateTenant(tenantId, {
    billing_status:         'inactive',
    stripe_subscription_id: null,
  });

  return { ok: true, action: 'deactivated' };
}

async function handleSubscriptionUpdated(
  obj:  Record<string, unknown>,
  deps: BillingDeps,
): Promise<WebhookResult> {
  const status = obj['status'] as string | undefined;
  if (status === 'past_due') {
    const tenantId = await resolveTenantId(obj, deps);
    if (!tenantId) return { ok: false, error: 'No tenant found for past_due subscription' };
    await deps.updateTenant(tenantId, { billing_status: 'past_due' });
    return { ok: true, action: 'marked_past_due' };
  }
  return { ok: true, action: 'ignored' };
}

async function handlePaymentFailed(
  obj:  Record<string, unknown>,
  deps: BillingDeps,
): Promise<WebhookResult> {
  const subscriptionId = obj['subscription'] as string | undefined;
  if (!subscriptionId) return { ok: true, action: 'ignored' };

  const customerId = obj['customer'] as string | undefined;
  if (!customerId) return { ok: false, error: 'No customer on failed invoice' };

  const tenant = await deps.loadTenantByStripeCustomer(customerId);
  if (!tenant) return { ok: false, error: 'No tenant found for failed payment' };

  await deps.updateTenant(tenant.id, { billing_status: 'past_due' });
  return { ok: true, action: 'marked_past_due' };
}

// ── Site creation gate ───────────────────────────────────────────────────────

export async function checkSiteGate(
  tenantId: string,
  deps:     BillingDeps,
): Promise<SiteGateResult> {
  let tenant: Tenant | null;
  try {
    tenant = await deps.loadTenant(tenantId);
  } catch (err) {
    return { allowed: false, reason: `Failed to load tenant: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (!tenant) {
    return { allowed: false, reason: 'Tenant not found' };
  }

  if (tenant.billing_status === 'inactive' || tenant.billing_status === 'canceled') {
    return { allowed: false, reason: `Billing is ${tenant.billing_status}. Please subscribe to a plan.` };
  }

  let siteCount: number;
  try {
    siteCount = await deps.countSites(tenantId);
  } catch (err) {
    return { allowed: false, reason: `Failed to count sites: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (siteCount >= tenant.site_limit) {
    return {
      allowed:       false,
      reason:        `Site limit reached (${siteCount}/${tenant.site_limit}). Upgrade your plan to add more sites.`,
      current_count: siteCount,
      site_limit:    tenant.site_limit,
    };
  }

  return { allowed: true, current_count: siteCount, site_limit: tenant.site_limit };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveTenantId(
  obj:  Record<string, unknown>,
  deps: BillingDeps,
): Promise<string | null> {
  const metadata = obj['metadata'] as Record<string, string> | undefined;
  if (metadata?.['tenant_id']) return metadata['tenant_id'];

  const customerId = obj['customer'] as string | undefined;
  if (!customerId) return null;

  const tenant = await deps.loadTenantByStripeCustomer(customerId);
  return tenant?.id ?? null;
}
