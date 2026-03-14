import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServerClient } from '../../../../lib/supabase';

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!;
const HARDCODED_TENANT = '00000000-0000-0000-0000-000000000001';

/**
 * GET /api/shopify/callback?code=...&hmac=...&shop=...&state=...
 *
 * Handles the OAuth callback from Shopify:
 *  1. Validates HMAC signature
 *  2. Validates state nonce (CSRF)
 *  3. Exchanges authorisation code for a permanent access token
 *  4. Verifies the token against Shopify Admin API
 *  5. Upserts the site + credential into Supabase
 *  6. Redirects to /sites with a success indicator
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const shop = searchParams.get('shop');
  const state = searchParams.get('state');
  const hmac = searchParams.get('hmac');

  // --- Basic parameter validation ---
  if (!code || !shop || !state || !hmac) {
    return NextResponse.json({ ok: false, error: 'Missing required OAuth parameters' }, { status: 400 });
  }

  if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
    return NextResponse.json({ ok: false, error: 'Shopify OAuth credentials not configured' }, { status: 500 });
  }

  // --- Verify HMAC ---
  const params = new URLSearchParams();
  searchParams.forEach((value, key) => {
    if (key !== 'hmac') params.set(key, value);
  });
  // Shopify requires params sorted lexicographically
  const entries: [string, string][] = [];
  params.forEach((value, key) => entries.push([key, value]));
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const sortedParams = new URLSearchParams(entries);
  const digest = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(sortedParams.toString())
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(hmac, 'hex'))) {
    return NextResponse.json({ ok: false, error: 'Invalid HMAC signature' }, { status: 403 });
  }

  // --- Verify state nonce ---
  const savedState = req.cookies.get('shopify_oauth_state')?.value;
  if (!savedState || savedState !== state) {
    return NextResponse.json({ ok: false, error: 'State mismatch — possible CSRF' }, { status: 403 });
  }

  // --- Exchange code for permanent access token ---
  let accessToken: string;
  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Token exchange failed (${tokenRes.status}): ${text}`);
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };
    accessToken = tokenData.access_token;
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }

  // --- Verify token & fetch shop info ---
  let shopName: string;
  try {
    const verifyRes = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query: `{ shop { id name } }`,
      }),
    });

    if (!verifyRes.ok) throw new Error(`Shopify API ${verifyRes.status}`);
    const json = (await verifyRes.json()) as {
      data?: { shop?: { id: string; name: string } };
    };
    if (!json.data?.shop) throw new Error('No shop data returned');
    shopName = json.data.shop.name;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Token verification failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  // --- Upsert site + credential in Supabase ---
  let existing: { site_id: string } | null = null;
  let siteId = '';
  try {
    const db = createServerClient();
    const storeUrl = `https://${shop}`;

    // Check if site already exists
    const { data: existingData } = await db
      .from('sites')
      .select('site_id')
      .eq('tenant_id', HARDCODED_TENANT)
      .eq('site_url', storeUrl)
      .maybeSingle();
    existing = existingData;

    if (existing) {
      siteId = existing.site_id;
    } else {
      const { data: inserted, error: insertErr } = await db
        .from('sites')
        .insert({ tenant_id: HARDCODED_TENANT, cms_type: 'shopify', site_url: storeUrl })
        .select('site_id')
        .single();
      if (insertErr) throw new Error(insertErr.message);
      siteId = inserted.site_id;
    }

    // Store the access token
    const { error: credErr } = await db.from('site_credentials').upsert(
      {
        site_id: siteId,
        tenant_id: HARDCODED_TENANT,
        credential_key: 'shopify_access_token',
        credential_val: accessToken,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'site_id,credential_key' },
    );
    if (credErr) throw new Error(credErr.message);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Database error: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  // --- Redirect: new onboarding → wizard, existing → sites page ---
  const origin = req.nextUrl.origin;
  let redirectUrl: URL;

  if (!existing) {
    // Newly registered site → continue onboarding wizard
    redirectUrl = new URL('/onboarding', origin);
    redirectUrl.searchParams.set('site_id', siteId);
    redirectUrl.searchParams.set('step', 'connect_gsc');
  } else {
    // Existing site → sites page
    redirectUrl = new URL('/sites', origin);
    redirectUrl.searchParams.set('connected', shopName);
  }

  const response = NextResponse.redirect(redirectUrl);
  // Clean up OAuth cookies
  response.cookies.delete('shopify_oauth_state');
  response.cookies.delete('shopify_oauth_shop');
  return response;
}
