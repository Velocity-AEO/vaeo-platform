/**
 * packages/guardrail/src/index.test.ts
 *
 * Unit tests for the VAEO guardrail state machine.
 * No real Redis / Supabase connections required.
 *
 * Tests confirm:
 *   1. canProceed: errors always allowed (nothing outranks it).
 *   2. canProceed: lower-priority category blocked when prerequisites unresolved.
 *   3. canProceed: returns true once all higher-priority categories are resolved.
 *   4. evaluate: all same-priority actions → all allowed.
 *   5. evaluate: mixed categories → correct allowed / blocked split.
 *   6. evaluate: confidence='preview_only' → deferred, not blocked or allowed.
 *   7. evaluate: ActionLog — guardrail:blocked entry per blocked action.
 *   8. evaluate: ActionLog — guardrail:evaluated summary with correct counts.
 *   9. PRIORITY_MAP: 8 unique categories, errors=1, enhancements=8.
 *  10. PRIORITY_MAP: priority numbers are contiguous 1–8.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRIORITY_MAP,
  canProceed,
  evaluate,
  type IssueCategory,
  type ProposedAction,
  type EvaluateLogContext,
} from './index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Intercepts process.stdout.write synchronously and returns captured lines. */
function captureStdout(fn: () => void): string[] {
  const captured: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return captured;
}

