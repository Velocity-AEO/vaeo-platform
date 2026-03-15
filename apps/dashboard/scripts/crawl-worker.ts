/**
 * scripts/crawl-worker.ts
 *
 * Thin subprocess entrypoint spawned by POST /api/sites/[siteId]/crawl.
 * Running crawlee + its Puppeteer/Playwright transitive deps as a child
 * process keeps them out of the Next.js webpack bundle entirely.
 *
 * Args:  --site-id <uuid>  --tenant-id <uuid>  --cms <type>
 * Exit:  0 on success, 1 on failure.
 * Stdout: single JSON line — { urls_crawled, issues_found, issues_written }
 *         OR { error: string } on failure.
 */

import { runCrawl } from '../../../packages/commands/src/crawl.js';
import { runAudit } from '../../../packages/commands/src/audit.js';
import type { CmsType } from '../../../packages/core/types.js';

function arg(flag: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    throw new Error(`Missing required arg: ${flag}`);
  }
  return process.argv[idx + 1];
}

const siteId   = arg('--site-id');
const tenantId = arg('--tenant-id');
const cmsType  = arg('--cms') as CmsType;

// ── Crawl ──────────────────────────────────────────────────────────────────

const crawlResult = await runCrawl({ site_id: siteId, tenant_id: tenantId });

if (crawlResult.status === 'failed') {
  process.stdout.write(JSON.stringify({ error: crawlResult.error ?? 'Crawl failed' }) + '\n');
  process.exit(1);
}

// ── Audit ──────────────────────────────────────────────────────────────────
// Run audit even when crawl is 'partial' — some URLs crawled is enough.

const auditResult = await runAudit({
  run_id:    crawlResult.run_id,
  tenant_id: tenantId,
  site_id:   siteId,
  cms:       cmsType,
});

if (auditResult.status === 'failed') {
  process.stdout.write(JSON.stringify({ error: auditResult.error ?? 'Audit failed' }) + '\n');
  process.exit(1);
}

process.stdout.write(JSON.stringify({
  urls_crawled:   crawlResult.urls_crawled,
  issues_found:   auditResult.issues_found,
  issues_written: auditResult.action_queue_populated ? auditResult.issues_found : 0,
}) + '\n');
