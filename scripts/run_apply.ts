/**
 * scripts/run_apply.ts
 *
 * Runner: loads approved items for cococabanalife.com from action_queue,
 * applies them via the Apply engine with real Shopify credentials.
 *
 * IMPORTANT — approval contract:
 *   This script ONLY consumes items that are already execution_status='approved'.
 *   It NEVER sets execution_status='approved'. Only the dashboard UI approval
 *   action (POST /api/sites/[siteId]/fixes with action='approve') may do that.
 *   Items must arrive here as 'approved' via explicit user action in the UI.
 *   Successful items → 'deployed'. Failed items → 'failed'.
 *
 * Usage: doppler run -- npx tsx scripts/run_apply.ts
 */

import { applyBatch, type ApprovedItem, type ApplyDeps } from '../tools/apply/apply_engine.js';
import type { ShopifyFixRequest } from '../packages/adapters/shopify/src/index.js';

const SITE_ID = '31cfee0c-fbe4-4128-adbc-3a1c740b6960';
const MAX_ITEMS = 5;

async function createDb() {
  const { getConfig } = await import('../packages/core/config.js');
  const mod = await import('../packages/commands/node_modules/@supabase/supabase-js/dist/index.mjs');
  const cfg = getConfig();
  return mod.createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

async function main() {
  const db = await createDb();

  // 1. Load approved items — prefer SCHEMA_MISSING on routable URLs
  //    (meta title/desc fixes are all on system URLs like /cart, /account
  //     which can't be routed to Shopify resources for metafield writes)
  const { data: items, error } = await db
    .from('action_queue')
    .select('id, run_id, tenant_id, site_id, issue_type, url, risk_score, priority, proposed_fix, execution_status')
    .eq('site_id', SITE_ID)
    .eq('execution_status', 'approved')
    .eq('issue_type', 'SCHEMA_MISSING')
    .like('url', '%/pages/%')
    .order('priority', { ascending: true })
    .limit(MAX_ITEMS);

  if (error) {
    console.error('Failed to load approved items:', error.message);
    process.exit(1);
  }

  if (!items || items.length === 0) {
    console.log('No approved items found for cococabanalife.com');
    console.log('\nChecking all statuses...');
    const { data: allItems } = await db
      .from('action_queue')
      .select('execution_status')
      .eq('site_id', SITE_ID);
    if (allItems) {
      const counts: Record<string, number> = {};
      for (const r of allItems) {
        counts[r.execution_status] = (counts[r.execution_status] || 0) + 1;
      }
      console.log('Status distribution:', counts);
    }
    process.exit(0);
  }

  console.log(`Found ${items.length} approved items:\n`);
  for (const item of items) {
    console.log(`  ${item.id}  ${item.issue_type}  ${item.url.slice(0, 60)}`);
    console.log(`    proposed_fix: ${JSON.stringify(item.proposed_fix).slice(0, 100)}`);
  }
  console.log('');

  // 2. Load credentials
  const { data: cred } = await db
    .from('site_credentials')
    .select('credential_val')
    .eq('site_id', SITE_ID)
    .eq('credential_key', 'shopify_access_token')
    .maybeSingle();

  if (!cred?.credential_val) {
    console.error('No shopify_access_token found in site_credentials');
    process.exit(1);
  }

  const { data: site } = await db
    .from('sites')
    .select('site_url')
    .eq('site_id', SITE_ID)
    .maybeSingle();

  if (!site?.site_url) {
    console.error('No site_url found in sites table');
    process.exit(1);
  }

  console.log(`Store: ${site.site_url}`);
  console.log(`Token: shpat_...${(cred.credential_val as string).slice(-6)}\n`);

  // 3. Build deps with real Shopify calls
  const { applyFix: shopifyApplyFix } = await import('../packages/adapters/shopify/src/index.js');

  const deps: Partial<ApplyDeps> = {
    async loadCredentials(_siteId: string) {
      return {
        access_token: cred.credential_val as string,
        store_url:    site.site_url as string,
      };
    },

    async shopifyApplyFix(request: ShopifyFixRequest) {
      return shopifyApplyFix(request);
    },

    async markDeployed(itemId: string) {
      const { error: upErr } = await db
        .from('action_queue')
        .update({ execution_status: 'deployed', updated_at: new Date().toISOString() })
        .eq('id', itemId);
      if (upErr) console.error(`  [warn] markDeployed: ${upErr.message}`);
    },

    async markFailed(itemId: string, errorMsg: string) {
      const { error: upErr } = await db
        .from('action_queue')
        .update({ execution_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', itemId);
      if (upErr) console.error(`  [warn] markFailed: ${upErr.message}`);
    },

    writeLog(entry) {
      console.log(`  [log] ${entry.stage} ${entry.status}${entry.error ? ' — ' + entry.error : ''}`);
    },
  };

  // 4. Apply
  console.log('Applying fixes...\n');
  const result = await applyBatch(items as ApprovedItem[], deps);

  // 5. Report
  console.log('\n════════════════════════════════════════════════════════');
  console.log(`  Applied: ${result.applied}`);
  console.log(`  Failed:  ${result.failed}`);
  console.log(`  Total:   ${result.results.length}`);
  console.log('────────────────────────────────────────────────────────');
  for (const r of result.results) {
    const status = r.success ? '✓' : '✗';
    console.log(`  ${status} ${r.action_id}  ${r.fix_type}`);
    if (r.error) console.log(`    Error: ${r.error}`);
    if (r.before_value) console.log(`    Before: ${JSON.stringify(r.before_value).slice(0, 100)}`);
  }
  if (result.errors.length > 0) {
    console.log('────────────────────────────────────────────────────────');
    console.log('  Errors:');
    for (const e of result.errors) {
      console.log(`    ${e}`);
    }
  }
  console.log('════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
