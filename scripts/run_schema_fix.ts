/**
 * scripts/run_schema_fix.ts
 *
 * Applies schema fixes for approved SCHEMA_MISSING items for a given site.
 *
 * For each item:
 *   1. Route URL → resource type (product / collection / page / article / blog)
 *   2. Fetch numeric Shopify resource ID from Admin API using the URL handle
 *   3. Generate JSON-LD via schema_generator
 *   4. Validate via schema_validator
 *   5. Write to velocity_seo/schema_json metafield via schema_writer
 *   6. Best-effort: install velocity-schema.liquid snippet into live theme
 *   7. Mark item deployed (or failed) in action_queue
 *
 * Prints a result table: URL, page type, schema type written, pass/fail, error.
 *
 * Usage:
 *   doppler run -- npx tsx scripts/run_schema_fix.ts --site-id=31cfee0c-fbe4-4128-adbc-3a1c740b6960
 */

import { writeSchema }                       from '../tools/schema/schema_writer.js';
import { validateSchema }                    from '../tools/schema/schema_validator.js';
import { getLiveThemeId, installSnippet }    from '../tools/schema/snippet_installer.js';
import {
  generateProductSchema,
  generateCollectionSchema,
  generatePageSchema,
  type ShopifyProduct,
  type ShopifyCollection,
  type ShopifyPage,
} from '../tools/schema/schema_generator.js';
import { isSystemUrl }                       from '../packages/core/src/triage/triage_engine.js';

// ── Parse args ───────────────────────────────────────────────────────────────

function parseSiteId(): string {
  const arg = process.argv.find((a) => a.startsWith('--site-id='));
  if (!arg) {
    console.error('Usage: doppler run -- npx tsx scripts/run_schema_fix.ts --site-id=<uuid>');
    process.exit(1);
  }
  return arg.split('=')[1]!;
}

// ── DB setup ─────────────────────────────────────────────────────────────────

