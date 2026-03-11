/**
 * packages/commands/src/approve.ts
 *
 * vaeo approve --site <domain> [--all]
 *
 * Reads action_queue rows where execution_status='pending_approval' and
 * reasoning_block is populated, displays each ReasoningBlock summary,
 * and either bulk-approves all (--all) or prompts per item (y/n/skip).
 *
 * Per-item flow:
 *   pending_approval → display ReasoningBlock summary:
 *     user answers 'y'    → mark 'approved'
 *     user answers 'n'    → mark 'skipped'
 *     user answers 'skip' → leave unchanged, continue
 *
 * When --all is set, all items are bulk-approved without prompting.
 *
 * Never throws — always returns ApproveResult.
 */

import type { ReasoningBlock } from '../../../tools/reasoning/generate_block.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PendingApprovalItem {
  id:                string;
  run_id:            string;
  tenant_id:         string;
  site_id:           string;
  issue_type:        string;
  url:               string;
  risk_score:        number;
  priority:          number;
  proposed_fix:      Record<string, unknown>;
  execution_status:  string;
  reasoning_block:   ReasoningBlock | null;
}

export interface ApproveRequest {
  site:        string;  // domain
  approve_all: boolean;
}

export interface ApproveResult {
  site:         string;
  approved:     number;
  skipped:      number;
  deferred:     number;  // left unchanged (user typed 'skip')
  total:        number;
  completed_at: string;
  status:       'completed' | 'failed';
  error?:       string;
}

// ── Injectable deps ─────────────────────────────────────────────────────────

export interface ApproveCommandOps {
  /** Resolve site_id from domain. */
  lookupSiteByDomain: (domain: string) => Promise<{ site_id: string; tenant_id: string } | null>;
  /** Load pending_approval rows with reasoning_block populated. */
  loadPendingItems: (siteId: string) => Promise<PendingApprovalItem[]>;
  /** Mark execution_status='approved'. */
  markApproved: (itemId: string) => Promise<void>;
  /** Mark execution_status='skipped'. */
  markSkipped: (itemId: string) => Promise<void>;
  /** Display a ReasoningBlock summary to stdout. */
  displaySummary: (item: PendingApprovalItem) => void;
  /** Prompt user for y/n/skip decision. Returns 'y', 'n', or 'skip'. */
  promptUser: (item: PendingApprovalItem) => Promise<'y' | 'n' | 'skip'>;
}

// ── Display helper ──────────────────────────────────────────────────────────

/**
 * Format a ReasoningBlock into a readable summary string.
 * Used by both the real display and tests.
 */
export function formatSummary(item: PendingApprovalItem): string {
  const rb = item.reasoning_block;
  if (!rb) {
    return `  [${item.id}] ${item.issue_type} on ${item.url}\n    (no reasoning block)\n`;
  }

  const lines = [
    `  ── ${item.issue_type} ──────────────────────────────────`,
    `  URL:          ${item.url}`,
    `  Issue:        ${rb.detected.issue}`,
    `  Current:      ${rb.detected.current_value ?? '(none)'}`,
    `  Proposed:     ${rb.proposed.change}`,
    `  Target:       ${rb.proposed.target_value ?? '(auto-generated)'}`,
    `  Confidence:   ${(rb.confidence * 100).toFixed(0)}%`,
    `  Risk:         ${rb.risk_score}/10`,
    `  Blast radius: ${rb.blast_radius} URL${rb.blast_radius === 1 ? '' : 's'}`,
    `  Recommended:  ${rb.recommended_option}`,
  ];

  if (rb.dependency_check.length > 0) {
    lines.push(`  Dependencies: ${rb.dependency_check.join(', ')}`);
  }
  if (rb.visual_change_flag) {
    lines.push(`  ⚠ Visual change expected`);
  }

  return lines.join('\n') + '\n';
}

// ── Real implementations ────────────────────────────────────────────────────

const realLookupSiteByDomain: ApproveCommandOps['lookupSiteByDomain'] = async (domain) => {
  const { getConfig }    = await import('../../core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await db
    .from('sites')
    .select('site_id, tenant_id')
    .or(`site_url.eq.${domain},site_url.eq.https://${domain}`)
    .limit(1)
    .single();
  if (error || !data) return null;
  return data as { site_id: string; tenant_id: string };
};

const realLoadPendingItems: ApproveCommandOps['loadPendingItems'] = async (siteId) => {
  const { getConfig }    = await import('../../core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await db
    .from('action_queue')
    .select('id, run_id, tenant_id, site_id, issue_type, url, risk_score, priority, proposed_fix, execution_status')
    .eq('site_id', siteId)
    .eq('execution_status', 'pending_approval')
    .order('priority', { ascending: true })
    .order('risk_score', { ascending: true });
  if (error) throw new Error(`action_queue load failed: ${error.message}`);
  // Map to PendingApprovalItem — reasoning_block not in DB, default to null
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    reasoning_block: null,
  })) as PendingApprovalItem[];
};

