/**
 * tools/learning/auto_approval_log.ts
 *
 * Persists auto-approval decisions as learnings rows for audit purposes.
 * Injectable DB — never throws.
 */

import type { AutoApprovalConfig } from './auto_approver.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AutoApprovalLogEntry {
  id:               string;
  site_id:          string;
  item_id:          string;
  issue_type:       string;
  url:              string;
  decision:         'approved' | 'skipped';
  confidence:       number;
  confidence_tier:  string;
  reason:           string;
  config_snapshot:  AutoApprovalConfig;
  created_at:       string;
}

// ── DB interface (injectable) ─────────────────────────────────────────────────

export interface AuditDb {
  from(table: 'learnings'): {
    insert(row: Record<string, unknown>): {
      select(col: string): {
        maybeSingle(): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
      };
    };
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): {
          order(col: string, opts: { ascending: boolean }): {
            limit(n: number): Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
          };
        };
        order(col: string, opts: { ascending: boolean }): {
          limit(n: number): Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
        };
      };
    };
  };
}

// ── logAutoApprovalDecision ───────────────────────────────────────────────────

/**
 * Write one auto-approval decision to the learnings table.
 * sandbox_status = 'auto_approval_log', tracer_data = full entry JSON.
 * Non-fatal — never throws.
 */
export async function logAutoApprovalDecision(
  entry: Omit<AutoApprovalLogEntry, 'id' | 'created_at'>,
  db:    AuditDb,
): Promise<void> {
  try {
    await db
      .from('learnings')
      .insert({
        site_id:        entry.site_id,
        issue_type:     entry.issue_type,
        url:            entry.url,
        sandbox_status: 'auto_approval_log',
        tracer_data:    JSON.stringify(entry),
      })
      .select('id')
      .maybeSingle();
  } catch (err) {
    process.stderr.write(
      `[auto_approval_log] logAutoApprovalDecision failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

// ── getAutoApprovalHistory ────────────────────────────────────────────────────

/**
 * Query auto-approval log entries for a site from the learnings table.
 */
export async function getAutoApprovalHistory(
  siteId:  string,
  filters: { issue_type?: string; decision?: 'approved' | 'skipped'; limit?: number },
  db:      AuditDb,
): Promise<AutoApprovalLogEntry[]> {
  try {
    const limit = filters.limit ?? 100;

    let q = db.from('learnings')
      .select('tracer_data, created_at')
      .eq('site_id', siteId)
      .eq('sandbox_status', 'auto_approval_log');

    const result = filters.issue_type
      ? await (q as any).eq('issue_type', filters.issue_type).order('created_at', { ascending: false }).limit(limit)
      : await (q as any).order('created_at', { ascending: false }).limit(limit);

    const { data, error } = result;
    if (error || !data) return [];

    const entries: AutoApprovalLogEntry[] = [];
    for (const row of data) {
      try {
        const entry = JSON.parse(row['tracer_data'] as string) as AutoApprovalLogEntry;
        entry.created_at = row['created_at'] as string;
        if (filters.decision && entry.decision !== filters.decision) continue;
        entries.push(entry);
      } catch { /* skip malformed rows */ }
    }

    return entries;
  } catch {
    return [];
  }
}
