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
  .option('--site <domain>', 'Site domain to crawl')
  .option('--run <id>', 'Run ID to associate with this crawl (default: auto-generated)')
  .action(() => {
    console.log('[vaeo crawl] not yet implemented');
  });

// ── vaeo audit ───────────────────────────────────────────────────────────────

program
  .command('audit')
  .description('Run SEO detectors against a crawl and produce a ranked issue blueprint')
  .option('--site <domain>', 'Site domain to audit')
  .option('--run <id>', 'Run ID of an existing crawl to audit')
  .action(() => {
    console.log('[vaeo audit] not yet implemented');
  });

// ── vaeo optimize ────────────────────────────────────────────────────────────

program
  .command('optimize')
  .description('Generate patch plans for all actionable issues in an audit blueprint')
  .option('--site <domain>', 'Site domain')
  .option('--run <id>', 'Run ID of the audit to optimize')
  .option('--mode <mode>', 'Execution mode: preview | apply (default: preview)')
  .action(() => {
    console.log('[vaeo optimize] not yet implemented');
  });

// ── vaeo verify ──────────────────────────────────────────────────────────────

program
  .command('verify')
  .description('Fetch live or sandbox URLs and confirm patches are present in the DOM')
  .option('--site <domain>', 'Site domain')
  .option('--run <id>', 'Run ID of the patch set to verify')
  .option('--sandbox', 'Verify against sandbox theme instead of live')
  .action(() => {
    console.log('[vaeo verify] not yet implemented');
  });

// ── vaeo promote ─────────────────────────────────────────────────────────────

program
  .command('promote')
  .description('Promote a verified sandbox to live after all guardrail checks pass')
  .option('--site <domain>', 'Site domain')
  .option('--run <id>', 'Run ID of the verified patch set to promote')
  .action(() => {
    console.log('[vaeo promote] not yet implemented');
  });

// ── vaeo rollback ────────────────────────────────────────────────────────────

program
  .command('rollback')
  .description('Restore all fields in a patch manifest to their before_value')
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