/** Parses captured stdout lines as JSON, skipping non-JSON lines. */
function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines.flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return [];
    try {
      return [JSON.parse(trimmed) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

/** Baseline log context for ActionLog tests. */
const CTX: EvaluateLogContext = {
  run_id:    'run-g-001',
  tenant_id: 't-aaa',
  site_id:   's-bbb',
  cms:       'shopify',
};

/** Factory for a minimal ProposedAction. */
function action(
  key: string,
  category: IssueCategory,
  extra?: Partial<ProposedAction>,
): ProposedAction {
  return {
    idempotency_key: key,
    category,
    patch_type: `${category}_patch`,
    url: `https://example.com/${key}`,
    ...extra,
  };
}

// ── Tests: canProceed ─────────────────────────────────────────────────────────

describe('canProceed', () => {
  it('errors always proceeds — nothing outranks it', () => {
    assert.ok(canProceed('errors', new Set()));
  });

  it('redirects blocked when errors not resolved', () => {
    assert.ok(!canProceed('redirects', new Set()));
  });

  it('redirects proceeds when errors resolved', () => {
    assert.ok(canProceed('redirects', new Set<IssueCategory>(['errors'])));
  });

  it('canonicals blocked when redirects not resolved (even if errors are)', () => {
    assert.ok(!canProceed('canonicals', new Set<IssueCategory>(['errors'])));
  });

  it('canonicals proceeds when errors + redirects resolved', () => {
    assert.ok(
      canProceed('canonicals', new Set<IssueCategory>(['errors', 'redirects'])),
    );
  });

  it('enhancements (priority 8) proceeds when all 7 higher resolved', () => {
    const all = new Set<IssueCategory>([
      'errors', 'redirects', 'canonicals', 'indexing',
      'content', 'schema', 'performance',
    ]);
    assert.ok(canProceed('enhancements', all));
  });

  it('enhancements blocked when any intermediate category unresolved', () => {
    const missingPerformance = new Set<IssueCategory>([
      'errors', 'redirects', 'canonicals', 'indexing',
      'content', 'schema',
      // 'performance' intentionally omitted
    ]);
    assert.ok(!canProceed('enhancements', missingPerformance));
  });
});

// ── Tests: evaluate ───────────────────────────────────────────────────────────

describe('evaluate', () => {
  it('all same-priority actions allowed when resolvedCategories covers prerequisites', () => {
    const actions = [
      action('k1', 'errors'),
      action('k2', 'errors'),
    ];
    const result = evaluate(actions, new Set());
    assert.equal(result.allowed.length,  2);
    assert.equal(result.blocked.length,  0);
    assert.equal(result.deferred.length, 0);
  });

  it('blocks lower-priority action when higher-priority category unresolved', () => {
    const actions = [
      action('k1', 'canonicals'),
    ];
    // errors resolved but NOT redirects
    const result = evaluate(actions, new Set<IssueCategory>(['errors']));
    assert.equal(result.blocked.length, 1);
    assert.ok(
      result.blocked[0].blocked_by_categories.includes('redirects'),
      'redirects must be listed as a blocking category',
    );
    assert.equal(result.allowed.length,  0);
    assert.equal(result.deferred.length, 0);
  });

  it('mixed batch: correct allowed/blocked split', () => {
    const actions = [
      action('k-err',  'errors'),       // priority 1 — always allowed
      action('k-rdr',  'redirects'),    // priority 2 — blocked (errors resolved, but…)
      action('k-can',  'canonicals'),   // priority 3 — blocked
    ];
    // Nothing resolved → only errors allowed
    const result = evaluate(actions, new Set());
    assert.equal(result.allowed.length,  1, 'only errors action should be allowed');
    assert.equal(result.blocked.length,  2, 'redirects and canonicals blocked');
    assert.equal(result.allowed[0].idempotency_key, 'k-err');
  });

  it('confidence=preview_only → deferred, not allowed or blocked', () => {
    const actions = [
      action('k1', 'errors', { confidence: 'preview_only' }),
    ];
    // errors has no prerequisites — canProceed = true — but confidence gates it
    const result = evaluate(actions, new Set());
    assert.equal(result.deferred.length, 1);
    assert.equal(result.allowed.length,  0);
    assert.equal(result.blocked.length,  0);
  });

  it('confidence=preview_only on blocked action → still blocked (priority check first)', () => {
    const actions = [
      action('k1', 'schema', { confidence: 'preview_only' }),
    ];
    // schema (priority 6) — nothing resolved → blocked
    const result = evaluate(actions, new Set());
    assert.equal(result.blocked.length,  1, 'priority check must win over confidence');
    assert.equal(result.deferred.length, 0);
  });

  it('empty action list → empty decision', () => {
    const result = evaluate([], new Set());
    assert.equal(result.allowed.length,  0);
    assert.equal(result.blocked.length,  0);
    assert.equal(result.deferred.length, 0);
  });

  it('accepts resolvedCategories as an array (not Set)', () => {
    const actions = [action('k1', 'redirects')];
    const result = evaluate(actions, ['errors'] as IssueCategory[]);
    assert.equal(result.allowed.length, 1);
  });

  // ── ActionLog ───────────────────────────────────────────────────────────────

  it('writes guardrail:blocked entry for each blocked action', () => {
    const actions = [
      action('kb1', 'schema'),   // blocked — errors/redirects/canonicals/.../schema unresolved
    ];
    const lines = captureStdout(() => { evaluate(actions, new Set(), CTX); });
    const entries = parseLines(lines);

    const blockedEntry = entries.find((e) => e['stage'] === 'guardrail:blocked');
    assert.ok(blockedEntry, 'expected at least one guardrail:blocked entry');
    assert.equal(blockedEntry['status'],  'skipped');
    assert.equal(blockedEntry['run_id'],  CTX.run_id);
    assert.equal(blockedEntry['command'], 'guardrail');

    const meta = blockedEntry['metadata'] as Record<string, unknown>;
    assert.equal(meta['idempotency_key'], 'kb1');
    assert.ok(Array.isArray(meta['blocked_by_categories']), 'blocked_by_categories must be an array');
  });

  it('writes guardrail:evaluated summary with correct allowed/blocked/deferred counts', () => {
    const actions = [
      action('ka1', 'errors'),                                     // allowed
      action('kb1', 'schema'),                                     // blocked
      action('kd1', 'errors', { confidence: 'preview_only' }),    // deferred
    ];
    const lines = captureStdout(() => { evaluate(actions, new Set(), CTX); });
    const entries = parseLines(lines);

    const summary = entries.find((e) => e['stage'] === 'guardrail:evaluated');
    assert.ok(summary, 'expected a guardrail:evaluated summary entry');
    assert.equal(summary['status'], 'ok');

    const meta = summary['metadata'] as Record<string, unknown>;
    assert.equal(meta['allowed'],  1);
    assert.equal(meta['blocked'],  1);
    assert.equal(meta['deferred'], 1);
    assert.equal(meta['total'],    3);
  });

  it('no ActionLog entries when logCtx is omitted', () => {
    const actions = [action('k1', 'errors')];
    const lines = captureStdout(() => { evaluate(actions, new Set()); }); // no CTX
    const entries = parseLines(lines);
    const guardrailEntries = entries.filter(
      (e) => typeof e['stage'] === 'string' && (e['stage'] as string).startsWith('guardrail:'),
    );
    assert.equal(guardrailEntries.length, 0, 'no ActionLog entries without logCtx');
  });
});

// ── Tests: PRIORITY_MAP ───────────────────────────────────────────────────────

describe('PRIORITY_MAP', () => {
  it('has exactly 8 categories', () => {
    assert.equal(Object.keys(PRIORITY_MAP).length, 8);
  });

  it('errors has the lowest priority number (highest importance = 1)', () => {
    const priorities = Object.values(PRIORITY_MAP);
    assert.equal(PRIORITY_MAP.errors, Math.min(...priorities));
    assert.equal(PRIORITY_MAP.errors, 1);
  });

  it('enhancements has the highest priority number (lowest importance = 8)', () => {
    const priorities = Object.values(PRIORITY_MAP);
    assert.equal(PRIORITY_MAP.enhancements, Math.max(...priorities));
    assert.equal(PRIORITY_MAP.enhancements, 8);
  });

  it('all priority numbers are unique (no ties)', () => {
    const priorities = Object.values(PRIORITY_MAP);
    assert.equal(
      new Set(priorities).size,
      priorities.length,
      'every category must have a distinct priority number',
    );
  });

  it('priority numbers are contiguous 1–8', () => {
    const priorities = Object.values(PRIORITY_MAP).sort((a, b) => a - b);
    for (let i = 0; i < priorities.length; i++) {
      assert.equal(priorities[i], i + 1, `expected priority ${i + 1} at index ${i}`);
    }
  });
});
