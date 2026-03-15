/**
 * POST /api/sites/[siteId]/run
 *
 * Triggers the schema fix pipeline for a site.
 * Mirrors the logic in scripts/run_schema_fix.ts — same tools, same flow.
 * Never throws — returns { applied, failed, skipped, results }.
 *
 * Approval contract:
 *   This route ONLY processes items already at execution_status='approved'.
 *   It NEVER sets execution_status='approved'. Approval is the exclusive
 *   responsibility of POST /api/sites/[siteId]/fixes with action='approve'.
 *   Successful items → 'deployed'. Failed items → 'failed'.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { writeSchema } from '@tools/schema/schema_writer.js';
import { getLiveThemeId, installSnippet } from '@tools/schema/snippet_installer.js';
import {
  generateProductSchema,
  generateCollectionSchema,
  generatePageSchema,
  type ShopifyProduct,
  type ShopifyCollection,
  type ShopifyPage,
} from '@tools/schema/schema_generator.js';
import { isSystemUrl } from '../../../../../../../packages/core/src/triage/triage_engine.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type ResourceType = 'product' | 'collection' | 'page' | 'article' | 'blog';

interface RunItemResult {
  url:         string;
  success:     boolean;
  schemaType?: string;
  error?:      string;
}

// ── URL helpers (mirrored from scripts/run_schema_fix.ts) ─────────────────────

function routeUrl(url: string): ResourceType {
  if (/\/products\//.test(url))              return 'product';
  if (/\/collections\//.test(url))           return 'collection';
  if (/\/blogs\/[^/]+\/[^/]+/.test(url))     return 'article';
  if (/\/blogs\/[^/]+\/?$/.test(url))        return 'blog';
  return 'page';
}

function extractHandle(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? '';
  } catch {
    return '';
  }
}

// ── Shopify resource fetch (mirrored from scripts/run_schema_fix.ts) ──────────

interface ShopifyResource {
  id: string; title: string; handle: string;
  body_html?: string; images?: Array<{ src: string }>;
  variants?: Array<{ price: string }>; vendor?: string;
}

async function fetchShopifyResource(
  host:        string,
  token:       string,
  type:        ResourceType,
  handle:      string,
): Promise<ShopifyResource | null> {
  const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };
  const pathMap: Record<ResourceType, { path: string; listKey: string }> = {
    product:    { path: `/admin/api/2024-01/products.json?handle=${handle}&fields=id,title,body_html,images,variants,vendor`, listKey: 'products' },
    collection: { path: `/admin/api/2024-01/custom_collections.json?handle=${handle}&fields=id,title,handle`,                listKey: 'custom_collections' },
    article:    { path: `/admin/api/2024-01/articles.json?handle=${handle}&fields=id,title,handle`,                          listKey: 'articles' },
    blog:       { path: `/admin/api/2024-01/blogs.json?handle=${handle}&fields=id,title,handle`,                             listKey: 'blogs' },
    page:       { path: `/admin/api/2024-01/pages.json?handle=${handle}&fields=id,title,handle`,                             listKey: 'pages' },
  };
  const { path, listKey } = pathMap[type];
  const res = await fetch(`https://${host}${path}`, { headers });
  if (!res.ok) return null;
  const body = await res.json() as Record<string, unknown>;
  const list = (body[listKey] as Array<Record<string, unknown>> | undefined) ?? [];
  const item = list[0];
  if (!item?.['id']) return null;
  return {
    id:       String(item['id']),
    title:    String(item['title'] ?? ''),
    handle:   String(item['handle'] ?? handle),
    body_html: item['body_html'] as string | undefined,
    images:   item['images'] as Array<{ src: string }> | undefined,
    variants: item['variants'] as Array<{ price: string }> | undefined,
    vendor:   item['vendor'] as string | undefined,
  };
}

function buildSchema(type: ResourceType, resource: ShopifyResource, shopUrl: string): Record<string, unknown> {
  if (type === 'product')    return generateProductSchema(resource as ShopifyProduct, shopUrl);
  if (type === 'collection') return generateCollectionSchema(resource as ShopifyCollection, shopUrl);
  return generatePageSchema(resource as ShopifyPage, shopUrl);
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(
  _req: Request,
  { params }: { params: { siteId: string } },
) {
  const { siteId } = params;
  const db = createServerClient();

  try {
    // 1. Load credentials
    const [{ data: credRow }, { data: siteRow }] = await Promise.all([
      db.from('site_credentials').select('credential_val')
        .eq('site_id', siteId).eq('credential_key', 'shopify_access_token').maybeSingle(),
      db.from('sites').select('site_url').eq('site_id', siteId).maybeSingle(),
    ]);

    if (!credRow?.credential_val) {
      return NextResponse.json({ error: 'No shopify_access_token found for this site' }, { status: 400 });
    }
    if (!siteRow?.site_url) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const accessToken = credRow.credential_val as string;
    const storeUrl    = siteRow.site_url as string;
    const host        = storeUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    const shopUrl     = `https://${host}`;

    // 2. Load approved SCHEMA_MISSING items (triage_recommendation = 'deploy' or null)
    const { data: items, error: loadErr } = await db
      .from('action_queue')
      .select('id, url, proposed_fix')
      .eq('site_id', siteId)
      .eq('execution_status', 'approved')
      .eq('issue_type', 'SCHEMA_MISSING')
      .or('triage_recommendation.eq.deploy,triage_recommendation.is.null')
      .order('priority', { ascending: true });

    if (loadErr) {
      return NextResponse.json({ error: loadErr.message }, { status: 500 });
    }

    // 3. Best-effort snippet install
    void getLiveThemeId(host, accessToken)
      .then((id) => id ? installSnippet(host, accessToken, id) : null)
      .catch(() => {});

    // 4. Process each item
    const results: RunItemResult[] = [];
    const now = new Date().toISOString();

    for (const item of (items ?? [])) {
      const url      = item.url as string;
      const pageType = routeUrl(url);
      const handle   = extractHandle(url);

      if (isSystemUrl(url) || !handle || handle === 'collections' || handle === 'blogs') {
        results.push({ url, success: false, error: 'System or index URL — not routable' });
        continue;
      }

      try {
        const resource = await fetchShopifyResource(host, accessToken, pageType, handle);
        if (!resource) throw new Error(`No Shopify ${pageType} found for handle: ${handle}`);

        const schemaJson = buildSchema(pageType, resource, shopUrl);
        const writeResult = await writeSchema({
          shopDomain: host, accessToken,
          resourceType: pageType === 'article' || pageType === 'blog' ? pageType : pageType as 'product' | 'collection' | 'page',
          resourceId: resource.id,
          schemaJson,
        });

        if (!writeResult.ok) throw new Error(writeResult.error ?? 'writeSchema failed');

        await db.from('action_queue')
          .update({ execution_status: 'deployed', updated_at: now })
          .eq('id', item.id);

        results.push({ url, success: true, schemaType: String(schemaJson['@type'] ?? '—') });

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        try {
          await db.from('action_queue')
            .update({ execution_status: 'failed', updated_at: now })
            .eq('id', item.id as string);
        } catch { /* non-fatal */ }
        results.push({ url, success: false, error: msg });
      }
    }

    const applied = results.filter((r) => r.success).length;
    const failed  = results.filter((r) => !r.success && !r.error?.includes('not routable')).length;
    const skipped = results.filter((r) => r.error?.includes('not routable')).length;

    return NextResponse.json({ applied, failed, skipped, results });

  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
