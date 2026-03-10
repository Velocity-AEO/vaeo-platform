import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '../../../../lib/supabase';
import { handleShopifyOnboarding, OnboardingDeps } from './handler';

/** Real Shopify Admin API verifier */
async function realVerifyShopify(storeUrl: string, accessToken: string) {
  const apiUrl = `${storeUrl}/admin/api/2025-01/graphql.json`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({
      query: `{ shop { id name } themes(first:1, role: MAIN) { edges { node { id } } } }`,
    }),
  });

  if (!res.ok) throw new Error(`Shopify API returned ${res.status}`);

  const json = (await res.json()) as {
    data?: {
      shop?: { id: string; name: string };
      themes?: { edges: Array<{ node: { id: string } }> };
    };
    errors?: unknown[];
  };

  if (json.errors?.length) throw new Error('Shopify GraphQL errors: ' + JSON.stringify(json.errors));
  if (!json.data?.shop) throw new Error('Shopify returned no shop data');

  const themeEdge = json.data.themes?.edges?.[0];
  return {
    shop_id: json.data.shop.id,
    name: json.data.shop.name,
    theme_id: themeEdge?.node.id ?? null,
  };
}

function buildRealDeps(): OnboardingDeps {
  const db = createServerClient();
  return {
    verifyShopify: realVerifyShopify,

    async findSite(tenantId, siteUrl) {
      const { data } = await db
        .from('sites')
        .select('site_id')
        .eq('tenant_id', tenantId)
        .eq('site_url', siteUrl)
        .maybeSingle();
      return data ?? null;
    },

    async insertSite(tenantId, siteUrl) {
      const { data, error } = await db
        .from('sites')
        .insert({ tenant_id: tenantId, cms_type: 'shopify', site_url: siteUrl })
        .select('site_id')
        .single();
      if (error) throw new Error(error.message);
      return data.site_id as string;
    },

    async storeCredential(siteId, tenantId, key, val) {
      const { error } = await db.from('site_credentials').upsert(
        { site_id: siteId, tenant_id: tenantId, credential_key: key, credential_val: val, updated_at: new Date().toISOString() },
        { onConflict: 'site_id,credential_key' },
      );
      if (error) throw new Error(error.message);
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await handleShopifyOnboarding(body, buildRealDeps());
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
