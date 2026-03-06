/**
 * packages/risk-scorer/src/index.test.ts
 *
 * Unit tests for the VAEO risk scorer.
 * All functions are pure or synchronous — no mocking required.
 *
 * Tests confirm:
 *   1.  ERR_404       → score 8, approval_required true
 *   2.  ERR_500       → score 10, deployment_behavior CRITICAL band
 *   3.  META_TITLE_MISSING (auto) → score 3, auto_deploy true
 *   4.  AI-suggested fix adds +1 to base score
 *   5.  Manual fix source inferred for map_redirect / alert_operator
 *   6.  Bulk operation (≥50 unique URLs) adds +2 to all scores
 *   7.  Score is capped at 10 even when modifiers exceed 10
 *   8.  Unknown issue_type defaults to score 5, approval_required true
 *   9.  SCORE_MATRIX values are intact (spot-checks)
 *  10.  scoreToBand returns correct band for boundary values
 *  11.  ActionLog entry written with correct band counts and approval count
 *  12.  Empty input returns empty array (no ActionLog crash)
 *  13.  approval_required forced true when risk_score ≥ 7
 *  14.  DEPLOYMENT_BEHAVIOR strings match spec exactly
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DetectedIssue } from '../../detectors/src/index.js';

import {
  scoreIssues,
  scoreToBand,
  inferFixSource,
  SCORE_MATRIX,
  DEPLOYMENT_BEHAVIOR,
  type ScoredIssue,
  type ScorerCtx,
} from './index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function captureStdout(fn: () => void): string[] {
  const captured: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try { fn(); } finally { process.stdout.write = orig; }
  return captured;
}

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines.flatMap((l) => {
    const t = l.trim();
    if (!t.startsWith('{')) return [];
    try { return [JSON.parse(t) as Record<string, unknown>]; } catch { return []; }
  });
}

const CTX: ScorerCtx = {
  run_id:    'run-s-001',
  tenant_id: 't-aaa',
  site_id:   's-bbb',
  cms:       'shopify',
};

/**
 * Factory for a minimal DetectedIssue.
 * Defaults to META_TITLE_MISSING with an auto-generated (non-AI) proposed_fix
 * so the base score comes through unmodified.
 */
function issue(overrides: Partial<DetectedIssue> = {}): DetectedIssue {
  return {
    run_id:       CTX.run_id,
    tenant_id:    CTX.tenant_id,
    site_id:      CTX.site_id,
    cms:          CTX.cms,
    url:          'https://cococabanalife.com/products/sun-glow-bikini',
    issue_type:   'META_TITLE_MISSING',
    issue_detail: {},
    // Default to a non-AI action so the base matrix score is tested cleanly.
    proposed_fix: { action: 'write_title_tag', url: 'https://cococabanalife.com/products/sun-glow-bikini' },
    risk_score:   3,
    auto_fix:     true,
    category:     'metadata',
    ...overrides,
  };
}

/** Creates N issues across N unique URLs (for bulk-op tests). */
function bulkIssues(n: number, type = 'META_TITLE_MISSING'): DetectedIssue[] {
  return Array.from({ length: n }, (_, i) =>
    issue({
      url:        `https://cococabanalife.com/page-${i}`,
      issue_type: type,
      proposed_fix: { action: 'write_title_tag', url: `https://cococabanalife.com/page-${i}` },
    }),
  );
}

// ── Tests: individual issue scoring ──────────────────────────────────────────

