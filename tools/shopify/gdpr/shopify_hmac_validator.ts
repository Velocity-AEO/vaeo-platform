/**
 * tools/shopify/gdpr/shopify_hmac_validator.ts
 *
 * Shopify webhook HMAC-SHA256 signature validation.
 * Must be applied before processing any Shopify webhook payload.
 *
 * Never throws.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

// ── validateShopifyHMAC ───────────────────────────────────────────────────────

/**
 * Validates a Shopify webhook HMAC-SHA256 signature.
 *
 * @param rawBody    - The raw (unparsed) request body string
 * @param hmacHeader - The X-Shopify-Hmac-Sha256 header value (base64)
 * @param secret     - The app's webhook secret from Shopify Partner dashboard
 * @returns true if the signature matches, false otherwise
 */
export function validateShopifyHMAC(
  rawBody:    string,
  hmacHeader: string,
  secret:     string,
): boolean {
  try {
    if (!rawBody || !hmacHeader || !secret) return false;

    const computed = createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');

    const a = Buffer.from(computed);
    const b = Buffer.from(hmacHeader);

    // Lengths must match before timingSafeEqual
    if (a.length !== b.length) return false;

    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── extractRawBody ────────────────────────────────────────────────────────────

/**
 * Reads the raw request body as a string.
 * Must be called before any JSON parsing — parsed JSON changes the byte
 * sequence and breaks the HMAC signature check.
 */
export async function extractRawBody(request: Request): Promise<string> {
  try {
    return await request.text();
  } catch {
    return '';
  }
}
