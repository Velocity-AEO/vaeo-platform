/**
 * tools/billing/stripe_webhook.ts
 *
 * Stripe webhook processor — verifies signatures, parses events,
 * updates tenant billing state in database.
 * Never throws.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { mapStripePlanTier } from './stripe_client.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StripeWebhookEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

export interface WebhookProcessResult {
  processed:    boolean;
  event_type:   string;
  tenant_id?:   string;
  action_taken?: string;
  error?:       string;
}

export interface WebhookDeps {
  updateTenant: (tenantId: string, fields: Record<string, unknown>) => Promise<void>;
  priceMap:     Record<string, string>;
}

// ── Signature verification ───────────────────────────────────────────────────

/**
 * Verify Stripe webhook signature.
 *
 * Parses timestamp and v1 signatures from the Stripe-Signature header,
 * computes HMAC-SHA256 of `{timestamp}.{rawBody}`, compares against
 * v1 signatures, and rejects if timestamp is > 300 seconds old.
 */
export function verifyWebhookSignature(
  rawBody:   string,
  signature: string,
  secret:    string,
): boolean {
  try {
    if (!rawBody || !signature || !secret) return false;

    // Parse header: t=timestamp,v1=sig1,v1=sig2,...
    const parts = signature.split(',');
    let timestamp = '';
    const signatures: string[] = [];

    for (const part of parts) {
      const [key, val] = part.split('=', 2);
      if (!key || !val) continue;
      if (key.trim() === 't')  timestamp = val.trim();
      if (key.trim() === 'v1') signatures.push(val.trim());
    }

    if (!timestamp || signatures.length === 0) return false;

    // Reject if timestamp is > 300 seconds old
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) return false;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > 300) return false;

    // Compute expected signature
    const payload  = `${timestamp}.${rawBody}`;
    const expected = createHmac('sha256', secret).update(payload).digest('hex');

    // Compare against all v1 signatures (timing-safe)
    const expectedBuf = Buffer.from(expected, 'hex');
    for (const sig of signatures) {
      try {
        const sigBuf = Buffer.from(sig, 'hex');
        if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  } catch {
    return false;
  }
}

// ── Event processor ──────────────────────────────────────────────────────────

const HANDLED_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.payment_succeeded',
  'checkout.session.completed',
]);

/**
 * Process a Stripe webhook event.
 *
 * Verifies signature, parses event, dispatches to appropriate handler,
 * and updates tenant billing state in the database.
 */