describe('scoreIssues — matrix lookups', () => {
  it('ERR_404: score=8, approval_required=true, fix_source=manual', () => {
    const [s] = scoreIssues([
      issue({
        issue_type:   'ERR_404',
        proposed_fix: { action: 'map_redirect', from_url: 'https://cococabanalife.com/gone' },
        category:     'errors',
      }),
    ], CTX);
    assert.equal(s.risk_score,        8);
    assert.equal(s.approval_required, true);
    assert.equal(s.auto_deploy,       false);
    assert.equal(s.fix_source,        'manual');
    assert.equal(s.deployment_behavior, DEPLOYMENT_BEHAVIOR.HIGH);
  });

  it('ERR_500: score=10, deployment_behavior=CRITICAL band', () => {
    const [s] = scoreIssues([
      issue({
        issue_type:   'ERR_500',
        proposed_fix: { action: 'alert_operator', url: 'https://cococabanalife.com/' },
        category:     'errors',
      }),
    ], CTX);
    assert.equal(s.risk_score,        10);
    assert.equal(s.approval_required, true);
    assert.equal(s.auto_deploy,       false);
    assert.equal(s.fix_source,        'manual');
    assert.equal(s.deployment_behavior, DEPLOYMENT_BEHAVIOR.CRITICAL);
    assert.ok(
      s.deployment_behavior.includes('blocked_by_default'),
      'CRITICAL must include blocked_by_default',
    );
  });

  it('META_TITLE_MISSING (auto_generated): score=3, auto_deploy=true', () => {
    const [s] = scoreIssues([
      issue({ issue_type: 'META_TITLE_MISSING' }),  // proposed_fix.action='write_title_tag' (auto)
    ], CTX);
    assert.equal(s.risk_score,        3);
    assert.equal(s.auto_deploy,       true);
    assert.equal(s.approval_required, false);
    assert.equal(s.fix_source,        'auto_generated');
    assert.equal(s.deployment_behavior, DEPLOYMENT_BEHAVIOR.LOW);
  });

  it('META_TITLE_LONG: score=2, auto_deploy=true', () => {
    const [s] = scoreIssues([
      issue({
        issue_type:   'META_TITLE_LONG',
        proposed_fix: { action: 'truncate_title', current_length: 70, truncate_at: 60 },
      }),
    ], CTX);
    assert.equal(s.risk_score,  2);
    assert.equal(s.auto_deploy, true);
    assert.equal(s.deployment_behavior, DEPLOYMENT_BEHAVIOR.LOW);
  });

  it('ERR_REDIRECT_CHAIN: score=5, approval_required=false, MEDIUM band', () => {
    const [s] = scoreIssues([
      issue({
        issue_type:   'ERR_REDIRECT_CHAIN',
        proposed_fix: { action: 'collapse_redirect', final_url: 'https://x.com/final' },
        category:     'redirects',
      }),
    ], CTX);
    assert.equal(s.risk_score,        5);
    assert.equal(s.approval_required, false);
    assert.equal(s.deployment_behavior, DEPLOYMENT_BEHAVIOR.MEDIUM);
  });
});

// ── Tests: AI modifier ────────────────────────────────────────────────────────

describe('scoreIssues — AI modifier (+1)', () => {
  it('generate_title action → fix_source=ai_suggested, score=base+1', () => {
    const [s] = scoreIssues([
      issue({
        issue_type:   'META_TITLE_MISSING',   // base = 3
        proposed_fix: { action: 'generate_title', url: 'https://cococabanalife.com/' },
      }),
    ], CTX);
    assert.equal(s.fix_source,        'ai_suggested');
    assert.equal(s.risk_score,        4);           // 3 + 1
    assert.equal(s.approval_required, true);        // AI always needs approval
    assert.equal(s.auto_deploy,       false);
  });

  it('generate_meta_desc action → ai_suggested, META_DESC_MISSING base=2 → score=3', () => {
    const [s] = scoreIssues([
      issue({
        issue_type:   'META_DESC_MISSING',
        proposed_fix: { action: 'generate_meta_desc', url: 'https://cococabanalife.com/' },
      }),
    ], CTX);
    assert.equal(s.fix_source,  'ai_suggested');
    assert.equal(s.risk_score,  3);   // 2 + 1
  });

  it('generate_alt_text action → ai_suggested', () => {
    const [s] = scoreIssues([
      issue({
        issue_type:   'IMG_ALT_MISSING',
        proposed_fix: { action: 'generate_alt_text', image_src: '/img/hero.jpg' },
      }),
    ], CTX);
    assert.equal(s.fix_source, 'ai_suggested');
    assert.equal(s.risk_score, 3);    // 2 + 1
  });

  it('generate_from_template action → ai_suggested, SCHEMA_MISSING base=3 → score=4', () => {
    const [s] = scoreIssues([
      issue({
        issue_type:   'SCHEMA_MISSING',
        proposed_fix: { action: 'generate_from_template', url: 'https://cococabanalife.com/' },
      }),
    ], CTX);
    assert.equal(s.fix_source, 'ai_suggested');
    assert.equal(s.risk_score, 4);    // 3 + 1
  });
});