async function createDb() {
  const { getConfig } = await import('../packages/core/config.js');
  const mod = await import('../packages/commands/node_modules/@supabase/supabase-js/dist/index.mjs');
  const cfg = getConfig();
  return mod.createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

// ── URL routing ───────────────────────────────────────────────────────────────

type ResourceType = 'product' | 'collection' | 'page' | 'article' | 'blog';

function routeUrl(url: string): ResourceType {
  if (/\/products\//.test(url))                  return 'product';
  if (/\/collections\//.test(url))               return 'collection';
  if (/\/blogs\/[^/]+\/[^/]+/.test(url))         return 'article';
  if (/\/blogs\/[^/]+\/?$/.test(url))            return 'blog';
  return 'page';
}

/** Extract the last meaningful path segment as the Shopify handle. */
function extractHandle(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? '';
  } catch {
    return '';
  }
}

// ── Shopify resource lookup ───────────────────────────────────────────────────

interface ResourceLookupResult {
  id:        string;
  title:     string;
  handle:    string;
  body_html?: string;
  images?:   Array<{ src: string }>;
  variants?: Array<{ price: string }>;
  vendor?:   string;
}

async function fetchShopifyResource(
  host:         string,
  accessToken:  string,
  resourceType: ResourceType,
  handle:       string,
): Promise<ResourceLookupResult | null> {
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type':           'application/json',
  };

  let path: string;
  let listKey: string;

  switch (resourceType) {
    case 'product':
      path    = `/admin/api/2024-01/products.json?handle=${handle}&fields=id,title,body_html,images,variants,vendor`;
      listKey = 'products';
      break;
    case 'collection':
      path    = `/admin/api/2024-01/custom_collections.json?handle=${handle}&fields=id,title,handle`;
      listKey = 'custom_collections';
      break;
    case 'article':
      path    = `/admin/api/2024-01/articles.json?handle=${handle}&fields=id,title,handle`;
      listKey = 'articles';
      break;
    case 'blog':
      path    = `/admin/api/2024-01/blogs.json?handle=${handle}&fields=id,title,handle`;
      listKey = 'blogs';
      break;
    default: // 'page'
      path    = `/admin/api/2024-01/pages.json?handle=${handle}&fields=id,title,handle`;
      listKey = 'pages';
  }

  const res = await fetch(`https://${host}${path}`, { method: 'GET', headers });
  if (!res.ok) throw new Error(`Shopify ${resourceType} lookup failed (${res.status}): ${handle}`);

  const body = await res.json() as Record<string, unknown>;
  const list = (body[listKey] as Array<Record<string, unknown>> | undefined) ?? [];
  const item = list[0];
  if (!item || !item['id']) return null;

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

// ── Schema generation ─────────────────────────────────────────────────────────

function buildSchema(
  resourceType: ResourceType,
  resource:     ResourceLookupResult,
  shopUrl:      string,
): Record<string, unknown> {
  switch (resourceType) {
    case 'product':
      return generateProductSchema(resource as ShopifyProduct, shopUrl);
    case 'collection':
      return generateCollectionSchema(resource as ShopifyCollection, shopUrl);
    default:
      // page / article / blog → WebPage schema
      return generatePageSchema(resource as ShopifyPage, shopUrl);
  }
}

// ── Result row ────────────────────────────────────────────────────────────────

interface ResultRow {
  url:         string;
  pageType:    ResourceType;
  schemaType:  string;
  success:     boolean;
  error?:      string;
  metafieldId?: string;
}

// ── Snippet install — once per run ────────────────────────────────────────────

async function tryInstallSnippet(host: string, accessToken: string): Promise<void> {
  try {
    const themeId = await getLiveThemeId(host, accessToken);
    if (!themeId) return;
    const result = await installSnippet(host, accessToken, themeId);
    if (result.ok && !result.alreadyInstalled) {
      console.log('  [snippet] velocity-schema.liquid installed into live theme');
    } else if (result.alreadyInstalled) {
      console.log('  [snippet] velocity-schema.liquid already installed');
    } else {
      console.log(`  [snippet] install failed (non-fatal): ${result.error}`);
    }
  } catch (err) {
    console.log(`  [snippet] install error (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const siteId = parseSiteId();
  const db     = await createDb();

  console.log(`\nSchema Fix Runner`);
  console.log(`Site ID: ${siteId}\n`);

  // 1. Load credentials
  const { data: cred } = await db
    .from('site_credentials')
    .select('credential_val')
    .eq('site_id', siteId)
    .eq('credential_key', 'shopify_access_token')
    .maybeSingle();

  if (!cred?.credential_val) {
    console.error('No shopify_access_token found in site_credentials for this site.');
    process.exit(1);
  }

  const { data: site } = await db
    .from('sites')
    .select('site_url')
    .eq('site_id', siteId)
    .maybeSingle();

  if (!site?.site_url) {
    console.error('No site_url found in sites table for this site.');
    process.exit(1);
  }

  const accessToken = cred.credential_val as string;
  const storeUrl    = site.site_url as string;
  const host        = storeUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const shopUrl     = `https://${host}`;

  console.log(`Store:   ${storeUrl}`);
  console.log(`Token:   shpat_...${accessToken.slice(-6)}\n`);

  // 2. Load approved SCHEMA_MISSING items with triage_recommendation = 'deploy' (or no triage)
  const { data: items, error: loadErr } = await db
    .from('action_queue')
    .select('id, run_id, tenant_id, site_id, issue_type, url, risk_score, priority, proposed_fix, execution_status, triage_recommendation')
    .eq('site_id', siteId)
    .eq('execution_status', 'approved')
    .eq('issue_type', 'SCHEMA_MISSING')
    .or('triage_recommendation.eq.deploy,triage_recommendation.is.null')
    .order('priority', { ascending: true });

  if (loadErr) {
    console.error('Failed to load items:', loadErr.message);
    process.exit(1);
  }

  if (!items || items.length === 0) {
    console.log('No eligible SCHEMA_MISSING items found (approved + deploy/untriaged).\n');

    // Show status distribution for context
    const { data: allItems } = await db
      .from('action_queue')
      .select('execution_status, issue_type')
      .eq('site_id', siteId)
      .ilike('issue_type', '%schema%');

    if (allItems && allItems.length > 0) {
      const counts: Record<string, number> = {};
      for (const r of allItems) {
        const key = `${r.issue_type}/${r.execution_status}`;
        counts[key] = (counts[key] || 0) + 1;
      }
      console.log('Schema items in queue by type/status:');
      for (const [k, v] of Object.entries(counts)) {
        console.log(`  ${k}: ${v}`);
      }
    } else {
      console.log('No schema items found in action_queue for this site.');
    }
    process.exit(0);
  }

  console.log(`Found ${items.length} item(s) to process.\n`);

  // 3. Best-effort snippet install (once per run)
  await tryInstallSnippet(host, accessToken);
  console.log('');

  // 4. Process each item
  const results: ResultRow[] = [];
  const now = new Date().toISOString();

  for (const item of items) {
    const url        = item.url as string;
    const pageType   = routeUrl(url);
    const handle     = extractHandle(url);
    let schemaType   = '—';
    let success      = false;
    let errorMsg: string | undefined;
    let metafieldId: string | undefined;

    process.stdout.write(`  Processing: ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 50)} ... `);

    // Skip system URLs and non-routable pages (no Shopify resource to attach metafield to)
    if (isSystemUrl(url)) {
      process.stdout.write('SKIP (system URL)\n');
      results.push({ url, pageType, schemaType: '—', success: false, error: 'System URL — not routable' });
      continue;
    }

    // Skip bare collection/blog index pages (no handle to look up)
    if (!handle || handle === 'collections' || handle === 'blogs') {
      process.stdout.write('SKIP (index page — no handle)\n');
      results.push({ url, pageType, schemaType: '—', success: false, error: 'Index page — no specific resource' });
      continue;
    }

    try {
      // 4a. Fetch resource
      const resource = await fetchShopifyResource(host, accessToken, pageType, handle);
      if (!resource) {
        throw new Error(`No Shopify ${pageType} found for handle: ${handle}`);
      }

      // 4b. Generate schema
      const schemaJson = buildSchema(pageType, resource, shopUrl);
      schemaType = String(schemaJson['@type'] ?? '—');

      // 4c. Validate
      const validation = validateSchema(schemaJson);
      if (!validation.valid) {
        throw new Error(`Schema validation failed: ${validation.errors.join('; ')}`);
      }

      // 4d. Write metafield
      const writeResult = await writeSchema({
        shopDomain:   host,
        accessToken,
        resourceType: pageType === 'article' ? 'article' : pageType === 'blog' ? 'blog' : pageType as 'product' | 'collection' | 'page',
        resourceId:   resource.id,
        schemaJson,
      });

      if (!writeResult.ok) {
        throw new Error(writeResult.error ?? 'writeSchema failed');
      }

      metafieldId = writeResult.metafieldId;
      success     = true;

      // 4e. Mark deployed
      await db
        .from('action_queue')
        .update({ execution_status: 'deployed', updated_at: now })
        .eq('id', item.id);

      process.stdout.write(`PASS (metafield ${metafieldId})\n`);

    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      success  = false;

      // Mark failed
      await db
        .from('action_queue')
        .update({ execution_status: 'failed', updated_at: now })
        .eq('id', item.id);

      process.stdout.write(`FAIL\n`);
    }

    results.push({ url, pageType, schemaType, success, error: errorMsg, metafieldId });
  }

  // 5. Result table
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log('  SCHEMA FIX RESULTS');
  console.log('────────────────────────────────────────────────────────────────────────');
  console.log(`  ${'STATUS'.padEnd(6)}  ${'PAGE TYPE'.padEnd(12)}  ${'SCHEMA TYPE'.padEnd(16)}  URL`);
  console.log(`  ${'──────'.padEnd(6)}  ${'────────────'.padEnd(12)}  ${'────────────────'.padEnd(16)}  ───────────────────────────────`);

  for (const r of results) {
    const status     = r.success ? 'PASS' : 'FAIL';
    const pageType   = r.pageType.padEnd(12);
    const schemaType = r.schemaType.padEnd(16);
    const shortUrl   = r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 35);
    console.log(`  ${status.padEnd(6)}  ${pageType}  ${schemaType}  ${shortUrl}`);
    if (r.error) {
      console.log(`         → Error: ${r.error}`);
    }
  }

  console.log('────────────────────────────────────────────────────────────────────────');
  console.log(`  Passed: ${passed}   Failed: ${failed}   Total: ${results.length}`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