export async function processStripeWebhook(
  rawBody:       string,
  signature:     string,
  webhookSecret: string,
  deps:          WebhookDeps,
): Promise<WebhookProcessResult> {
  try {
    // Verify signature
    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      return { processed: false, event_type: 'unknown', error: 'Invalid signature' };
    }

    // Parse event
    let event: StripeWebhookEvent;
    try {
      event = JSON.parse(rawBody) as StripeWebhookEvent;
    } catch {
      return { processed: false, event_type: 'unknown', error: 'Invalid JSON' };
    }

    if (!event.type || !event.data?.object) {
      return { processed: false, event_type: event.type ?? 'unknown', error: 'Malformed event' };
    }

    // Skip unknown events
    if (!HANDLED_EVENTS.has(event.type)) {
      return { processed: false, event_type: event.type };
    }

    const obj = event.data.object;

    switch (event.type) {
      case 'customer.subscription.created': {
        const tenantId = extractTenantId(obj);
        if (!tenantId) return { processed: false, event_type: event.type, error: 'No tenant_id in metadata' };
        const priceId = extractPriceId(obj);
        const planTier = mapStripePlanTier(priceId, deps.priceMap);
        await deps.updateTenant(tenantId, {
          billing_status:          'active',
          plan_tier:               planTier,
          stripe_customer_id:      obj.customer as string,
          stripe_subscription_id:  obj.id as string,
        });
        return { processed: true, event_type: event.type, tenant_id: tenantId, action_taken: `activated:${planTier}` };
      }

      case 'customer.subscription.updated': {
        const tenantId = extractTenantId(obj);
        if (!tenantId) return { processed: false, event_type: event.type, error: 'No tenant_id in metadata' };
        const priceId = extractPriceId(obj);
        const planTier = mapStripePlanTier(priceId, deps.priceMap);
        const status = obj.status === 'active' ? 'active'
                     : obj.status === 'past_due' ? 'past_due'
                     : obj.status === 'canceled' ? 'canceled'
                     : obj.status === 'trialing' ? 'trialing'
                     : 'active';
        await deps.updateTenant(tenantId, { billing_status: status, plan_tier: planTier });
        return { processed: true, event_type: event.type, tenant_id: tenantId, action_taken: `updated:${status}:${planTier}` };
      }

      case 'customer.subscription.deleted': {
        const tenantId = extractTenantId(obj);
        if (!tenantId) return { processed: false, event_type: event.type, error: 'No tenant_id in metadata' };
        await deps.updateTenant(tenantId, { billing_status: 'canceled' });
        return { processed: true, event_type: event.type, tenant_id: tenantId, action_taken: 'canceled' };
      }

      case 'invoice.payment_failed': {
        const tenantId = extractTenantIdFromInvoice(obj);
        if (!tenantId) return { processed: false, event_type: event.type, error: 'No tenant_id in metadata' };
        await deps.updateTenant(tenantId, { billing_status: 'past_due' });
        return { processed: true, event_type: event.type, tenant_id: tenantId, action_taken: 'past_due' };
      }

      case 'invoice.payment_succeeded': {
        const tenantId = extractTenantIdFromInvoice(obj);
        if (!tenantId) return { processed: false, event_type: event.type, error: 'No tenant_id in metadata' };
        await deps.updateTenant(tenantId, { billing_status: 'active' });
        return { processed: true, event_type: event.type, tenant_id: tenantId, action_taken: 'payment_cleared' };
      }

      case 'checkout.session.completed': {
        const metadata = (obj.metadata ?? {}) as Record<string, string>;
        const tenantId = metadata.tenant_id;
        if (!tenantId) return { processed: false, event_type: event.type, error: 'No tenant_id in metadata' };
        await deps.updateTenant(tenantId, {
          stripe_customer_id: obj.customer as string,
        });
        return { processed: true, event_type: event.type, tenant_id: tenantId, action_taken: 'customer_linked' };
      }

      default:
        return { processed: false, event_type: event.type };
    }
  } catch (err) {
    return {
      processed:  false,
      event_type: 'unknown',
      error:      err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractTenantId(obj: Record<string, unknown>): string | undefined {
  const metadata = (obj.metadata ?? {}) as Record<string, string>;
  return metadata.tenant_id || undefined;
}

function extractPriceId(obj: Record<string, unknown>): string {
  const items = obj.items as Record<string, unknown> | undefined;
  const data  = (items?.data ?? []) as Record<string, unknown>[];
  if (data.length === 0) return '';
  const price = (data[0] as Record<string, unknown>).price as Record<string, unknown> | undefined;
  return (price?.id as string) ?? '';
}

function extractTenantIdFromInvoice(obj: Record<string, unknown>): string | undefined {
  // Try subscription_details.metadata first, then lines.data[0].metadata
  const subDetails = obj.subscription_details as Record<string, unknown> | undefined;
  const subMeta = (subDetails?.metadata ?? {}) as Record<string, string>;
  if (subMeta.tenant_id) return subMeta.tenant_id;

  const lines = obj.lines as Record<string, unknown> | undefined;
  const linesData = (lines?.data ?? []) as Record<string, unknown>[];
  if (linesData.length > 0) {
    const lineMeta = ((linesData[0] as Record<string, unknown>).metadata ?? {}) as Record<string, string>;
    if (lineMeta.tenant_id) return lineMeta.tenant_id;
  }

  return undefined;
}
