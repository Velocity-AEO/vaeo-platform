/**
 * tools/learning/learning_logger.ts
 *
 * Persists fix outcomes to the learnings table for heuristic training.
 *
 * Injectable DB client — never throws, returns result objects.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LearningEntry {
  site_id?:         string;
  issue_type?:      string;
  url?:             string;
  fix_type?:        string;
  before_value?:    string;
  after_value?:     string;
  sandbox_status?:  string;
  approval_status?: string;
  reviewer_note?:   string;
  applied_at?:      string;
}

export interface LogLearningResult {
  ok:   boolean;
  id?:  string;
  error?: string;
}

export interface UpdateLearningResult {
  ok:     boolean;
  error?: string;
}

// ── DB interface (injectable) ─────────────────────────────────────────────────

export interface LearningDb {
  from(table: 'learnings'): {
    insert(row: LearningEntry): { select(col: string): { maybeSingle(): Promise<{ data: { id: string } | null; error: { message: string } | null }> } };
    update(updates: Partial<LearningEntry>): { eq(col: string, val: string): Promise<{ error: { message: string } | null }> };
  };
}

// ── logLearning ───────────────────────────────────────────────────────────────

/**
 * Insert a new learning row.
 * Returns { ok: true, id } on success, { ok: false, error } on failure.
 */
export async function logLearning(
  entry: LearningEntry,
  db:    LearningDb,
): Promise<LogLearningResult> {
  try {
    const row: LearningEntry = {
      approval_status: 'pending',
      ...entry,
    };
    const { data, error } = await db
      .from('learnings')
      .insert(row)
      .select('id')
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data?.id) return { ok: false, error: 'No id returned from insert' };
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── updateLearning ────────────────────────────────────────────────────────────

/**
 * Patch an existing learning row by id.
 * Returns { ok: true } on success, { ok: false, error } on failure.
 */
export async function updateLearning(
  id:      string,
  updates: Partial<LearningEntry>,
  db:      LearningDb,
): Promise<UpdateLearningResult> {
  try {
    if (!id) return { ok: false, error: 'id is required' };
    const { error } = await db
      .from('learnings')
      .update(updates)
      .eq('id', id);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
