/**
 * packages/commands/src/audit.test.ts
 *
 * Tests for runAudit.
 * All external deps (Supabase, detectors, risk-scorer, guardrail) are injected.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runAudit,
  type AuditRequest,
  type AuditCommandOps,
  type ActionQueueRow,
} from './audit.js';

import type { CrawlResultRow, DetectedIssue, DetectorCtx } from '../../detectors/src/index.js';
import type { ScoredIssue } from '../../risk-scorer/src/index.js';
import type { ProposedAction } from '../../guardrail/src/index.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RUN_ID    = 'run-uuid-001';
const TENANT_ID = 'tenant-uuid-001';
const SITE_ID   = 'site-uuid-001';

function baseReq(overrides: Partial<AuditRequest> = {}): AuditRequest {
  return {
    run_id:    RUN_ID,
    tenant_id: TENANT_ID,
    site_id:   SITE_ID,
    cms:       'shopify',
    ...overrides,
  };
}

function makeCrawlRow(url = 'https://example.com/'): CrawlResultRow {
  return {
    url,
    status_code:    200,
    title:          null,        // missing title → will trigger META_TITLE_MISSING
    meta_desc:      null,
    h1:             [],
    h2:             [],
    images:         null,
    internal_links: null,
    schema_blocks:  null,
    canonical:      null,
    redirect_chain: null,
    load_time_ms:   null,
    robots_meta:    null,
  };
}

function makeDetectedIssue(overrides: Partial<DetectedIssue> = {}): DetectedIssue {
  return {
    run_id:       RUN_ID,
    tenant_id:    TENANT_ID,
    site_id:      SITE_ID,
    cms:          'shopify',
    url:          'https://example.com/',
    issue_type:   'META_TITLE_MISSING',
    issue_detail: { title: null },
    proposed_fix: { action: 'generate_title' },
    risk_score:   3,
    auto_fix:     true,
    category:     'metadata',
    ...overrides,
  };
}

function makeScoredIssue(overrides: Partial<ScoredIssue> = {}): ScoredIssue {
  return {
    ...makeDetectedIssue(),
    risk_score:          3,
    approval_required:   false,
    auto_deploy:         true,
    fix_source:          'auto_generated',
    deployment_behavior: 'auto_deploy — no approval needed',
    ...overrides,
  };
}

function makeProposedAction(overrides: Partial<ProposedAction> = {}): ProposedAction {
  return {
    idempotency_key: 'run-uuid-001:https://example.com/:META_TITLE_MISSING:0',
    category:        'content',
    patch_type:      'meta_patch',
    url:             'https://example.com/',
    ...overrides,
  };
}

/** Happy-path ops. Returns 1 crawl row → 1 detected issue → 1 scored → 1 action. */
function happy(overrides: Partial<AuditCommandOps> = {}): Partial<AuditCommandOps> {
  return {
    loadCrawlRows: async () => [makeCrawlRow()],
    detectIssues:  (_rows: CrawlResultRow[], _ctx: DetectorCtx) => [makeDetectedIssue()],
    scoreIssues:   (_issues: DetectedIssue[]) => [makeScoredIssue()],
    evaluateOrder: (_scored: ScoredIssue[]) => [makeProposedAction()],
    writeQueue:    async (_rows: ActionQueueRow[]) => _rows.length,
    ...overrides,
  };
}

/** Capture all JSON log lines written to stdout during fn(). */
async function captureLog(fn: () => Promise<void>): Promise<Record<string, unknown>[]> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // @ts-expect-error — test-only stdout capture
  process.stdout.write = (chunk: unknown): boolean => { chunks.push(String(chunk)); return true; };
  try {
    await fn();
  } finally {
    process.stdout.write = orig;
  }
  return chunks
    .join('')
    .split('\n')
    .filter((l) => l.trim().startsWith('{'))
    .map((l) => JSON.parse(l.trim()) as Record<string, unknown>);
}

// ── runAudit — happy path ─────────────────────────────────────────────────────

