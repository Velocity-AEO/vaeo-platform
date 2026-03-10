import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { handleWebhook, type BillingDeps, type WebhookEvent } from '../handler';

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
    createCheckoutSession: async () => {
      throw new Error('createCheckoutSession not used in webhook handler');
    },
  };
}

/**
 * POST /api/billing/webhook
 * Stripe webhook endpoint — verifies signature, routes event to handler.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: WebhookEvent;
  try {
    const stripe = (await import('stripe')).default;
    const client = new stripe(process.env.STRIPE_SECRET_KEY!);
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
    const constructed = client.webhooks.constructEvent(body, sig, webhookSecret);
    event = constructed as unknown as WebhookEvent;
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }

  const result = await handleWebhook(event, buildDeps());

  if (!result.ok) {
    console.error(`[billing/webhook] ${event.type} failed: ${result.error}`);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, action: result.action });
}
