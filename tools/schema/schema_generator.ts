/**
 * tools/schema/schema_generator.ts
 *
 * Generates correct JSON-LD for each Shopify page type.
 * All outputs are designed to pass validateSchema checks.
 *
 * Functions:
 *   generateProductSchema      → Product + Offer
 *   generateCollectionSchema   → BreadcrumbList
 *   generatePageSchema         → WebPage
 *   generateArticleSchema      → Article
 *   generateOrganizationSchema → Organization
 *
 * Pure — no I/O, no side effects. Never throws.
 */

import { stripNulls } from '../../packages/schema-engine/src/index.js';

// ── Shopify resource types ────────────────────────────────────────────────────

export interface ShopifyProduct {
  id:        string;
  title:     string;
  body_html?: string;
  image?:    { src: string };
  variants?: Array<{ price: string; compare_at_price?: string }>;
  vendor?:   string;
}

export interface ShopifyCollection {
  id:     string;
  title:  string;
  handle: string;
}

export interface ShopifyPage {
  id:     string;
  title:  string;
  handle: string;
}

export interface ShopifyArticle {
  id:            string;
  title:         string;
  handle:        string;
  /** Pre-computed canonical URL (preferred). Used directly if provided. */
  url?:          string;
  /** ISO datetime string from Shopify. Falls back to today if absent. */
  published_at?: string;
  /** Blog handle — used to construct URL when `url` is not provided. */
  blog_handle?:  string;
  /** Blog title — used as author/publisher name fallback. */
  blog_title?:   string;
}

export interface ShopifyShop {
  name:   string;
  domain: string;
  email?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip HTML tags from Shopify body_html for use as plain-text description. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

// ── Generators ────────────────────────────────────────────────────────────────

/**
 * Generate Product JSON-LD.
 * Uses first variant price and priceCurrency='USD' as defaults.
 */
export function generateProductSchema(
  product: ShopifyProduct,
  shopUrl?: string,
): Record<string, unknown> {
  const price         = product.variants?.[0]?.price ?? '0';
  const description   = product.body_html ? stripHtml(product.body_html) : null;
  const availability  = 'https://schema.org/InStock';

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type':    'Product',
    name:        product.title,
    description,
    image:       product.image?.src ?? null,
    brand:       product.vendor ? { '@type': 'Brand', name: product.vendor } : null,
    offers:      {
      '@type':        'Offer',
      price,
      priceCurrency:  'USD',
      availability,
      url:            shopUrl ? `${shopUrl}/products/${product.id}` : null,
    },
  };

  return stripNulls(schema) as Record<string, unknown>;
}

/**
 * Generate BreadcrumbList JSON-LD for a collection page.
 */
export function generateCollectionSchema(
  collection: ShopifyCollection,
  shopUrl?: string,
): Record<string, unknown> {
  const collectionUrl = shopUrl
    ? `${shopUrl}/collections/${collection.handle}`
    : null;

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type':    'BreadcrumbList',
    itemListElement: [
      {
        '@type':  'ListItem',
        position: 1,
        name:     collection.title,
        item:     collectionUrl,
      },
    ],
  };

  return stripNulls(schema) as Record<string, unknown>;
}

/**
 * Generate WebPage JSON-LD for a Shopify page.
 */
export function generatePageSchema(
  page:    ShopifyPage,
  shopUrl: string,
): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type':    'WebPage',
    name:        page.title,
    url:         `${shopUrl}/pages/${page.handle}`,
  };

  return stripNulls(schema) as Record<string, unknown>;
}

/**
 * Generate Article JSON-LD for a Shopify blog article.
 *
 * @param article  Shopify article data
 * @param shopUrl  Store base URL (e.g. "https://example.myshopify.com")
 * @param shopName Optional store/brand name for author + publisher fields
 */
export function generateArticleSchema(
  article:   ShopifyArticle,
  shopUrl:   string,
  shopName?: string,
): Record<string, unknown> {
  const orgName = shopName ?? article.blog_title ?? 'Organization';

  // Prefer pre-computed URL; fall back to constructing from blog_handle + handle
  const articleUrl = article.url
    ?? (article.blog_handle
      ? `${shopUrl}/blogs/${article.blog_handle}/${article.handle}`
      : shopUrl);

  const datePublished = article.published_at
    ? article.published_at.split('T')[0]!
    : new Date().toISOString().split('T')[0]!;

  const schema: Record<string, unknown> = {
    '@context':    'https://schema.org',
    '@type':       'Article',
    headline:       article.title,
    url:            articleUrl,
    datePublished,
    author: {
      '@type': 'Organization',
      name:    orgName,
    },
    publisher: {
      '@type': 'Organization',
      name:    orgName,
    },
  };

  return stripNulls(schema) as Record<string, unknown>;
}

/**
 * Generate Organization JSON-LD for the store.
 */
export function generateOrganizationSchema(shop: ShopifyShop): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context':    'https://schema.org',
    '@type':       'Organization',
    name:           shop.name,
    url:            `https://${shop.domain}`,
    contactPoint:  shop.email
      ? { '@type': 'ContactPoint', email: shop.email }
      : null,
  };

  return stripNulls(schema) as Record<string, unknown>;
}
