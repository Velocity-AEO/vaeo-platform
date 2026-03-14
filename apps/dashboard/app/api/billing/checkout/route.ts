import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createCheckoutSession } from '@tools/billing/stripe_client.js';

const HARDCODED_TENANT = '00000000-0000-0000-0000-000000000001';

const PRICE_ENV_MAP: Record<string, Record<string, string>> = {
  pro: {
    monthly: 'STRIPE_PRICE_PRO',
    annual:  'STRIPE_PRICE_PRO_ANNUAL',
  },
  agency: {
    monthly: 'STRIPE_PRICE_AGENCY',
    annual:  'STRIPE_PRICE_AGENCY_ANNUAL',
  },
  enterprise: {
    monthly: 'STRIPE_PRICE_ENTERPRISE',
    annual:  'STRIPE_PRICE_ENTERPRISE_ANNUAL',
  },
};

/**
 * POST /api/billing/checkout
 * Body: { tenant_id?: string, plan: string, billing_period: 'monthly' | 'annual' }
 * Returns { checkout_url: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const plan = body.plan as string;
    const billingPeriod = (body.billing_period as string) ?? 'monthly';
    const tenantId = (body.tenant_id as string) ?? HARDCODED_TENANT;

    if (plan === 'starter') {
      return NextResponse.json(
        { error: 'Starter is the default free plan — no checkout needed' },
        { status: 400 },
      );
    }

    if (plan === 'enterprise') {
      return NextResponse.json(
        { error: 'Enterprise plans require contacting sales' },
        { status: 400 },
      );
    }

    const envMap = PRICE_ENV_MAP[plan];
    if (!envMap) {
      return NextResponse.json(
        { error: `Invalid plan: ${plan}` },
        { status: 400 },
      );
    }

    const envKey = envMap[billingPeriod];
    if (!envKey) {
      return NextResponse.json(
        { error: `Invalid billing_period: ${billingPeriod}` },
        { status: 400 },
      );
    }

    const priceId = process.env[envKey];
    if (!priceId) {
      return NextResponse.json(
        { error: `Price not configured: ${envKey}` },
        { status: 400 },
      );
    }

    // Load tenant email
    const db = createServerClient();
    const { data: tenant } = await db
      .from('tenants')
      .select('email')
      .eq('id', tenantId)
      .maybeSingle();

    const email = (tenant as Record<string, unknown> | null)?.email as string ?? '';

    const origin = req.nextUrl.origin;
    const result = await createCheckoutSession(
      {
        tenant_id: tenantId,
        tenant_email: email,
        plan_tier: plan as 'pro' | 'agency',
        success_url: `${origin}/billing?success=true`,
        cancel_url: `${origin}/billing?canceled=true`,
      },
      process.env.STRIPE_SECRET_KEY ?? '',
      {
        fetch: globalThis.fetch,
        priceMap: { [plan]: priceId },
      },
    );

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 },
      );
    }

    return NextResponse.json({ checkout_url: result.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
