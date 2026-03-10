export async function shopifyFetch(path: string, options: RequestInit = {}) {
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

export async function getMainThemeId(): Promise<number> {
  const { themes } = await shopifyFetch('themes.json?role=main');
  if (!themes || themes.length === 0) throw new Error('No main theme found');
  return themes[0].id as number;
}

export async function readThemeLiquid(themeId: number): Promise<string> {
  const { asset } = await shopifyFetch(
    `themes/${themeId}/assets.json?asset[key]=layout/theme.liquid`,
  );
  if (!asset?.value) throw new Error('Could not read layout/theme.liquid');
  return asset.value as string;
}

export async function writeThemeLiquid(themeId: number, content: string): Promise<void> {
  await shopifyFetch(`themes/${themeId}/assets.json`, {
    method: 'PUT',
    body: JSON.stringify({ asset: { key: 'layout/theme.liquid', value: content } }),
  });
}
