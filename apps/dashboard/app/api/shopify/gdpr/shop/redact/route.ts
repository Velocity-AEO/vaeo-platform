/**
 * apps/dashboard/app/api/shopify/gdpr/shop/redact/route.ts
 *
 * POST /api/shopify/gdpr/shop/redact
 * Shopify mandatory GDPR webhook: full shop data deletion request.
 * Triggered after a merchant uninstalls the app and 48 hours have passed.
 * Queue deletion — never block the webhook response.
 * Never throws — always returns 200.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateShopifyHMAC,
  extractRawBody,
} from '../../../../../../../tools/shopify/gdpr/shopify_hmac_validator.js';

const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET ?? '';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await extractRawBody(req);

    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') ?? '';
    const valid = validateShopifyHMAC(rawBody, hmacHeader, WEBHOOK_SECRET);
    if (!valid) {
      process.stderr.write('[GDPR] shop/redact: invalid HMAC\n');
    }

    let body: { shop_id?: number; shop_domain?: string } = {};
    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      // continue
    }

    const shop_domain = body.shop_domain ?? '';

    // Log to Supabase + queue full shop deletion (non-fatal)
    // Actual deletion runs async — never block this response
    try {
      const { createServerClient } = await import('@/lib/supabase');
      const db = createServerClient();
      await (db as any).from('shopify_gdpr_requests').insert({
        shop_domain,
        customer_id:    null,
        customer_email: null,
        request_type:   'shop_redact',
        status:         'queued',
        notes:          'Full shop data deletion queued: sites, fix_history, rankings, crawl_data.',
      });
    } catch {
      // DB write failure must never break the webhook response
    }

    process.stderr.write(`[GDPR] shop/redact received: shop=${shop_domain}\n`);

    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 200 });
  }
}