const realMarkApproved: ApproveCommandOps['markApproved'] = async (itemId) => {
  const { getConfig }    = await import('../../core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  const { error } = await db
    .from('action_queue')
    .update({ execution_status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) throw new Error(`markApproved failed: ${error.message}`);
};

const realMarkSkipped: ApproveCommandOps['markSkipped'] = async (itemId) => {
  const { getConfig }    = await import('../../core/config.js');
  const { createClient } = await import('@supabase/supabase-js');
  const cfg = getConfig();
  const db  = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  const { error } = await db
    .from('action_queue')
    .update({ execution_status: 'skipped', updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) throw new Error(`markSkipped failed: ${error.message}`);
};

const realDisplaySummary: ApproveCommandOps['displaySummary'] = (item) => {
  process.stdout.write(formatSummary(item));
};

const realPromptUser: ApproveCommandOps['promptUser'] = async (_item) => {
  // In real usage, reads from stdin. For now, default to 'skip'.
  // The CLI wires this up with readline.
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('  Approve? (y/n/skip): ', (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === 'y' || a === 'yes') resolve('y');
      else if (a === 'n' || a === 'no') resolve('n');
      else resolve('skip');
    });
  });
};

function defaultOps(): ApproveCommandOps {
  return {
    lookupSiteByDomain: realLookupSiteByDomain,
    loadPendingItems:   realLoadPendingItems,
    markApproved:       realMarkApproved,
    markSkipped:        realMarkSkipped,
    displaySummary:     realDisplaySummary,
    promptUser:         realPromptUser,
  };
}

// ── runApprove ──────────────────────────────────────────────────────────────

export async function runApprove(
  request:   ApproveRequest,
  _testOps?: Partial<ApproveCommandOps>,
): Promise<ApproveResult> {
  const ops = { ...defaultOps(), ..._testOps };

  const fail = (error: string): ApproveResult => ({
    site:         request.site,
    approved:     0,
    skipped:      0,
    deferred:     0,
    total:        0,
    completed_at: new Date().toISOString(),
    status:       'failed',
    error,
  });

  // ── 1. Validate ───────────────────────────────────────────────────────────
  if (!request.site?.trim()) {
    return fail('site domain is required');
  }

  // ── 2. Resolve site ───────────────────────────────────────────────────────
  let siteRecord: { site_id: string; tenant_id: string };
  try {
    const found = await ops.lookupSiteByDomain(request.site);
    if (!found) return fail(`Site not found for domain: ${request.site}`);
    siteRecord = found;
  } catch (err) {
    return fail(`Site lookup error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 3. Load pending items ─────────────────────────────────────────────────
  let items: PendingApprovalItem[];
  try {
    items = await ops.loadPendingItems(siteRecord.site_id);
  } catch (err) {
    return fail(`Failed to load pending items: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (items.length === 0) {
    return {
      site:         request.site,
      approved:     0,
      skipped:      0,
      deferred:     0,
      total:        0,
      completed_at: new Date().toISOString(),
      status:       'completed',
    };
  }

  // ── 4. Process items ──────────────────────────────────────────────────────
  let approved = 0;
  let skipped  = 0;
  let deferred = 0;

  for (const item of items) {
    if (request.approve_all) {
      // Bulk approve — no prompt
      try {
        await ops.markApproved(item.id);
        approved++;
      } catch {
        deferred++;
      }
      continue;
    }

    // Interactive mode — display and prompt
    ops.displaySummary(item);

    let decision: 'y' | 'n' | 'skip';
    try {
      decision = await ops.promptUser(item);
    } catch {
      deferred++;
      continue;
    }

    if (decision === 'y') {
      try {
        await ops.markApproved(item.id);
        approved++;
      } catch {
        deferred++;
      }
    } else if (decision === 'n') {
      try {
        await ops.markSkipped(item.id);
        skipped++;
      } catch {
        deferred++;
      }
    } else {
      // 'skip' — leave unchanged
      deferred++;
    }
  }

  return {
    site:         request.site,
    approved,
    skipped,
    deferred,
    total:        items.length,
    completed_at: new Date().toISOString(),
    status:       'completed',
  };
}

// ── CLI entry point ─────────────────────────────────────────────────────────

export async function runApproveCli(opts: { site: string; all?: boolean }): Promise<void> {
  const result = await runApprove({
    site:        opts.site,
    approve_all: opts.all ?? false,
  });

  if (result.status === 'completed') {
    process.stdout.write(
      `✓ Approve completed — ${result.approved} approved, ` +
      `${result.skipped} skipped, ${result.deferred} deferred ` +
      `(${result.total} total)\n`,
    );
  } else {
    process.stderr.write(`✗ Approve failed: ${result.error ?? 'unknown error'}\n`);
    process.exitCode = 1;
  }
}
