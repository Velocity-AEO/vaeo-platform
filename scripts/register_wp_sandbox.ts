/**
 * scripts/register_wp_sandbox.ts
 *
 * Registers a WordPress WooCommerce site as a VAEO sandbox.
 *
 * Usage: doppler run -- npx tsx scripts/register_wp_sandbox.ts
 *
 * Required Doppler env vars:
 *   WP_SANDBOX_URL           e.g. https://mystore.com
 *   WP_SANDBOX_USERNAME      WP admin username
 *   WP_SANDBOX_APP_PASSWORD  WP application password
 */

import { randomUUID } from 'node:crypto';
import { verifyWPConnection } from '../tools/wordpress/wp_connection.js';
import type { WPConnectionConfig } from '../tools/wordpress/wp_connection.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function deriveDomain(wp_url: string): string {
  try {
    return new URL(wp_url).hostname;
  } catch {
    return wp_url.replace(/^https?:\/\//, '').split('/')[0] ?? wp_url;
  }
}

async function createDb() {
  const { getConfig } = await import('../packages/core/config.js');
  const mod = await import('../packages/commands/node_modules/@supabase/supabase-js/dist/index.mjs');
  const cfg = getConfig();
  return mod.createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    // 1. Read credentials from Doppler env
    const wp_url      = getEnv('WP_SANDBOX_URL');
    const username    = getEnv('WP_SANDBOX_USERNAME');
    const app_password = getEnv('WP_SANDBOX_APP_PASSWORD');
    const domain      = deriveDomain(wp_url);

    const site_id = randomUUID();

    const config: WPConnectionConfig = {
      site_id,
      domain,
      wp_url,
      username,
      app_password,
      platform: 'wordpress',
    };

    // 2. Verify live connection
    console.log(`Verifying WP connection to ${wp_url} ...`);
    const result = await verifyWPConnection(config);

    if (!result.success) {
      console.error(`Connection failed: ${result.error}`);
      process.exit(1);
    }

    console.log(`WP connection OK — version: ${result.wp_version ?? 'unknown'}`);
    console.log(`WooCommerce active: ${result.woocommerce_active}`);
    if (result.active_plugins?.length) {
      console.log(`Active plugins (${result.active_plugins.length}): ${result.active_plugins.slice(0, 5).join(', ')}`);
    }

    // 3. Upsert site record in Supabase
    try {
      const db = await createDb();

      // Check for existing site with same domain
      const { data: existing } = await db
        .from('sites')
        .select('site_id')
        .eq('site_url', wp_url)
        .maybeSingle();

      if (existing?.site_id) {
        console.log(`Site already registered: ${existing.site_id}`);
        console.log(`WP sandbox registered: ${existing.site_id}`);
        return;
      }

      const { data: inserted, error } = await db
        .from('sites')
        .insert({
          site_id,
          site_url:   wp_url,
          platform:   'wordpress',
          cms_type:   'wordpress',
          domain,
          status:     'active',
          sandbox:    true,
          created_at: new Date().toISOString(),
        })
        .select('site_id')
        .single();

      if (error) {
        console.error(`Supabase insert error: ${error.message}`);
        process.exit(1);
      }

      console.log(`WP sandbox registered: ${inserted?.site_id ?? site_id}`);
    } catch (dbErr) {
      // DB not available (e.g. no SUPABASE_URL) — log and continue
      console.error(`DB unavailable — skipping Supabase upsert: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
      console.log(`WP sandbox registered (local only): ${site_id}`);
    }
  } catch (err) {
    console.error(`register_wp_sandbox failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
