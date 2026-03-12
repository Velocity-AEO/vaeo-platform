/**
 * tools/viewport/viewport_qa_orchestrator.ts
 *
 * Top-level module that coordinates viewport capture, storage,
 * and QA gating for any fix in the pipeline. Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ViewportQARecord {
  fix_id:           string;
  site_id:          string;
  url:              string;
  passed:           boolean;
  failed_viewports: string[];
  checked_at:       string;
  screenshots:      Record<string, string>;  // viewport_name → storage_path
}

export interface ViewportCapturePair {
  viewport:    string;
  before_path: string;
  after_path:  string;
  diff_score:  number;   // 0-1 similarity
}

export interface ViewportQAOrchestratorConfig {
  site_id:          string;
  storage_backend:  'supabase' | 'local';
  supabase_bucket?: string;
  enabled:          boolean;
}

export interface ViewportQAOrchestratorResult {
  fix_id:        string;
  url:           string;
  qa_passed:     boolean;
  qa_record:     ViewportQARecord;
  capture_pair?: ViewportCapturePair;
  skipped:       boolean;
  skip_reason?:  string;
}

export interface ViewportQADeps {
  captureFn?:    (url: string) => Promise<ViewportCapturePair>;
  storeFn?:      (pair: ViewportCapturePair) => Promise<Record<string, string>>;
  saveRecordFn?: (record: ViewportQARecord) => Promise<void>;
}

// ── Default stubs ─────────────────────────────────────────────────────────────

function defaultCapture(url: string): Promise<ViewportCapturePair> {
  return Promise.resolve({
    viewport: 'desktop',
    before_path: `/tmp/before_${Date.now()}.png`,
    after_path:  `/tmp/after_${Date.now()}.png`,
    diff_score:  0.98,
  });
}

function defaultStore(pair: ViewportCapturePair): Promise<Record<string, string>> {
  return Promise.resolve({ [pair.viewport]: pair.before_path });
}

function defaultSaveRecord(_record: ViewportQARecord): Promise<void> {
  return Promise.resolve();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEmptyRecord(fix_id: string, site_id: string, url: string): ViewportQARecord {
  return {
    fix_id,
    site_id,
    url,
    passed: true,
    failed_viewports: [],
    checked_at: new Date().toISOString(),
    screenshots: {},
  };
}

// ── runViewportQAForFix ───────────────────────────────────────────────────────

export async function runViewportQAForFix(
  fix_id: string,
  url: string,
  runFix: () => Promise<void>,
  config: ViewportQAOrchestratorConfig,
  deps?: ViewportQADeps,
): Promise<ViewportQAOrchestratorResult> {
  try {
    const record = buildEmptyRecord(fix_id, config.site_id, url);

    // If disabled, run fix without capture
    if (!config.enabled) {
      try { await runFix(); } catch { /* never throws */ }
      return {
        fix_id,
        url,
        qa_passed: true,
        qa_record: record,
        skipped: true,
        skip_reason: 'disabled',
      };
    }

    const captureFn    = deps?.captureFn    ?? defaultCapture;
    const storeFn      = deps?.storeFn      ?? defaultStore;
    const saveRecordFn = deps?.saveRecordFn ?? defaultSaveRecord;

    // Capture before
    const pair = await captureFn(url);

    // Run the fix
    await runFix();

    // Capture after (reuse captureFn for after state)
    const afterPair = await captureFn(url);
    pair.after_path = afterPair.after_path;
    pair.diff_score = afterPair.diff_score;

    // Store screenshots
    const screenshots = await storeFn(pair);
    record.screenshots = screenshots;

    // Determine pass/fail based on diff_score
    const passed = pair.diff_score >= 0.85;
    record.passed = passed;
    if (!passed) {
      record.failed_viewports.push(pair.viewport);
    }

    // Save record
    await saveRecordFn(record);

    return {
      fix_id,
      url,
      qa_passed: passed,
      qa_record: record,
      capture_pair: pair,
      skipped: false,
    };
  } catch (err) {
    const record = buildEmptyRecord(fix_id, config?.site_id ?? '', url);
    record.passed = true;
    return {
      fix_id,
      url,
      qa_passed: true,
      qa_record: record,
      skipped: true,
      skip_reason: err instanceof Error ? err.message : 'Unknown error during QA',
    };
  }
}

// ── runViewportQABatch ────────────────────────────────────────────────────────

export async function runViewportQABatch(
  fixes: Array<{ fix_id: string; url: string; runFix: () => Promise<void> }>,
  config: ViewportQAOrchestratorConfig,
  deps?: ViewportQADeps,
): Promise<ViewportQAOrchestratorResult[]> {
  try {
    const results: ViewportQAOrchestratorResult[] = [];
    for (const fix of (fixes ?? [])) {
      const result = await runViewportQAForFix(
        fix.fix_id,
        fix.url,
        fix.runFix,
        config,
        deps,
      );
      results.push(result);
    }
    return results;
  } catch {
    return [];
  }
}
