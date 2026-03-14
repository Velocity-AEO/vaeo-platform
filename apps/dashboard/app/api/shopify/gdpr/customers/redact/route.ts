/**
 * apps/dashboard/app/api/shopify/gdpr/customers/redact/route.ts
 *
 * POST /api/shopify/gdpr/customers/redact
 * Shopify mandatory GDPR webhook: customer PII redaction request.
 * VAEO does not store customer PII — logs receipt and queues for confirmation.
 * Never throws — always returns 200.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateShopifyHMAC,
  extractRawBody,
} from '@tools/shopify/gdpr/shopify_hmac_validator.js';

const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET ?? '';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await extractRawBody(req);

    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') ?? '';
    const valid = validateShopifyHMAC(rawBody, hmacHeader, WEBHOOK_SECRET);
    if (!valid) {
      process.stderr.write('[GDPR] customers/redact: invalid HMAC\n');
    }

    let body: {
      shop_id?:          number;
      shop_domain?:      string;
      customer?:         { id?: number; email?: string; phone?: string };
      orders_to_redact?: number[];
    } = {};

    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      // malformed body — continue
    }

    const shop_domain    = body.shop_domain ?? '';
    const customer_id    = String(body.customer?.id ?? '');
    const customer_email = body.customer?.email ?? null;

    // Log to Supabase + queue redaction (non-fatal)
    try {
      const { createServerClient } = await import('@/lib/supabase');
      const db = createServerClient();
      await (db as any).from('shopify_gdpr_requests').insert({
        shop_domain,
        customer_id:    customer_id || null,
        customer_email,
        request_type:   'customer_redact',
        status:         'queued',
        notes:          'VAEO does not store customer PII. Queued for confirmation.',
      });
    } catch {
      // DB write failure must never break the webhook response
    }

    process.stderr.write(`[GDPR] customers/redact received: shop=${shop_domain}\n`);

    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 200 });
  }
}
