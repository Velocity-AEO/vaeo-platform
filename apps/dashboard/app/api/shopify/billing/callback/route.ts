/**
 * apps/dashboard/app/api/shopify/billing/callback/route.ts
 *
 * GET /api/shopify/billing/callback?charge_id={id}&shop={domain}
 * Shopify redirects merchants here after approving (or declining) a subscription.
 * Verifies charge status and activates the subscription in VAEO.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getShopifySubscription } from '../../../../../../../tools/shopify/billing/shopify_billing.js';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://app.velocityaeo.com';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const url       = new URL(req.url);
    const charge_id = url.searchParams.get('charge_id') ?? '';
    const shop      = url.searchParams.get('shop') ?? '';

    if (!charge_id || !shop) {
      return NextResponse.redirect(new URL(`${BASE_URL}/billing?error=missing_params`));
    }

    const subscription = await getShopifySubscription(shop, charge_id);

    if (!subscription || subscription.status !== 'ACTIVE') {
      return NextResponse.redirect(new URL(`${BASE_URL}/billing?error=subscription_not_active`));
    }

    // Activate in VAEO (non-fatal DB write)
    try {
      const { createServerClient } = await import('@/lib/supabase');
      const db = createServerClient();
      await (db as any).from('shopify_subscriptions').upsert({
        shop_domain:     shop,
        subscription_id: charge_id,
        plan_name:       subscription.plan_name,
        status:          'active',
        activated_at:    subscription.activated_on ?? new Date().toISOString(),
      }, { onConflict: 'shop_domain' });
    } catch {
      // DB failure — still redirect to dashboard (subscription is active on Shopify's side)
    }

    return NextResponse.redirect(new URL(`${BASE_URL}/dashboard?shop=${encodeURIComponent(shop)}&billing=activated`));
  } catch (err) {
    return NextResponse.redirect(new URL(`${BASE_URL}/billing?error=internal`));
  }
}