describe('runAudit — happy path returns status=completed', () => {
  it('returns status=completed with correct fields', async () => {
    const result = await runAudit(baseReq(), happy());
    assert.equal(result.status,                'completed');
    assert.equal(result.run_id,                RUN_ID);
    assert.equal(result.site_id,               SITE_ID);
    assert.equal(result.tenant_id,             TENANT_ID);
    assert.equal(result.issues_found,          1);
    assert.equal(result.action_queue_populated, true);
    assert.equal(result.error,                 undefined);
  });

  it('issues_by_priority has all 8 keys', async () => {
    const result = await runAudit(baseReq(), happy());
    for (let p = 1; p <= 8; p++) {
      assert.ok(p in result.issues_by_priority, `Missing priority key ${p}`);
    }
  });

  it('content issues land in priority 5', async () => {
    const result = await runAudit(baseReq(), happy());
    // metadata → content → priority 5
    assert.equal(result.issues_by_priority[5], 1);
  });

  it('completed_at is a valid ISO timestamp', async () => {
    const result = await runAudit(baseReq(), happy());
    assert.ok(!isNaN(Date.parse(result.completed_at)));
  });
});

// ── runAudit — priority mapping ───────────────────────────────────────────────

describe('runAudit — detector category → guardrail priority mapping', () => {
  it('metadata → content (priority 5)', async () => {
    const result = await runAudit(baseReq(), happy({
      detectIssues: () => [makeDetectedIssue({ category: 'metadata' })],
      scoreIssues:  () => [makeScoredIssue({ category: 'metadata' })],
    }));
    assert.equal(result.issues_by_priority[5], 1);
  });

  it('images → enhancements (priority 8)', async () => {
    const result = await runAudit(baseReq(), happy({
      detectIssues: () => [makeDetectedIssue({ category: 'images', issue_type: 'IMG_ALT_MISSING' })],
      scoreIssues:  () => [makeScoredIssue({ category: 'images', issue_type: 'IMG_ALT_MISSING' })],
    }));
    assert.equal(result.issues_by_priority[8], 1);
  });

  it('errors → errors (priority 1)', async () => {
    const result = await runAudit(baseReq(), happy({
      detectIssues: () => [makeDetectedIssue({ category: 'errors', issue_type: 'ERR_404', risk_score: 8 })],
      scoreIssues:  () => [makeScoredIssue({ category: 'errors', issue_type: 'ERR_404', risk_score: 8 })],
    }));
    assert.equal(result.issues_by_priority[1], 1);
  });

  it('schema → schema (priority 6)', async () => {
    const result = await runAudit(baseReq(), happy({
      detectIssues: () => [makeDetectedIssue({ category: 'schema', issue_type: 'SCHEMA_MISSING' })],
      scoreIssues:  () => [makeScoredIssue({ category: 'schema', issue_type: 'SCHEMA_MISSING' })],
    }));
    assert.equal(result.issues_by_priority[6], 1);
  });

  it('multi-category: 4 issues spread across priorities, totals match', async () => {
    const issues = [
      makeScoredIssue({ category: 'errors',    issue_type: 'ERR_404',            risk_score: 8 }),
      makeScoredIssue({ category: 'canonicals', issue_type: 'CANONICAL_MISSING', risk_score: 6 }),
      makeScoredIssue({ category: 'metadata',  issue_type: 'META_TITLE_MISSING', risk_score: 3 }),
      makeScoredIssue({ category: 'images',    issue_type: 'IMG_ALT_MISSING',    risk_score: 2 }),
    ];
    const result = await runAudit(baseReq(), happy({
      detectIssues: () => issues.map(i => i as unknown as DetectedIssue),
      scoreIssues:  () => issues,
    }));
    assert.equal(result.issues_found, 4);
    assert.equal(result.issues_by_priority[1], 1); // errors
    assert.equal(result.issues_by_priority[3], 1); // canonicals
    assert.equal(result.issues_by_priority[5], 1); // metadata → content
    assert.equal(result.issues_by_priority[8], 1); // images → enhancements
    // Total across all priorities
    const total = Object.values(result.issues_by_priority).reduce((a, b) => a + b, 0);
    assert.equal(total, 4);
  });
});

