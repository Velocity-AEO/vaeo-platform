/**
 * scripts/push_snippet.ts
 *
 * Pushes the latest velocity-schema.liquid snippet to a site's live theme.
 * Does not require any action_queue items — works directly with site credentials.
 *
 * Usage:
 *   doppler run -- npx tsx scripts/push_snippet.ts --site-id=<uuid>
 *   doppler run -- npx tsx scripts/push_snippet.ts --site-id=<uuid> --force
 *
 * --force: strip any existing render tag and re-inject at correct position inside <head>
 */

import { getLiveThemeId, installSnippet } from '../tools/schema/snippet_installer.js';

// ── Parse args ───────────────────────────────────────────────────────────────

function parseSiteId(): string {
  const arg = process.argv.find((a) => a.startsWith('--site-id='));
  if (!arg) {
    console.error('Usage: doppler run -- npx tsx scripts/push_snippet.ts --site-id=<uuid> [--force]');
    process.exit(1);
  }
  return arg.split('=')[1]!;
}

function parseForce(): boolean {
  return process.argv.includes('--force');
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const siteId = parseSiteId();
  const force  = parseForce();
  const db     = await createDb();

  console.log(`\nPush Snippet`);
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

  console.log(`Store: ${storeUrl}`);
  console.log(`Token: shpat_...${accessToken.slice(-6)}\n`);

  // 2. Get live theme ID
  const themeId = await getLiveThemeId(host, accessToken);
  if (!themeId) {
    console.error('Could not find live (main) theme.');
    process.exit(1);
  }
  console.log(`Theme: ${themeId}\n`);

  if (force) console.log('Mode: FORCE — stripping and re-injecting render tag\n');

  // 3. Install / update snippet
  const result = await installSnippet(host, accessToken, themeId, force);

  if (!result.ok) {
    console.error(`FAILED: ${result.error}`);
    process.exit(1);
  }

  if (!result.alreadyInstalled || force) {
    console.log('INSTALLED — render tag injected into theme.liquid + snippet uploaded.');
  } else if (result.snippetUpdated) {
    console.log('UPDATED — render tag was present, snippet content re-uploaded (was stale).');
  } else {
    console.log('CURRENT — render tag present and snippet content already up-to-date.');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