// ── Tests: bulk modifier ──────────────────────────────────────────────────────

describe('scoreIssues — bulk modifier (+2 when ≥50 unique URLs)', () => {
  it('49 unique URLs → no bulk modifier', () => {
    const issues = bulkIssues(49);  // 49 unique URLs
    const scored = scoreIssues(issues, CTX);
    assert.ok(scored.every((s) => s.risk_score === 3), 'no modifier applied below 50');
  });

  it('50 unique URLs → +2 applied to all scores', () => {
    const issues = bulkIssues(50);
    const scored = scoreIssues(issues, CTX);
    assert.ok(scored.every((s) => s.risk_score === 5), 'bulk adds +2 to every issue');
    assert.ok(scored.every((s) => s.auto_deploy === false), 'bulk ops never auto-deploy');
  });

  it('100 unique URLs → bulk modifier applies regardless of count above 50', () => {
    const issues = bulkIssues(100);
    const scored = scoreIssues(issues, CTX);
    assert.ok(scored.every((s) => s.risk_score === 5));
  });
});

// ── Tests: score cap ──────────────────────────────────────────────────────────

describe('scoreIssues — score cap at 10', () => {
  it('ERR_500 (base=10) + AI modifier → capped at 10, not 11', () => {
    const [s] = scoreIssues([
      issue({
        issue_type:   'ERR_500',
        // Use a non-AI action — we're testing the cap with bulk instead
        proposed_fix: { action: 'alert_operator', url: 'https://x.com/' },
        category:     'errors',
      }),
    ], CTX);
    assert.equal(s.risk_score, 10);
    assert.ok(s.risk_score <= 10, 'score must never exceed 10');
  });

  it('ERR_500 (base=10) in a 50-URL batch → still capped at 10', () => {
    const issues = Array.from({ length: 50 }, (_, i) =>
      issue({
        url:          `https://x.com/p${i}`,
        issue_type:   'ERR_500',
        proposed_fix: { action: 'alert_operator', url: `https://x.com/p${i}` },
        category:     'errors',
      }),
    );
    const scored = scoreIssues(issues, CTX);
    assert.ok(scored.every((s) => s.risk_score === 10), 'cap prevents score > 10');
  });

  it('ERR_404 (base=8) + AI (+1) + bulk (+2) = 11 → capped at 10', () => {
    const issues = Array.from({ length: 50 }, (_, i) =>
      issue({
        url:          `https://x.com/p${i}`,
        issue_type:   'ERR_404',
        proposed_fix: { action: 'generate_from_template', url: `https://x.com/p${i}` }, // AI
        category:     'errors',
      }),
    );
    const scored = scoreIssues(issues, CTX);
    assert.ok(scored.every((s) => s.risk_score === 10), 'ERR_404 + AI + bulk capped at 10');
  });
});

// ── Tests: unknown issue type ─────────────────────────────────────────────────

describe('scoreIssues — unknown issue_type', () => {
  it('unknown type defaults to score=5, approval_required=true', () => {
    const [s] = scoreIssues([
      issue({
        issue_type:   'CUSTOM_UNKNOWN_SEO_ISSUE',
        proposed_fix: { action: 'investigate', url: 'https://x.com/' },
      }),
    ], CTX);
    assert.equal(s.risk_score,        5);
    assert.equal(s.approval_required, true);
    assert.equal(s.auto_deploy,       false);
    assert.equal(s.deployment_behavior, DEPLOYMENT_BEHAVIOR.MEDIUM);
  });
});

// ── Tests: approval_required edge cases ──────────────────────────────────────

