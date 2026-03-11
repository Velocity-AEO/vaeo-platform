/**
 * scripts/run_sandbox_verify.ts
 *
 * CLI script: verify JSON-LD schema on a live URL for a sandbox site.
 *
 * After verify:
 *   - Always calls logLearning with the result.
 *   - If status = PASS: also calls queueForApproval.
 *   - If status = FAIL: logs with approval_status = 'failed_sandbox'.
 *   - Prints learning_id and queue_id (if created) to stdout.
 *
 * Args:
 *   --site-id <uuid>  (required) — site UUID
 *   --url <url>       (required) — URL to verify
 *
 * Usage: doppler run -- npx tsx scripts/run_sandbox_verify.ts --site-id <id> --url <url>
 *
 * Exit 0 on PASS, exit 1 on FAIL / NO_SCHEMA / error.
 */

import { sandboxVerify, type VerifyResult } from '../tools/sandbox/sandbox_verify.js';
import { logLearning, type LogLearningResult } from '../tools/learning/learning_logger.js';
import { queueForApproval, type QueueResult } from '../tools/learning/approval_queue.js';

// ── Wiring types ─────────────────────────────────────────────────────────────

export interface SandboxWiringDeps {
  verify:           (url: string)                                     => Promise<VerifyResult>;
  logLearning:      (entry: Parameters<typeof logLearning>[0], db: unknown) => Promise<LogLearningResult>;
  queueForApproval: (params: Parameters<typeof queueForApproval>[0], db: unknown) => Promise<QueueResult>;
}

export interface SandboxWiringResult {
  verifyResult: VerifyResult;
  learningId?:  string;
  queueId?:     string;
  logError?:    string;
  queueError?:  string;
}

// ── Core wiring — exported for tests ─────────────────────────────────────────

/**
 * Run sandbox verify then log to learnings + optionally queue for approval.
 * Never throws — returns result objects.
 */
export async function sandboxVerifyAndLog(
  siteId:    string,
  url:       string,
  issueType: string,
  db:        unknown,
  deps:      SandboxWiringDeps,
): Promise<SandboxWiringResult> {
  const verifyResult = await deps.verify(url);

  const isPass = verifyResult.status === 'PASS';

  // 1. Log learning
  const entry = {
    site_id:        siteId,
    issue_type:     issueType,
    url,
    fix_type:       'schema',
    sandbox_status: verifyResult.status,
    approval_status: isPass ? 'pending' : 'failed_sandbox',
    after_value:    verifyResult.rawSchema ?? undefined,
  };

  const logResult = await deps.logLearning(entry, db);

  // 2. If PASS, queue for approval
  let queueId:    string | undefined;
  let queueError: string | undefined;

  if (isPass && logResult.ok) {
    const qr = await deps.queueForApproval(
      {
        site_id:        siteId,
        learning_id:    logResult.id,
        issue_type:     issueType,
        url,
        proposed_value: verifyResult.rawSchema ?? undefined,
        sandbox_result: { status: verifyResult.status, schemaType: verifyResult.schemaType },
        sandbox_status: 'PASS',
      },
      db,
    );
    if (qr.ok)  queueId    = qr.id;
    else        queueError = qr.error;
  }

  return {
    verifyResult,
    learningId: logResult.ok ? logResult.id : undefined,
    queueId,
    logError:   logResult.ok ? undefined : logResult.error,
    queueError,
  };
}

// ── CLI helpers ───────────────────────────────────────────────────────────────

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

// ── Main ──────────────────────────────────────────────────────────────────────

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

  // Wire: verify → log → queue
  const wiring = await sandboxVerifyAndLog(siteId, url, 'SCHEMA_MISSING', db, {
    verify:           sandboxVerify,
    logLearning,
    queueForApproval,
  });

  const { verifyResult } = wiring;

  // Print formatted result
  console.log(JSON.stringify(verifyResult, null, 2));

  // Print learning / queue IDs
  if (wiring.learningId) {
    console.log(`\nlearning_id: ${wiring.learningId}`);
  } else if (wiring.logError) {
    console.warn(`learning log failed (non-fatal): ${wiring.logError}`);
  }

  if (wiring.queueId) {
    console.log(`queue_id:    ${wiring.queueId}`);
  } else if (wiring.queueError) {
    console.warn(`queue failed (non-fatal): ${wiring.queueError}`);
  }

  // Best-effort: persist result to sites table
  try {
    await db
      .from('sites')
      .update({
        sandbox_last_verified_at: verifyResult.fetchedAt,
        sandbox_last_result:      verifyResult,
      })
      .eq('site_id', siteId);
  } catch {
    // Non-fatal — migration may not be applied yet
  }

  // Exit code
  if (verifyResult.status === 'PASS') {
    console.log('\n✓ PASS');
    process.exit(0);
  } else {
    console.log(`\n✗ ${verifyResult.status}`);
    process.exit(1);
  }
}

// Only run main when invoked directly (not when imported by tests)
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename || process.argv[1]?.endsWith('run_sandbox_verify.ts')) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
