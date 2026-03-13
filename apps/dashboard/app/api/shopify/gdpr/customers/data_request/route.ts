/**
 * apps/dashboard/app/api/shopify/gdpr/customers/data_request/route.ts
 *
 * POST /api/shopify/gdpr/customers/data_request
 * Shopify mandatory GDPR webhook: customer data request.
 * Shopify requires a 200 response; actual fulfilment must happen within 30 days.
 * Never throws — always returns 200.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateShopifyHMAC,
  extractRawBody,
} from '../../../../../../../../tools/shopify/gdpr/shopify_hmac_validator.js';

const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET ?? '';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await extractRawBody(req);

    // HMAC validation — log but always return 200 (Shopify requirement)
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') ?? '';
    const valid = validateShopifyHMAC(rawBody, hmacHeader, WEBHOOK_SECRET);
    if (!valid) {
      // Log invalid but still 200 to avoid Shopify retries leaking details
      process.stderr.write('[GDPR] customers/data_request: invalid HMAC\n');
    }

    let body: {
      shop_id?:           number;
      shop_domain?:       string;
      customer?:          { id?: number; email?: string; phone?: string };
      orders_requested?:  number[];
    } = {};

    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      // malformed body — log and return 200
    }

    const shop_domain    = body.shop_domain ?? '';
    const customer_id    = String(body.customer?.id ?? '');
    const customer_email = body.customer?.email ?? null;

    // Log to Supabase (non-fatal)
    try {
      const { createServerClient } = await import('@/lib/supabase');
      const db = createServerClient();
      await (db as any).from('shopify_gdpr_requests').insert({
        shop_domain,
        customer_id:    customer_id || null,
        customer_email,
        request_type:   'data_request',
        status:         'received',
      });
    } catch {
      // DB write failure must never break the webhook response
    }

    process.stderr.write(`[GDPR] customers/data_request received: shop=${shop_domain}\n`);

    return new NextResponse(null, { status: 200 });
  } catch {
    // Always 200
    return new NextResponse(null, { status: 200 });
  }
}
