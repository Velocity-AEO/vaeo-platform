import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const HARDCODED_TENANT = '00000000-0000-0000-0000-000000000001';

/**
 * POST /api/billing/portal
 * Body: { tenant_id?: string }
 * Returns { portal_url: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const tenantId = (body.tenant_id as string) ?? HARDCODED_TENANT;

    const db = createServerClient();
    const { data: tenant } = await db
      .from('tenants')
      .select('stripe_customer_id')
      .eq('id', tenantId)
      .maybeSingle();

    const customerId = (tenant as Record<string, unknown> | null)?.stripe_customer_id as string | undefined;
    if (!customerId) {
      return NextResponse.json(
        { error: 'No Stripe customer ID found for this tenant' },
        { status: 400 },
      );
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY ?? '';
    const origin = req.nextUrl.origin;

    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: customerId,
        return_url: `${origin}/billing`,
      }).toString(),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to create portal session' },
        { status: 500 },
      );
    }

    const data = await res.json() as Record<string, unknown>;
    const portalUrl = data.url as string;

    if (!portalUrl) {
      return NextResponse.json(
        { error: 'Stripe did not return a portal URL' },
        { status: 500 },
      );
    }

    return NextResponse.json({ portal_url: portalUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
