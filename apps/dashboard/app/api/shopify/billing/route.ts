/**
 * apps/dashboard/app/api/shopify/billing/route.ts
 *
 * GET /api/shopify/billing?shop={domain}&plan={plan_name}
 * Creates a Shopify subscription and returns the confirmation URL.
 * Merchant is redirected to Shopify to approve the charge.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  SHOPIFY_PLANS,
  createShopifySubscription,
} from '@tools/shopify/billing/shopify_billing.js';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://app.velocityaeo.com';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const url       = new URL(req.url);
    const shop      = url.searchParams.get('shop') ?? '';
    const plan_name = url.searchParams.get('plan') ?? '';

    if (!shop || !plan_name) {
      return NextResponse.json({ error: 'shop and plan are required' }, { status: 400 });
    }

    const plan = SHOPIFY_PLANS.find(p => p.name === plan_name);
    if (!plan) {
      return NextResponse.json({ error: `Unknown plan: ${plan_name}` }, { status: 400 });
    }

    const return_url = `${BASE_URL}/api/shopify/billing/callback?shop=${encodeURIComponent(shop)}`;
    const result     = await createShopifySubscription(shop, plan, return_url);

    if (!result) {
      return NextResponse.json({ error: 'Failed to create subscription' }, { status: 502 });
    }

    return NextResponse.json({ confirmation_url: result.confirmation_url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
