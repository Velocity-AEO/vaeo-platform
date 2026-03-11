/**
 * scripts/run_sandbox_verify.ts
 *
 * CLI script: verify JSON-LD schema on a live URL for a sandbox site.
 *
 * Args:
 *   --site-id <uuid>  (required) — site UUID
 *   --url <url>       (required) — URL to verify
 *
 * Usage: doppler run -- npx tsx scripts/run_sandbox_verify.ts --site-id <id> --url <url>
 *
 * Exit 0 on PASS, exit 1 on FAIL / NO_SCHEMA / error.
 */

import { sandboxVerify } from '../tools/sandbox/sandbox_verify.js';

function parseArgs(): { siteId: string; url: string } {
  const args = process.argv.slice(2);
  let siteId = '';
  let url = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--site-id' && args[i + 1]) { siteId = args[++i]; continue; }
    if (args[i] === '--url'     && args[i + 1]) { url    = args[++i]; continue; }
  }

  if (!siteId) { console.error('Error: --site-id is required'); process.exit(1); }
  if (!url)    { console.error('Error: --url is required');     process.exit(1); }

  return { siteId, url };
}

async function createDb() {
  const { getConfig } = await import('../packages/core/config.js');
  const mod = await import('../packages/commands/node_modules/@supabase/supabase-js/dist/index.mjs');
  const cfg = getConfig();
  return mod.createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

async function main() {
  const { siteId, url } = parseArgs();

  // Verify site exists
  const db = await createDb();
  const { data: site, error: siteErr } = await db
    .from('sites')
    .select('site_id, site_url')
    .eq('site_id', siteId)
    .maybeSingle();

  if (siteErr || !site) {
    console.error(`Site not found: ${siteId}`);
    process.exit(1);
  }

  console.log(`Site: ${site.site_url} (${siteId})`);
  console.log(`URL:  ${url}\n`);

  // Run verification
  const result = await sandboxVerify(url);

  // Print formatted result
  console.log(JSON.stringify(result, null, 2));

  // Best-effort: persist result to sites table
  try {
    await db
      .from('sites')
      .update({
        sandbox_last_verified_at: result.fetchedAt,
        sandbox_last_result:      result,
      })
      .eq('site_id', siteId);
  } catch {
    // Non-fatal — migration may not be applied yet
  }

  // Exit code
  if (result.status === 'PASS') {
    console.log('\n✓ PASS');
    process.exit(0);
  } else {
    console.log(`\n✗ ${result.status}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
