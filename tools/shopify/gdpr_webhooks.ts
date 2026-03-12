/**
 * tools/shopify/gdpr_webhooks.ts
 *
 * Shopify mandatory GDPR webhook handlers.
 * Handles customers/redact, shop/redact, and customers/data_request.
 * Pure functions with injectable deps. Never throws.
 */

import { createHmac } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export type GdprWebhookType =
  | 'customers/redact'
  | 'shop/redact'
  | 'customers/data_request';

export interface GdprWebhookPayload {
  shop_id:           number;
  shop_domain:       string;
  customer?:         { id: number; email: string; phone?: string };
  orders_requested?: number[];
  data_request?:     { id: number };
}

export interface GdprHandleResult {
  handled:      boolean;
  webhook_type: GdprWebhookType;
  shop_domain:  string;
  action_taken: string;
  error?:       string;
}

export interface GdprDeps {
  writeAuditLog: (entry: {
    action:        string;
    resource_type: string;
    resource_id:   string;
    metadata:      Record<string, unknown>;
  }) => Promise<void>;
  deleteSiteByDomain: (shopDomain: string) => Promise<number>;
}

// ── Customers/redact ─────────────────────────────────────────────────────────

/**
 * Handle customers/redact webhook.
 * VAEO does not store customer PII — logs receipt and returns handled=true.
 */
export async function handleCustomersRedact(
  payload: GdprWebhookPayload,
  deps:    GdprDeps,
): Promise<GdprHandleResult> {
  try {
    await deps.writeAuditLog({
      action:        'gdpr_customers_redact',
      resource_type: 'shopify_shop',
      resource_id:   payload.shop_domain,
      metadata: {
        shop_id:     payload.shop_id,
        customer_id: payload.customer?.id,
        note:        'VAEO does not store customer PII. No data to redact.',
      },
    });

    return {
      handled:      true,
      webhook_type: 'customers/redact',
      shop_domain:  payload.shop_domain,
      action_taken: 'logged_receipt_no_pii_stored',
    };
  } catch (err) {
    return {
      handled:      false,
      webhook_type: 'customers/redact',
      shop_domain:  payload.shop_domain,
      action_taken: 'error',
      error:        err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Shop/redact ──────────────────────────────────────────────────────────────

/**
 * Handle shop/redact webhook.
 * Removes all site data for the shop domain.
 */
export async function handleShopRedact(
  payload: GdprWebhookPayload,
  deps:    GdprDeps,
): Promise<GdprHandleResult> {
  try {
    const deletedCount = await deps.deleteSiteByDomain(payload.shop_domain);

    await deps.writeAuditLog({
      action:        'gdpr_shop_redact',
      resource_type: 'shopify_shop',
      resource_id:   payload.shop_domain,
      metadata: {
        shop_id:       payload.shop_id,
        sites_deleted: deletedCount,
      },
    });

    return {
      handled:      true,
      webhook_type: 'shop/redact',
      shop_domain:  payload.shop_domain,
      action_taken: `deleted_${deletedCount}_sites`,
    };
  } catch (err) {
    return {
      handled:      false,
      webhook_type: 'shop/redact',
      shop_domain:  payload.shop_domain,
      action_taken: 'error',
      error:        err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Customers/data_request ───────────────────────────────────────────────────

/**
 * Handle customers/data_request webhook.
 * VAEO does not store customer PII — logs receipt and explains.
 */
export async function handleCustomersDataRequest(
  payload: GdprWebhookPayload,
  deps:    GdprDeps,
): Promise<GdprHandleResult> {
  try {
    await deps.writeAuditLog({
      action:        'gdpr_customers_data_request',
      resource_type: 'shopify_shop',
      resource_id:   payload.shop_domain,
      metadata: {
        shop_id:         payload.shop_id,
        customer_id:     payload.customer?.id,
        data_request_id: payload.data_request?.id,
        note:            'VAEO does not store customer PII. No data to return.',
      },
    });

    return {
      handled:      true,
      webhook_type: 'customers/data_request',
      shop_domain:  payload.shop_domain,
      action_taken: 'logged_receipt_no_pii_stored',
    };
  } catch (err) {
    return {
      handled:      false,
      webhook_type: 'customers/data_request',
      shop_domain:  payload.shop_domain,
      action_taken: 'error',
      error:        err instanceof Error ? err.message : String(err),
    };
  }
}

// ── HMAC verification ────────────────────────────────────────────────────────

/**
 * Verify Shopify webhook HMAC-SHA256 signature.
 * Computes HMAC of rawBody using webhookSecret,
 * encodes as base64, compares to hmacHeader.
 */
export function verifyShopifyWebhookHmac(
  rawBody:       string,
  hmacHeader:    string,
  webhookSecret: string,
): boolean {
  try {
    if (!rawBody || !hmacHeader || !webhookSecret) return false;

    const computed = createHmac('sha256', webhookSecret)
      .update(rawBody, 'utf8')
      .digest('base64');

    // Timing-safe comparison via Buffer
    const a = Buffer.from(computed);
    const b = Buffer.from(hmacHeader);
    if (a.length !== b.length) return false;

    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a[i]! ^ b[i]!;
    }
    return diff === 0;
  } catch {
    return false;
  }
}
