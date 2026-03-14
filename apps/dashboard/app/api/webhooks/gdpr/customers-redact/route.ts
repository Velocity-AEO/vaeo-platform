import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  handleCustomersRedact,
  verifyShopifyWebhookHmac,
  type GdprWebhookPayload,
  type GdprDeps,
} from '@tools/shopify/gdpr_webhooks.js';

function buildDeps(): GdprDeps {
  const db = createServerClient();
  return {
    writeAuditLog: async (entry) => {
      await db.from('audit_log').insert({
        tenant_id:     'system',
        actor_type:    'system',
        action:        entry.action,
        resource_type: entry.resource_type,
        resource_id:   entry.resource_id,
        outcome:       'success',
        metadata:      entry.metadata,
      });
    },
    deleteSiteByDomain: async () => 0,
  };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmac = req.headers.get('x-shopify-hmac-sha256') ?? '';
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET ?? '';

  if (!verifyShopifyWebhookHmac(rawBody, hmac, secret)) {
    return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 });
  }

  let payload: GdprWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as GdprWebhookPayload;
  } catch {
    return NextResponse.json({ ok: true });
  }

  await handleCustomersRedact(payload, buildDeps());
  return NextResponse.json({ ok: true });
}