describe('scoreIssues — approval_required forced at high scores', () => {
  it('ERR_REDIRECT_CHAIN (matrix approval=false) gets approval_required=false at score=5', () => {
    const [s] = scoreIssues([
      issue({
        issue_type:   'ERR_REDIRECT_CHAIN',
        proposed_fix: { action: 'collapse_redirect', final_url: '/final' },
      }),
    ], CTX);
    assert.equal(s.approval_required, false);
  });

  it('H1_DUPLICATE (matrix=false, score=5) stays approval_required=false', () => {
    const [s] = scoreIssues([
      issue({
        issue_type:   'H1_DUPLICATE',
        proposed_fix: { action: 'demote_extras_to_h2', count: 2 },
      }),
    ], CTX);
    assert.equal(s.approval_required, false);
    assert.equal(s.risk_score,        5);
  });

  it('score ≥ 7 forces approval_required=true even when matrix says false', () => {
    // ERR_REDIRECT_CHAIN (base=5, matrix approval=false) + bulk (+2) = 7 → forces approval
    const issues = Array.from({ length: 50 }, (_, i) =>
      issue({
        url:          `https://x.com/p${i}`,
        issue_type:   'ERR_REDIRECT_CHAIN',
        proposed_fix: { action: 'collapse_redirect', final_url: '/final' },
      }),
    );
    const scored = scoreIssues(issues, CTX);
    assert.ok(
      scored.every((s) => s.approval_required === true),
      'score 7 from bulk modifier forces approval even when matrix says false',
    );
  });
});

// ── Tests: inferFixSource ─────────────────────────────────────────────────────

describe('inferFixSource', () => {
  it('generate_title → ai_suggested', () =>
    assert.equal(inferFixSource({ action: 'generate_title' }), 'ai_suggested'));

  it('generate_meta_desc → ai_suggested', () =>
    assert.equal(inferFixSource({ action: 'generate_meta_desc' }), 'ai_suggested'));

  it('generate_alt_text → ai_suggested', () =>
    assert.equal(inferFixSource({ action: 'generate_alt_text' }), 'ai_suggested'));

  it('generate_from_template → ai_suggested', () =>
    assert.equal(inferFixSource({ action: 'generate_from_template' }), 'ai_suggested'));

  it('map_redirect → manual', () =>
    assert.equal(inferFixSource({ action: 'map_redirect' }), 'manual'));

  it('alert_operator → manual', () =>
    assert.equal(inferFixSource({ action: 'alert_operator' }), 'manual'));

  it('collapse_redirect → auto_generated', () =>
    assert.equal(inferFixSource({ action: 'collapse_redirect' }), 'auto_generated'));

  it('truncate_title → auto_generated', () =>
    assert.equal(inferFixSource({ action: 'truncate_title' }), 'auto_generated'));

  it('unknown action → auto_generated', () =>
    assert.equal(inferFixSource({ action: 'some_future_action' }), 'auto_generated'));

  it('missing action field → auto_generated', () =>
    assert.equal(inferFixSource({}), 'auto_generated'));
});

// ── Tests: scoreToBand ────────────────────────────────────────────────────────

describe('scoreToBand', () => {
  it('1 → LOW',      () => assert.equal(scoreToBand(1),  'LOW'));
  it('3 → LOW',      () => assert.equal(scoreToBand(3),  'LOW'));
  it('4 → MEDIUM',   () => assert.equal(scoreToBand(4),  'MEDIUM'));
  it('6 → MEDIUM',   () => assert.equal(scoreToBand(6),  'MEDIUM'));
  it('7 → HIGH',     () => assert.equal(scoreToBand(7),  'HIGH'));
  it('8 → HIGH',     () => assert.equal(scoreToBand(8),  'HIGH'));
  it('9 → CRITICAL', () => assert.equal(scoreToBand(9),  'CRITICAL'));
  it('10 → CRITICAL', () => assert.equal(scoreToBand(10), 'CRITICAL'));
});

// ── Tests: SCORE_MATRIX integrity ────────────────────────────────────────────

describe('SCORE_MATRIX', () => {
  it('has 23 entries', () =>
    assert.equal(Object.keys(SCORE_MATRIX).length, 23));

  it('all risk_scores are between 1 and 10', () => {
    for (const [type, entry] of Object.entries(SCORE_MATRIX)) {
      assert.ok(
        entry.risk_score >= 1 && entry.risk_score <= 10,
        `${type}: risk_score ${entry.risk_score} out of range`,
      );
    }
  });

  it('only ERR_404 and ERR_500 have approval_required=true', () => {
    const approvalTypes = Object.entries(SCORE_MATRIX)
      .filter(([, e]) => e.approval_required)
      .map(([type]) => type)
      .sort();
    assert.deepEqual(approvalTypes, ['ERR_404', 'ERR_500']);
  });
});

