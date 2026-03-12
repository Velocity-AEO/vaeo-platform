/**
 * scripts/run_wp_crawl.ts
 *
 * Crawls a live WordPress WooCommerce site and writes results to /tmp/wp_crawl_result.json.
 *
 * Usage: doppler run -- npx tsx scripts/run_wp_crawl.ts
 *
 * Required Doppler env vars:
 *   WP_SANDBOX_URL           e.g. https://mystore.com
 *   WP_SANDBOX_USERNAME      WP admin username
 *   WP_SANDBOX_APP_PASSWORD  WP application password
 */

import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { verifyWPConnection } from '../tools/wordpress/wp_connection.js';
import { crawlWPSite, summarizeCrawl } from '../tools/wordpress/wp_crawler.js';
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

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    const wp_url      = getEnv('WP_SANDBOX_URL');
    const username    = getEnv('WP_SANDBOX_USERNAME');
    const app_password = getEnv('WP_SANDBOX_APP_PASSWORD');
    const domain      = deriveDomain(wp_url);
    const site_id     = randomUUID();

    const config: WPConnectionConfig = {
      site_id,
      domain,
      wp_url,
      username,
      app_password,
      platform: 'wordpress',
    };

    // 1. Verify connection first
    console.log(`Verifying WP connection to ${wp_url} ...`);
    const conn = await verifyWPConnection(config);

    if (!conn.success) {
      console.error(`Connection failed: ${conn.error}`);
      process.exit(1);
    }

    console.log(`WP connection OK — version: ${conn.wp_version ?? 'unknown'}`);
    console.log(`WooCommerce active: ${conn.woocommerce_active}`);

    // 2. Crawl the site
    console.log(`\nCrawling ${wp_url} ...`);
    const result = await crawlWPSite(config);

    console.log(`\n${summarizeCrawl(result)}`);

    if (result.errors.length) {
      console.warn(`\nCrawl errors:\n  ${result.errors.join('\n  ')}`);
    }

    // 3. Log top 5 pages missing meta description
    const missingMeta = result.pages.filter(p => !p.meta_description).slice(0, 5);
    if (missingMeta.length) {
      console.log('\nTop pages missing meta description:');
      for (const p of missingMeta) {
        console.log(`  [${p.post_type}] ${p.url} — "${p.title}"`);
      }
    }

    // 4. Log top 5 pages missing schema
    const missingSchema = result.pages.filter(p => !p.has_schema).slice(0, 5);
    if (missingSchema.length) {
      console.log('\nTop pages missing JSON-LD schema:');
      for (const p of missingSchema) {
        console.log(`  [${p.post_type}] ${p.url} — "${p.title}"`);
      }
    }

    // 5. Write result to /tmp
    const outPath = '/tmp/wp_crawl_result.json';
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`\nFull crawl result written to ${outPath}`);

  } catch (err) {
    console.error(`run_wp_crawl failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