// ── runAudit — queue rows ─────────────────────────────────────────────────────

describe('runAudit — action_queue rows have correct shape', () => {
  it('writeQueue is called with correct fields', async () => {
    let capturedRows: ActionQueueRow[] = [];
    await runAudit(baseReq(), happy({
      writeQueue: async (rows) => { capturedRows = rows; return rows.length; },
    }));
    assert.equal(capturedRows.length, 1);
    const row = capturedRows[0]!;
    assert.equal(row.run_id,           RUN_ID);
    assert.equal(row.tenant_id,        TENANT_ID);
    assert.equal(row.site_id,          SITE_ID);
    assert.equal(row.cms_type,         'shopify');
    assert.equal(row.execution_status, 'queued');
    assert.equal(typeof row.risk_score, 'number');
    assert.equal(typeof row.priority,   'number');
    assert.ok(row.priority >= 1 && row.priority <= 8);
    // category and auto_deploy live inside proposed_fix JSONB
    const fix = row.proposed_fix;
    assert.ok(['errors','redirects','canonicals','indexing','content','schema','performance','enhancements'].includes(String(fix['category'])));
  });

  it('action_queue_populated=false when no issues found', async () => {
    const result = await runAudit(baseReq(), happy({
      detectIssues: () => [],
      scoreIssues:  () => [],
      evaluateOrder: () => [],
      writeQueue:   async () => { throw new Error('should not be called'); },
    }));
    assert.equal(result.action_queue_populated, false);
    assert.equal(result.issues_found,           0);
    assert.equal(result.status,                 'completed');
  });

  it('rows are sorted by priority ascending, then risk_score descending', async () => {
    let capturedRows: ActionQueueRow[] = [];
    const issues: ScoredIssue[] = [
      makeScoredIssue({ category: 'metadata', issue_type: 'META_TITLE_MISSING', risk_score: 2 }),
      makeScoredIssue({ category: 'errors',   issue_type: 'ERR_404',            risk_score: 8 }),
      makeScoredIssue({ category: 'metadata', issue_type: 'META_DESC_MISSING',  risk_score: 3 }),
    ];
    await runAudit(baseReq(), happy({
      detectIssues: () => issues as unknown as DetectedIssue[],
      scoreIssues:  () => issues,
      writeQueue:   async (rows) => { capturedRows = rows; return rows.length; },
    }));
    // errors (P1) first, then metadata (P5) sorted by risk_score desc
    assert.equal(capturedRows[0]!.priority,    1);
    assert.equal(capturedRows[1]!.priority,    5);
    assert.equal(capturedRows[2]!.priority,    5);
    assert.ok(capturedRows[1]!.risk_score >= capturedRows[2]!.risk_score);
  });
});

// ── runAudit — validation failures ───────────────────────────────────────────

