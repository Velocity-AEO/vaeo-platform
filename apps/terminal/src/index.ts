#!/usr/bin/env -S node --import tsx/esm
/**
 * apps/terminal/src/index.ts
 *
 * Single source of truth for all Velocity AEO CLI commands.
 * All command definitions live here — nowhere else.
 *
 * Usage: vaeo <command> [options]
 */

import { Command } from 'commander';
import type {
  CMSAdapter,
  PatchManifest,
  ActionLogEvent,
  InjectionRegistry,
  GuardrailDecision,
} from '../../../packages/core/types.js';
import {
  executeRollback,
  verifyRollback,
} from '../../../packages/patch-engine/src/rollback-runner.js';
import { runConnectCli } from '../../../packages/commands/src/connect.js';
import { runCrawlCli }   from '../../../packages/commands/src/crawl.js';
import { runAuditCli }    from '../../../packages/commands/src/audit.js';
import { runOptimizeCli } from '../../../packages/commands/src/optimize.js';
import { runVerifyCli }   from '../../../packages/commands/src/verify.js';
import { runPromoteCli }   from '../../../packages/commands/src/promote.js';
import { runRollbackCli } from '../../../packages/commands/src/rollback.js';
import { runTracerScanCli } from '../../../packages/commands/src/tracer-scan.js';

// Type imports are referenced here so the file is the declared consumer of the
// platform contracts. Implementations will import from packages/core/types.ts
// directly — these imports ensure the CLI stays in sync with the contract.
type _Contracts = CMSAdapter | PatchManifest | ActionLogEvent | InjectionRegistry | GuardrailDecision;

const program = new Command();

program
  .name('vaeo')
  .description('Velocity AEO — automated technical SEO platform for Shopify and WordPress')
  .version('1.2.0');

// ── vaeo connect ─────────────────────────────────────────────────────────────

program
  .command('connect')
  .description('Authenticate with a CMS and register the site with VAEO')
  .requiredOption('--cms <type>',         'CMS target: shopify | wordpress')
  .requiredOption('--tenant-id <id>',     'Tenant UUID')
  .option('--store <url>',                'Shopify store URL (mystore.myshopify.com)')
  .option('--token <token>',              'Shopify Admin API access token')
  .option('--url <url>',                  'WordPress site URL (https://mysite.com)')
  .option('--username <username>',        'WordPress admin username')
  .option('--app-password <password>',    'WordPress Application Password')
  .action(async (opts: {
    cms:         string;
    tenantId:    string;
    store?:      string;
    token?:      string;
    url?:        string;
    username?:   string;
    appPassword?: string;
  }) => {
    await runConnectCli(opts);
  });

// ── vaeo crawl ───────────────────────────────────────────────────────────────

program
  .command('crawl')
  .description('Crawl all URLs for a site and build the canonical URL inventory')
  .requiredOption('--site-id <uuid>',   'Site UUID (from vaeo connect)')
  .requiredOption('--tenant-id <uuid>', 'Tenant UUID')
  .option('--max-urls <n>',             'Maximum URLs to crawl (default: 2000)', parseInt)
  .option('--depth <n>',                'Maximum crawl depth from start URL (default: 3)', parseInt)
  .action(async (opts: {
    siteId:   string;
    tenantId: string;
    maxUrls?: number;
    depth?:   number;
  }) => {
    await runCrawlCli(opts);
  });

// ── vaeo audit ───────────────────────────────────────────────────────────────

program
  .command('audit')
  .description('Run SEO detectors against a crawl and produce a ranked issue blueprint')
  .requiredOption('--run-id <id>',    'Run ID of the crawl snapshot to audit')
  .requiredOption('--tenant-id <id>', 'Tenant UUID')
  .requiredOption('--site-id <id>',   'Site UUID')
  .requiredOption('--cms <type>',     'CMS target: shopify | wordpress')
  .action(async (opts: { runId: string; tenantId: string; siteId: string; cms: string }) => {
    await runAuditCli(opts);
  });

// ── vaeo optimize ────────────────────────────────────────────────────────────

program
  .command('optimize')
  .description('Apply fixes in guardrail priority order, validate, and deploy or queue for approval')
  .requiredOption('--run-id <id>',    'Run ID of the audit to optimize')
  .requiredOption('--tenant-id <id>', 'Tenant UUID')
  .requiredOption('--site-id <id>',   'Site UUID')
  .option('--auto-approve-max-risk <n>', 'Max risk score for auto-deploy (default: 3)', parseInt)
  .action(async (opts: { runId: string; tenantId: string; siteId: string; autoApproveMaxRisk?: number }) => {
    await runOptimizeCli(opts);
  });