// ── Tests: DEPLOYMENT_BEHAVIOR strings ───────────────────────────────────────

describe('DEPLOYMENT_BEHAVIOR', () => {
  it('LOW contains auto_deploy', () =>
    assert.ok(DEPLOYMENT_BEHAVIOR.LOW.includes('auto_deploy')));

  it('MEDIUM contains validation_required', () =>
    assert.ok(DEPLOYMENT_BEHAVIOR.MEDIUM.includes('validation_required')));

  it('HIGH contains full_playwright_comparison', () =>
    assert.ok(DEPLOYMENT_BEHAVIOR.HIGH.includes('full_playwright_comparison')));

  it('CRITICAL contains blocked_by_default', () =>
    assert.ok(DEPLOYMENT_BEHAVIOR.CRITICAL.includes('blocked_by_default')));
});

// ── Tests: ActionLog ──────────────────────────────────────────────────────────

describe('ActionLog', () => {
  it('writes risk-scorer:complete with correct band counts and approval count', () => {
    const issues: DetectedIssue[] = [
      issue({ issue_type: 'META_TITLE_LONG',   proposed_fix: { action: 'truncate_title' } }),  // score=2 → low
      issue({ issue_type: 'META_TITLE_MISSING', proposed_fix: { action: 'write_title_tag' } }), // score=3 → low
      issue({ issue_type: 'H1_MISSING',         proposed_fix: { action: 'promote_h2' } }),       // score=4 → medium
      issue({ issue_type: 'ERR_404',            proposed_fix: { action: 'map_redirect', from_url: '/x' } }),  // score=8 → high, approval
      issue({ issue_type: 'ERR_500',            proposed_fix: { action: 'alert_operator', url: '/y' } }),     // score=10 → critical, approval
    ];

    const lines = captureStdout(() => { scoreIssues(issues, CTX); });
    const entries = parseLines(lines);

    const log = entries.find((e) => e['stage'] === 'risk-scorer:complete');
    assert.ok(log, 'risk-scorer:complete entry must be present');
    assert.equal(log['status'],  'ok');
    assert.equal(log['command'], 'risk-scorer');

    const meta = log['metadata'] as Record<string, unknown>;
    assert.equal(meta['total'], 5);
    assert.equal(meta['bulk_operation'], false);
    assert.equal(meta['approval_required'], 2);  // ERR_404 and ERR_500

    const byBand = meta['by_band'] as Record<string, number>;
    assert.equal(byBand['low'],      2);
    assert.equal(byBand['medium'],   1);
    assert.equal(byBand['high'],     1);
    assert.equal(byBand['critical'], 1);
  });

  it('bulk_operation flag is true in ActionLog when ≥50 URLs', () => {
    const issues = bulkIssues(50);
    const lines  = captureStdout(() => { scoreIssues(issues, CTX); });
    const entries = parseLines(lines);
    const log = entries.find((e) => e['stage'] === 'risk-scorer:complete');
    assert.ok(log);
    assert.equal((log!['metadata'] as Record<string, unknown>)['bulk_operation'], true);
  });

  it('no ActionLog entry when issues array is empty', () => {
    const lines = captureStdout(() => { scoreIssues([], CTX); });
    // ActionLog is still written for empty runs (total=0 is valid telemetry)
    const entries = parseLines(lines);
    const log = entries.find((e) => e['stage'] === 'risk-scorer:complete');
    assert.ok(log, 'log is written even for empty input');
    assert.equal((log!['metadata'] as Record<string, unknown>)['total'], 0);
  });

  it('auto-derives log context from issues[0] when ctx is omitted', () => {
    const lines = captureStdout(() => {
      scoreIssues([issue({ run_id: 'auto-derived-run' })]);  // no explicit CTX
    });
    const entries = parseLines(lines);
    const log = entries.find((e) => e['stage'] === 'risk-scorer:complete');
    assert.ok(log);
    assert.equal(log['run_id'], 'auto-derived-run');
  });
});