describe('runAudit — validation failures return status=failed without throwing', () => {
  it('returns status=failed when run_id is empty', async () => {
    const result = await runAudit({ ...baseReq(), run_id: '' }, happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('run_id'));
  });

  it('returns status=failed when tenant_id is empty', async () => {
    const result = await runAudit({ ...baseReq(), tenant_id: '' }, happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('tenant_id'));
  });

  it('returns status=failed when site_id is empty', async () => {
    const result = await runAudit({ ...baseReq(), site_id: '' }, happy());
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('site_id'));
  });

  it('does not throw when run_id is empty', async () => {
    await assert.doesNotReject(() => runAudit({ ...baseReq(), run_id: '' }, happy()));
  });

  it('returns status=failed when no crawl rows found', async () => {
    const result = await runAudit(baseReq(), happy({
      loadCrawlRows: async () => [],
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('No crawl_results'));
  });
});

// ── runAudit — failure cases ──────────────────────────────────────────────────

describe('runAudit — error handling never throws', () => {
  it('returns status=failed when loadCrawlRows throws', async () => {
    const result = await runAudit(baseReq(), happy({
      loadCrawlRows: async () => { throw new Error('Supabase connection refused'); },
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('Supabase connection refused'));
  });

  it('does not throw when loadCrawlRows throws', async () => {
    await assert.doesNotReject(() =>
      runAudit(baseReq(), happy({
        loadCrawlRows: async () => { throw new Error('timeout'); },
      })),
    );
  });

  it('returns status=failed when detectIssues throws', async () => {
    const result = await runAudit(baseReq(), happy({
      detectIssues: () => { throw new Error('detector crash'); },
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('detector crash'));
  });

  it('returns status=failed when writeQueue throws', async () => {
    const result = await runAudit(baseReq(), happy({
      writeQueue: async () => { throw new Error('action_queue insert failed'); },
    }));
    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('action_queue insert failed'));
  });

  it('does not throw when writeQueue throws', async () => {
    await assert.doesNotReject(() =>
      runAudit(baseReq(), happy({
        writeQueue: async () => { throw new Error('db error'); },
      })),
    );
  });
});

// ── runAudit — ActionLog entries ──────────────────────────────────────────────

describe('runAudit — ActionLog entries', () => {
  it('writes audit:start before audit:complete', async () => {
    const entries = await captureLog(() => runAudit(baseReq(), happy()));
    const startIdx    = entries.findIndex((e) => e['stage'] === 'audit:start');
    const completeIdx = entries.findIndex((e) => e['stage'] === 'audit:complete');
    assert.ok(startIdx    >= 0, 'audit:start not found');
    assert.ok(completeIdx >= 0, 'audit:complete not found');
    assert.ok(startIdx < completeIdx, 'audit:start must precede audit:complete');
  });

  it('audit:start has status=pending', async () => {
    const entries = await captureLog(() => runAudit(baseReq(), happy()));
    const start = entries.find((e) => e['stage'] === 'audit:start');
    assert.ok(start, 'Expected audit:start');
    assert.equal(start['status'], 'pending');
  });

  it('audit:complete has status=ok and issues_found in metadata', async () => {
    const entries = await captureLog(() => runAudit(baseReq(), happy()));
    const complete = entries.find((e) => e['stage'] === 'audit:complete');
    assert.ok(complete, 'Expected audit:complete');
    assert.equal(complete['status'], 'ok');
    const meta = complete['metadata'] as Record<string, unknown>;
    assert.equal(typeof meta['issues_found'], 'number');
  });

  it('writes audit:failed (not audit:complete) when detectIssues throws', async () => {
    const entries = await captureLog(() =>
      runAudit(baseReq(), happy({
        detectIssues: () => { throw new Error('crash'); },
      })),
    );
    const failed   = entries.find((e) => e['stage'] === 'audit:failed');
    const complete = entries.find((e) => e['stage'] === 'audit:complete');
    assert.ok(failed, 'Expected audit:failed entry');
    assert.equal(failed['status'], 'failed');
    assert.equal(complete, undefined, 'audit:complete must NOT appear when detectIssues throws');
  });
});

// ── runAudit — issues_by_priority shape ──────────────────────────────────────

describe('runAudit — issues_by_priority is always a complete 1-8 map', () => {
  it('all priority keys present even with zero issues', async () => {
    const result = await runAudit(baseReq(), happy({
      detectIssues:  () => [],
      scoreIssues:   () => [],
      evaluateOrder: () => [],
      writeQueue:    async () => 0,
    }));
    for (let p = 1; p <= 8; p++) {
      assert.ok(p in result.issues_by_priority, `Missing key ${p}`);
      assert.equal(result.issues_by_priority[p], 0);
    }
  });

  it('all required result fields are present', async () => {
    const result = await runAudit(baseReq(), happy());
    assert.equal(typeof result.run_id,                 'string');
    assert.equal(typeof result.site_id,                'string');
    assert.equal(typeof result.tenant_id,              'string');
    assert.equal(typeof result.issues_found,           'number');
    assert.equal(typeof result.action_queue_populated, 'boolean');
    assert.equal(typeof result.completed_at,           'string');
    assert.ok(['completed', 'failed'].includes(result.status));
  });
});

// ── runAudit — IMG_DIMENSIONS_MISSING proposed_fix enrichment ─────────────────

describe('runAudit — IMG_DIMENSIONS_MISSING proposed_fix enrichment', () => {
  function makeImgDimsIssue(overrides: {
    proposedFix?: Record<string, unknown>;
    issueDetail?: Record<string, unknown>;
  } = {}): ScoredIssue {
    return makeScoredIssue({
      issue_type:   'IMG_DIMENSIONS_MISSING',
      category:     'images',
      risk_score:   2,
      auto_deploy:  true,
      approval_required: false,
      issue_detail: { image_src: 'https://cdn.example.com/img.jpg', width: null, height: null, ...overrides.issueDetail },
      proposed_fix: { action: 'inject_dimensions_from_metadata', image_src: 'https://cdn.example.com/img.jpg', ...overrides.proposedFix },
    });
  }

  it('sets fix_source=manual and approval_required=true when product_id/image_id absent', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeImgDimsIssue();
    await runAudit(baseReq(), happy({
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    const row = captured[0]!;
    assert.equal(row.proposed_fix['fix_source'], 'manual');
    assert.equal(row.approval_required, true);
    // product_id and image_id must not be present
    assert.equal(row.proposed_fix['product_id'], undefined);
    assert.equal(row.proposed_fix['image_id'],   undefined);
  });

  it('includes new_width and new_height from issue_detail when available', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeImgDimsIssue({ issueDetail: { width: '800', height: '600', image_src: 'img.jpg' } });
    await runAudit(baseReq(), happy({
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    const row = captured[0]!;
    assert.equal(row.proposed_fix['new_width'],  '800');
    assert.equal(row.proposed_fix['new_height'], '600');
  });

  it('includes new_width/new_height=null when crawl had no dimension data', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeImgDimsIssue();
    await runAudit(baseReq(), happy({
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    const row = captured[0]!;
    assert.equal(row.proposed_fix['new_width'],  null);
    assert.equal(row.proposed_fix['new_height'], null);
  });

  it('includes product_id and image_id when present in proposed_fix', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeImgDimsIssue({
      proposedFix: {
        action:     'inject_dimensions_from_metadata',
        image_src:  'img.jpg',
        product_id: '987654321',
        image_id:   '111222333',
        new_width:  '1200',
        new_height: '800',
      },
    });
    await runAudit(baseReq(), happy({
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    const row = captured[0]!;
    assert.equal(row.proposed_fix['product_id'], '987654321');
    assert.equal(row.proposed_fix['image_id'],   '111222333');
    assert.equal(row.proposed_fix['new_width'],  '1200');
    assert.equal(row.proposed_fix['new_height'], '800');
    // fix_source='manual' must NOT appear when IDs are present
    assert.equal(row.proposed_fix['fix_source'], undefined);
  });

  it('does not mutate proposed_fix for non-image issue types', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeScoredIssue({ issue_type: 'META_TITLE_MISSING', proposed_fix: { action: 'generate_title' } });
    await runAudit(baseReq(), happy({
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    const row = captured[0]!;
    assert.equal(row.proposed_fix['fix_source'], undefined);
    assert.equal(row.proposed_fix['product_id'], undefined);
  });
});

// ── runAudit — extended protected paths ───────────────────────────────────────

describe('runAudit — extended protected paths (/customer_authentication)', () => {
  function makeIssueAt(url: string): ScoredIssue {
    return makeScoredIssue({ url, issue_type: 'META_TITLE_MISSING' });
  }

  it('filters /customer_authentication URLs', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeIssueAt('https://example.com/customer_authentication');
    await runAudit(baseReq(), happy({
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    assert.equal(captured.length, 0, 'Expected no rows — /customer_authentication is protected');
  });

  it('filters /customer_authentication/redirect URLs', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeIssueAt('https://example.com/customer_authentication/redirect?locale=en');
    await runAudit(baseReq(), happy({
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    assert.equal(captured.length, 0, 'Expected no rows — /customer_authentication/redirect is protected');
  });

  it('filters /customer_authentication/* subpaths', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeIssueAt('https://example.com/customer_authentication/login_multipass/some_token');
    await runAudit(baseReq(), happy({
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    assert.equal(captured.length, 0, 'Expected no rows — /customer_authentication/* is protected');
  });

  it('does not filter legitimate pages that share a prefix', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeIssueAt('https://example.com/pages/about-us');
    await runAudit(baseReq(), happy({
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    assert.equal(captured.length, 1, 'Expected /pages/about-us to pass through');
  });
});

// ── runAudit — WordPress system paths ────────────────────────────────────────

describe('runAudit — WordPress system paths are filtered', () => {
  function makeIssueAt(url: string): ScoredIssue {
    return makeScoredIssue({ url, issue_type: 'META_TITLE_MISSING' });
  }

  it('filters /wp-admin URLs', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeIssueAt('https://example.com/wp-admin/options.php');
    await runAudit(baseReq(), happy({
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    assert.equal(captured.length, 0, 'Expected no rows — /wp-admin is protected');
  });

  it('filters /wp-login.php URLs', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeIssueAt('https://example.com/wp-login.php');
    await runAudit(baseReq(), happy({
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    assert.equal(captured.length, 0, 'Expected no rows — /wp-login.php is protected');
  });

  it('filters /wp-json base path (exact match only)', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeIssueAt('https://example.com/wp-json');
    await runAudit(baseReq(), happy({
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    assert.equal(captured.length, 0, 'Expected no rows — /wp-json base is protected');
  });

  it('does NOT filter /wp-json subpaths (base only per spec)', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeIssueAt('https://example.com/wp-json/wp/v2/posts');
    await runAudit(baseReq(), happy({
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    assert.equal(captured.length, 1, 'Expected /wp-json subpaths to pass through');
  });

  it('filters /?feed= query param URLs', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeIssueAt('https://example.com/?feed=rss2');
    await runAudit(baseReq(), happy({
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    assert.equal(captured.length, 0, 'Expected no rows — /?feed= is protected');
  });
});

// ── runAudit — noindex filter ─────────────────────────────────────────────────

describe('runAudit — noindex filter excludes pages with robots_meta=noindex', () => {
  const NOINDEX_URL = 'https://example.com/thank-you';

  it('excludes issues whose URL has robots_meta containing "noindex"', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeScoredIssue({ url: NOINDEX_URL, issue_type: 'META_TITLE_MISSING' });
    await runAudit(baseReq(), happy({
      loadCrawlRows: async () => [{ ...makeCrawlRow(NOINDEX_URL), robots_meta: 'noindex,nofollow' }],
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    assert.equal(captured.length, 0, 'Expected no rows — URL is noindexed');
  });

  it('passes through issues on indexable pages (robots_meta=null)', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeScoredIssue({ url: NOINDEX_URL, issue_type: 'META_TITLE_MISSING' });
    await runAudit(baseReq(), happy({
      loadCrawlRows: async () => [{ ...makeCrawlRow(NOINDEX_URL), robots_meta: null }],
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    assert.equal(captured.length, 1, 'Expected row to pass through — robots_meta=null means indexable');
  });

  it('passes through issues when robots_meta does not contain noindex', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeScoredIssue({ url: NOINDEX_URL, issue_type: 'META_TITLE_MISSING' });
    await runAudit(baseReq(), happy({
      loadCrawlRows: async () => [{ ...makeCrawlRow(NOINDEX_URL), robots_meta: 'index,follow' }],
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    assert.equal(captured.length, 1, 'Expected row to pass through — robots_meta=index,follow is indexable');
  });

  it('is case-insensitive for noindex check', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeScoredIssue({ url: NOINDEX_URL, issue_type: 'META_TITLE_MISSING' });
    await runAudit(baseReq(), happy({
      loadCrawlRows: async () => [{ ...makeCrawlRow(NOINDEX_URL), robots_meta: 'NOINDEX,FOLLOW' }],
      detectIssues:  () => [issue as unknown as DetectedIssue],
      scoreIssues:   () => [issue],
      writeQueue:    async (rows) => { captured = rows; return rows.length; },
    }));
    assert.equal(captured.length, 0, 'Expected no rows — NOINDEX is case-insensitive match');
  });
});

// ── runAudit — GSC keyword enrichment ─────────────────────────────────────────

describe('runAudit — GSC keyword enrichment via fetchTopKeywords', () => {
  const MOCK_KEYWORDS = [
    { query: 'returns policy', impressions: 220, position: 4.2 },
    { query: 'return items',   impressions: 150, position: 6.1 },
    { query: 'refund request', impressions:  80, position: 9.3 },
  ];

  it('stores top_keywords in proposed_fix for META_TITLE_MISSING', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeScoredIssue({ issue_type: 'META_TITLE_MISSING' });
    await runAudit(baseReq(), happy({
      detectIssues:      () => [issue as unknown as DetectedIssue],
      scoreIssues:       () => [issue],
      fetchTopKeywords:  async () => MOCK_KEYWORDS,
      writeQueue:        async (rows) => { captured = rows; return rows.length; },
    }));
    const fix = captured[0]!.proposed_fix;
    assert.deepEqual(fix['top_keywords'], MOCK_KEYWORDS, 'top_keywords should be stored in proposed_fix');
  });

  it('stores top_keywords in proposed_fix for META_DESC_MISSING', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeScoredIssue({ issue_type: 'META_DESC_MISSING', category: 'metadata' });
    await runAudit(baseReq(), happy({
      detectIssues:      () => [issue as unknown as DetectedIssue],
      scoreIssues:       () => [issue],
      fetchTopKeywords:  async () => MOCK_KEYWORDS,
      writeQueue:        async (rows) => { captured = rows; return rows.length; },
    }));
    const fix = captured[0]!.proposed_fix;
    assert.deepEqual(fix['top_keywords'], MOCK_KEYWORDS);
  });

  it('does NOT call fetchTopKeywords for IMG_ALT_MISSING', async () => {
    let fetchCalled = false;
    const issue = makeScoredIssue({ issue_type: 'IMG_ALT_MISSING', category: 'images' });
    await runAudit(baseReq(), happy({
      detectIssues:      () => [issue as unknown as DetectedIssue],
      scoreIssues:       () => [issue],
      fetchTopKeywords:  async () => { fetchCalled = true; return []; },
      writeQueue:        async (rows) => rows.length,
    }));
    assert.equal(fetchCalled, false, 'fetchTopKeywords should not be called for IMG_ALT_MISSING');
  });

  it('stores empty array when fetchTopKeywords returns []', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeScoredIssue({ issue_type: 'META_TITLE_MISSING' });
    await runAudit(baseReq(), happy({
      detectIssues:      () => [issue as unknown as DetectedIssue],
      scoreIssues:       () => [issue],
      fetchTopKeywords:  async () => [],
      writeQueue:        async (rows) => { captured = rows; return rows.length; },
    }));
    assert.deepEqual(captured[0]!.proposed_fix['top_keywords'], []);
  });

  it('proceeds without top_keywords when fetchTopKeywords is absent (GSC not configured)', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeScoredIssue({ issue_type: 'META_TITLE_MISSING' });
    // No fetchTopKeywords in ops → enrichment step is skipped entirely
    await runAudit(baseReq(), happy({
      detectIssues: () => [issue as unknown as DetectedIssue],
      scoreIssues:  () => [issue],
      writeQueue:   async (rows) => { captured = rows; return rows.length; },
    }));
    assert.equal(
      captured[0]!.proposed_fix['top_keywords'],
      undefined,
      'top_keywords should be absent when GSC is not configured',
    );
  });

  it('does not fail when fetchTopKeywords throws (non-blocking)', async () => {
    let captured: ActionQueueRow[] = [];
    const issue = makeScoredIssue({ issue_type: 'META_TITLE_MISSING' });
    await assert.doesNotReject(() =>
      runAudit(baseReq(), happy({
        detectIssues:      () => [issue as unknown as DetectedIssue],
        scoreIssues:       () => [issue],
        fetchTopKeywords:  async () => { throw new Error('GSC timeout'); },
        writeQueue:        async (rows) => { captured = rows; return rows.length; },
      })),
    );
    // Row should still be written even if GSC failed
    assert.equal(captured.length, 1, 'Row should still be written when GSC fails');
  });
});
