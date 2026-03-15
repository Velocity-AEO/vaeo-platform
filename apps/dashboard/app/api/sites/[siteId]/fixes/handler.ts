/**
 * apps/dashboard/app/api/sites/[siteId]/fixes/handler.ts
 *
 * Business logic for the fixes API endpoint.
 * Pure functions with injectable deps — route.ts is a thin wrapper.
 * Never throws — returns result objects with error fields on failure.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ActionQueueRow {
  id:               string;
  url:              string;
  issue_type:       string;
  proposed_fix:     Record<string, unknown>;
  execution_status: string;
  priority:         number;
  risk_score:       number;
  reasoning_block:  Record<string, unknown> | null;
}

export interface SnapshotRow {
  url:           string;
  field_name:    string;
  current_value: string | null;
}

export interface FixItem {
  id:              string;
  url:             string;
  issue_type:      string;
  current_value:   string | null;
  proposed_value:  string | null;
  confidence:      number;
  status:          string;
  reasoning_block: Record<string, unknown> | null;
  proposed_fix?:   Record<string, unknown>;
}

export interface GetFixesResult {
  fixes: FixItem[];
  error?: string;
}

export interface UpdateFixResult {
  ok:                boolean;
  execution_status?: string;
  error?:            string;
}

// ── Injectable deps ──────────────────────────────────────────────────────────

export interface FixesDeps {
  loadActions:   (siteId: string) => Promise<ActionQueueRow[]>;
  loadSnapshots: (siteId: string) => Promise<SnapshotRow[]>;
  updateStatus:  (id: string, siteId: string, newStatus: string) => Promise<void>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Map issue_type to field_type for snapshot matching. */
function issueToField(issueType: string): string {
  const lower = issueType.toLowerCase();
  if (lower.includes('title')) return 'title';
  if (lower.includes('meta') || lower.includes('desc')) return 'meta_description';
  if (lower.includes('h1')) return 'h1';
  if (lower.includes('canonical')) return 'canonical';
  if (lower.includes('schema')) return 'schema';
  return issueType;
}

/** Extract proposed value from proposed_fix JSONB. */
function extractProposedValue(fix: Record<string, unknown>): string | null {
  for (const key of ['new_title', 'new_description', 'new_h1', 'new_value', 'generated_text', 'after_value']) {
    if (typeof fix[key] === 'string') return fix[key] as string;
  }
  return null;
}

/** Extract confidence from proposed_fix JSONB. */
function extractConfidence(fix: Record<string, unknown>): number {
  if (typeof fix['confidence_score'] === 'number') return fix['confidence_score'];
  if (typeof fix['confidence'] === 'number') return fix['confidence'];
  return 0.8;
}

// ── GET handler ──────────────────────────────────────────────────────────────

export async function getFixes(siteId: string, deps: FixesDeps): Promise<GetFixesResult> {
  try {
    const [actions, snapshots] = await Promise.all([
      deps.loadActions(siteId),
      deps.loadSnapshots(siteId),
    ]);

    const fixes: FixItem[] = actions.map((action) => {
      const field = issueToField(action.issue_type);
      const snap = snapshots.find(
        (s) => s.url === action.url && s.field_name === field,
      );

      const item: FixItem = {
        id:              action.id,
        url:             action.url,
        issue_type:      action.issue_type,
        current_value:   snap?.current_value ?? null,
        proposed_value:  extractProposedValue(action.proposed_fix),
        confidence:      extractConfidence(action.proposed_fix),
        status:          action.execution_status,
        reasoning_block: action.reasoning_block,
      };
      // Include raw proposed_fix for SCHEMA_ issues so UI can show JSON-LD
      if (action.issue_type.startsWith('SCHEMA_')) {
        item.proposed_fix = action.proposed_fix;
      }
      return item;
    });

    return { fixes };
  } catch (err) {
    return { fixes: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function updateFix(
  siteId: string,
  fixId:  string,
  action: string,
  deps:   FixesDeps,
): Promise<UpdateFixResult> {
  if (!fixId) return { ok: false, error: 'id is required' };
  if (action !== 'approve' && action !== 'skip') {
    return { ok: false, error: 'action must be "approve" or "skip"' };
  }

  const newStatus = action === 'approve' ? 'approved' : 'skipped';

  try {
    await deps.updateStatus(fixId, siteId, newStatus);
    return { ok: true, execution_status: newStatus };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
