import { NextResponse } from 'next/server';

const IS_MOCK = process.env.APPLY_FIX_MOCK === 'true';

const PROPOSED_TITLE = 'Luxury Foam Pool Floats & Beach Accessories | Cococabana Life';

async function shopifyFetch(path: string, options: RequestInit = {}) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!domain || !token) throw new Error('SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN must be set');
  const url = `https://${domain}/admin/api/2025-01/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Shopify API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function applyTitleFix(): Promise<void> {
  // 1. Find the active (main) theme
  const { themes } = await shopifyFetch('themes.json?role=main');
  if (!themes || themes.length === 0) throw new Error('No main theme found');
  const themeId: number = themes[0].id;

  // 2. Read layout/theme.liquid
  const { asset } = await shopifyFetch(
    `themes/${themeId}/assets.json?asset[key]=layout/theme.liquid`,
  );
  const original: string = asset?.value;
  if (!original) throw new Error('Could not read layout/theme.liquid');

  // 3. Replace <title> tag content for the home page
  // Matches: <title>Anything Here</title> (single-line, case-insensitive)
  const titleRegex = /<title>[^<]*<\/title>/i;
  if (!titleRegex.test(original)) throw new Error('<title> tag not found in layout/theme.liquid');

  const patched = original.replace(titleRegex, `<title>${PROPOSED_TITLE}</title>`);
  if (patched === original) throw new Error('Title tag already matches proposed value — no change needed');

  // 4. Write back
  await shopifyFetch(`themes/${themeId}/assets.json`, {
    method: 'PUT',
    body: JSON.stringify({ asset: { key: 'layout/theme.liquid', value: patched } }),
  });
}

export async function POST(): Promise<NextResponse> {
  if (IS_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return NextResponse.json({ ok: true, mock: true });
  }

  try {
    await applyTitleFix();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
