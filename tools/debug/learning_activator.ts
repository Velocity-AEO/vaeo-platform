/**
 * tools/debug/learning_activator.ts
 *
 * Activates the learning center on every fix — writes confidence deltas,
 * health deltas, and pattern keys back to the learnings table.
 *
 * Injectable deps for testability. Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LearningRecord {
  site_id:          string;
  issue_type:       string;
  url:              string;
  fix_applied:      boolean;
  health_delta:     number;
  confidence_score: number;
  pattern_key:      string;
  before_value:     string | null;
  after_value:      string | null;
  created_at:       string;
}

export interface LearningActivationResult {
  written:          boolean;
  learning_id?:     string;
  pattern_key:      string;
  confidence_delta: number;
  error?:           string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONFIDENCE_SUCCESS_DELTA = 0.05;
const CONFIDENCE_FAILURE_DELTA = -0.10;
const CONFIDENCE_MAX = 1.0;
const CONFIDENCE_MIN = 0.0;

export function buildPatternKey(issue_type: string, url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return `${issue_type}::${hostname}`;
  } catch {
    return `${issue_type ?? ''}::unknown`;
  }
}

function clampConfidence(base: number, delta: number): number {
  const result = base + delta;
  if (result > CONFIDENCE_MAX) return CONFIDENCE_MAX;
  if (result < CONFIDENCE_MIN) return CONFIDENCE_MIN;
  return result;
}

// ── Main activator ────────────────────────────────────────────────────────────

export async function activateLearning(
  site_id:          string,
  issue_type:       string,
  url:              string,
  fix_success:      boolean,
  health_delta:     number,
  confidence_score: number,
  before_value?:    string,
  after_value?:     string,
  deps?: {
    writeLearning?: (record: LearningRecord) => Promise<string>;
  },
): Promise<LearningActivationResult> {
  try {
    const pattern_key      = buildPatternKey(issue_type, url);
    const raw_delta        = fix_success ? CONFIDENCE_SUCCESS_DELTA : CONFIDENCE_FAILURE_DELTA;
    const confidence_delta = clampConfidence(confidence_score, raw_delta) - confidence_score;

    const record: LearningRecord = {
      site_id,
      issue_type,
      url,
      fix_applied:      fix_success,
      health_delta,
      confidence_score,
      pattern_key,
      before_value:     before_value ?? null,
      after_value:      after_value  ?? null,
      created_at:       new Date().toISOString(),
    };

    if (!deps?.writeLearning) {
      return { written: false, pattern_key, confidence_delta };
    }

    try {
      const learning_id = await deps.writeLearning(record);
      return { written: true, learning_id, pattern_key, confidence_delta };
    } catch (writeErr) {
      return {
        written:          false,
        pattern_key,
        confidence_delta,
        error:            writeErr instanceof Error ? writeErr.message : String(writeErr),
      };
    }
  } catch (err) {
    return {
      written:          false,
      pattern_key:      `${issue_type ?? ''}::unknown`,
      confidence_delta: 0,
      error:            err instanceof Error ? err.message : String(err),
    };
  }
}