// ── vaeo verify ──────────────────────────────────────────────────────────────

program
  .command('verify')
  .description('Re-run validators against deployed fixes to confirm nothing regressed post-deployment')
  .requiredOption('--run-id <id>',    'Run ID of the deployed patch set to verify')
  .requiredOption('--tenant-id <id>', 'Tenant UUID')
  .requiredOption('--site-id <id>',   'Site UUID')
  .action(async (opts: { runId: string; tenantId: string; siteId: string }) => {
    await runVerifyCli(opts);
  });

// ── vaeo promote ─────────────────────────────────────────────────────────────

program
  .command('promote')
  .description('Human approval gate — re-validate and deploy pending_approval fixes to live')
  .requiredOption('--run-id <id>',    'Run ID of the patch set to promote')
  .requiredOption('--tenant-id <id>', 'Tenant UUID')
  .requiredOption('--site-id <id>',   'Site UUID')
  .option('--action-id <id>',         'Promote a single fix by action_queue ID')
  .option('--all',                    'Promote all pending_approval fixes for this run')
  .action(async (opts: { runId: string; tenantId: string; siteId: string; actionId?: string; all?: boolean }) => {
    await runPromoteCli({ runId: opts.runId, tenantId: opts.tenantId, siteId: opts.siteId, actionId: opts.actionId, all: opts.all });
  });

// ── vaeo rollback ────────────────────────────────────────────────────────────

program
  .command('rollback')
  .description('Reverse deployed fixes for a run using the rollback_manifest stored at deploy time')
  .requiredOption('--run-id <id>',    'Run ID of the patch set to roll back')
  .requiredOption('--tenant-id <id>', 'Tenant UUID')
  .requiredOption('--site-id <id>',   'Site UUID')
  .option('--action-id <id>',         'Roll back a single fix by action_queue ID')
  .option('--all',                    'Roll back all deployed/regression_detected fixes for this run')
  .action(async (opts: { runId: string; tenantId: string; siteId: string; actionId?: string; all?: boolean }) => {
    await runRollbackCli({ runId: opts.runId, tenantId: opts.tenantId, siteId: opts.siteId, actionId: opts.actionId, all: opts.all });
  });

// ── legacy vaeo rollback (patch-engine rollback-runner) ───────────────────────
// Kept for direct manifest-level rollbacks initiated from vaeo-ground-truth CLI.

program
  .command('rollback-manifest')
  .description('Restore all fields in a patch manifest to their before_value (legacy)')
  .requiredOption('--run-id <id>', 'Run ID of the manifest to roll back')
  .requiredOption('--tenant <id>', 'Tenant ID that owns this run')
  .action(async (opts: { runId: string; tenant: string }) => {
    try {
      // Step 1: reverse every change in reverse order
      const result = await executeRollback(opts.runId, opts.tenant);

      console.log(
        `✓ Rollback complete — ${result.fields_reversed} fields reversed in ${result.time_ms}ms`,
      );

      // Step 2: confirm every field actually went back
      const verify = await verifyRollback(opts.runId, opts.tenant);

      if (verify.verified) {
        console.log('✓ Verification passed — all fields restored correctly');
      } else {
        console.error(
          `✗ Verification failed — mismatches: ${verify.mismatches.join(', ')}`,
        );
        process.exitCode = 1;
      }
    } catch (err) {
      console.error(`✗ Rollback failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

// ── vaeo tracer scan ─────────────────────────────────────────────────────────

const tracer = program
  .command('tracer')
  .description('Tracer module — field-level SEO scanning and drift detection');

tracer
  .command('scan')
  .description('Scan a site and populate the tracer URL inventory and field snapshots')
  .requiredOption('--site <domain>', 'Site domain (e.g. cococabanalife.com)')
  .action(async (opts: { site: string }) => {
    await runTracerScanCli(opts);
  });

// ── vaeo log ─────────────────────────────────────────────────────────────────

program
  .command('log')
  .description('Print the ActionLog for a site, optionally filtered by run or status')
  .option('--site <domain>', 'Site domain')
  .option('--run <id>', 'Filter to a specific run ID')
  .option('--status <status>', 'Filter by status: ok | error | skipped | pending')
  .action(() => {
    console.log('[vaeo log] not yet implemented');
  });

// ── Parse ─────────────────────────────────────────────────────────────────────

program.parse(process.argv);
