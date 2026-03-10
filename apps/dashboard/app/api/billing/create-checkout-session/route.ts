import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createCheckout, type BillingDeps } from '../handler';

const HARDCODED_TENANT = '00000000-0000-0000-0000-000000000001';

function buildDeps(): BillingDeps {
  const db = createServerClient();
  return {
    loadTenant: async (tenantId) => {
      const { data, error } = await db.from('tenants').select('*').eq('id', tenantId).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    loadTenantByStripeCustomer: async (customerId) => {
      const { data, error } = await db.from('tenants').select('*').eq('stripe_customer_id', customerId).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    updateTenant: async (tenantId, fields) => {
      const { error } = await db.from('tenants').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', tenantId);
      if (error) throw new Error(error.message);
    },
    countSites: async (tenantId) => {
      const { count, error } = await db.from('sites').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    createCheckoutSession: async (params) => {
      const stripe = (await import('stripe')).default;
      const client = new stripe(process.env.STRIPE_SECRET_KEY!);
      const session = await client.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: params.price_id, quantity: 1 }],
        success_url: params.success_url,
        cancel_url:  params.cancel_url,
        metadata:    params.metadata,
        ...(params.customer_id ? { customer: params.customer_id } : {}),
      });
      if (!session.url) throw new Error('Stripe did not return a checkout URL');
      return session.url;
    },
  };
}

/**
 * POST /api/billing/create-checkout-session
 * Body: { plan: 'starter'|'pro'|'enterprise' }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { plan: string };
    const origin = req.nextUrl.origin;

    const result = await createCheckout({
      tenant_id:   HARDCODED_TENANT,
      plan:        body.plan,
      success_url: `${origin}/billing?success=true`,
      cancel_url:  `${origin}/billing?canceled=true`,
    }, buildDeps());

    if (!result.ok) {
      const status = result.error?.includes('Invalid plan') || result.error?.includes('required') ? 400 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ ok: true, url: result.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
