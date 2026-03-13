/**
 * apps/dashboard/app/api/shopify/webhooks/app/uninstalled/route.ts
 *
 * POST /api/shopify/webhooks/app/uninstalled
 * Shopify fires this webhook when a merchant uninstalls the app.
 * Required for App Store approval.
 * Never throws — always returns 200.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateShopifyHMAC,
  extractRawBody,
} from '../../../../../../../../tools/shopify/gdpr/shopify_hmac_validator.js';
import { cancelShopifySubscription } from '../../../../../../../../tools/shopify/billing/shopify_billing.js';

const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET ?? '';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await extractRawBody(req);

    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') ?? '';
    const valid = validateShopifyHMAC(rawBody, hmacHeader, WEBHOOK_SECRET);
    if (!valid) {
      process.stderr.write('[SHOPIFY_UNINSTALL] invalid HMAC\n');
    }

    let body: { id?: number; myshopify_domain?: string } = {};
    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      // continue
    }

    const shop_domain = body.myshopify_domain ?? '';

    process.stderr.write(`[SHOPIFY_UNINSTALL] shop=${shop_domain}\n`);

    // Mark site as uninstalled + preserve data 30 days (GDPR) (non-fatal)
    try {
      const { createServerClient } = await import('@/lib/supabase');
      const db = createServerClient();

      await (db as any)
        .from('sites')
        .update({
          status:         'uninstalled',
          uninstalled_at: new Date().toISOString(),
        })
        .eq('shop_domain', shop_domain);
    } catch {
      // DB write must never block the webhook response
    }

    // Cancel active Shopify subscription (best-effort, non-fatal)
    try {
      const { createServerClient } = await import('@/lib/supabase');
      const db = createServerClient();
      const { data: sub } = await (db as any)
        .from('shopify_subscriptions')
        .select('subscription_id')
        .eq('shop_domain', shop_domain)
        .eq('status', 'active')
        .maybeSingle();

      if (sub?.subscription_id) {
        await cancelShopifySubscription(shop_domain, sub.subscription_id);
        await (db as any)
          .from('shopify_subscriptions')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('subscription_id', sub.subscription_id);
      }
    } catch {
      // Subscription cancellation must never block the webhook response
    }

    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 200 });
  }
}
