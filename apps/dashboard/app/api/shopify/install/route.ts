import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;

const SCOPES = [
  'read_themes',
  'write_themes',
  'read_content',
  'write_content',
  'read_products',
  'read_analytics',
].join(',');

/**
 * GET /api/shopify/install?shop=mystore.myshopify.com
 *
 * Initiates Shopify OAuth by redirecting the merchant to
 * the Shopify consent screen.
 */
export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop')?.trim().toLowerCase();

  if (!shop) {
    return NextResponse.json({ ok: false, error: 'Missing ?shop= parameter' }, { status: 400 });
  }

  // Normalise: accept "mystore" or "mystore.myshopify.com"
  const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;

  // Basic validation — must look like a valid myshopify domain
  if (!/^[a-z0-9][a-z0-9\-]*\.myshopify\.com$/.test(shopDomain)) {
    return NextResponse.json({ ok: false, error: 'Invalid shop domain' }, { status: 400 });
  }

  if (!SHOPIFY_API_KEY) {
    return NextResponse.json({ ok: false, error: 'SHOPIFY_API_KEY not configured' }, { status: 500 });
  }

  // Generate a cryptographic nonce for CSRF protection
  const nonce = crypto.randomBytes(16).toString('hex');

  // Determine redirect URI based on the current request's origin
  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/shopify/callback`;

  const authUrl =
    `https://${shopDomain}/admin/oauth/authorize` +
    `?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${SCOPES}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${nonce}`;

  // Store the nonce in a short-lived cookie so we can verify it on callback
  const response = NextResponse.redirect(authUrl);
  response.cookies.set('shopify_oauth_state', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });
  // Also store the shop domain for callback verification
  response.cookies.set('shopify_oauth_shop', shopDomain, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  return response;
}
