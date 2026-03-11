/**
 * tools/tracer/change_detector.test.ts
 *
 * Tests for change detection — comparing current vs previous tracer observations.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectChanges,
  storeSnapshot,
  type ChangeDetectorDb,
  type IssueRecord,
} from './change_detector.js';

// ── Mock DB ───────────────────────────────────────────────────────────────────

function mockDb(prevRows: Array<{ url: string; issue_type: string; created_at: string }> = []): {
  db: ChangeDetectorDb;
  inserted: Array<Record<string, unknown>>;
} {
  const inserted: Array<Record<string, unknown>> = [];
  const db: ChangeDetectorDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: async () => ({ data: prevRows, error: null }),
          }),
        }),
      }),
      insert: (rows: Array<Record<string, unknown>>) => {
        inserted.push(...rows);
        return {
          select: async () => ({ data: rows.map((_, i) => ({ id: `id-${i}` })), error: null }),
        };
      },
    }),
  };
  return { db, inserted };
}

function errorDb(): ChangeDetectorDb {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: async () => ({ data: null, error: { message: 'DB error' } }),
          }),
        }),
      }),
      insert: () => ({
        select: async () => ({ data: null, error: { message: 'DB error' } }),
      }),
    }),
  };
}

// ── detectChanges — new page ─────────────────────────────────────────────────

describe('detectChanges — new page', () => {
  it('marks URL as new_page when no prior observation exists', async () => {
    const { db } = mockDb([]);
    const current: IssueRecord[] = [
      { url: 'https://shop.com/products/new', issue_type: 'SCHEMA_MISSING' },
    ];
    const changes = await detectChanges('site-1', current, db);
    assert.equal(changes.length, 1);
    assert.equal(changes[0]!.change_type, 'new_page');
    assert.deepEqual(changes[0]!.added_issues, ['SCHEMA_MISSING']);
    assert.deepEqual(changes[0]!.previous_issues, []);
  });

  it('severity_delta is positive for new pages', async () => {
    const { db } = mockDb([]);
    const changes = await detectChanges('site-1', [
      { url: 'https://shop.com/p', issue_type: 'META_TITLE_MISSING' },
    ], db);
    assert.ok(changes[0]!.severity_delta > 0);
  });
});

// ── detectChanges — new issue on existing page ───────────────────────────────

describe('detectChanges — new issue', () => {
  it('detects new issue added to existing page', async () => {
    const { db } = mockDb([
      { url: 'https://shop.com/p', issue_type: 'SCHEMA_MISSING', created_at: '2026-01-01T00:00:00Z' },
    ]);
    const changes = await detectChanges('site-1', [
      { url: 'https://shop.com/p', issue_type: 'SCHEMA_MISSING' },
      { url: 'https://shop.com/p', issue_type: 'META_TITLE_MISSING' },
    ], db);
    assert.equal(changes.length, 1);
    assert.equal(changes[0]!.change_type, 'new_issue');
    assert.deepEqual(changes[0]!.added_issues, ['META_TITLE_MISSING']);
  });
});

// ── detectChanges — resolved ─────────────────────────────────────────────────

describe('detectChanges — resolved', () => {
  it('detects issue resolved on existing page', async () => {
    const { db } = mockDb([
      { url: 'https://shop.com/p', issue_type: 'SCHEMA_MISSING', created_at: '2026-01-01T00:00:00Z' },
      { url: 'https://shop.com/p', issue_type: 'META_TITLE_MISSING', created_at: '2026-01-01T00:00:00Z' },
    ]);
    const changes = await detectChanges('site-1', [
      { url: 'https://shop.com/p', issue_type: 'SCHEMA_MISSING' },
    ], db);
    assert.equal(changes.length, 1);
    assert.equal(changes[0]!.change_type, 'resolved');
    assert.deepEqual(changes[0]!.resolved_issues, ['META_TITLE_MISSING']);
  });

  it('detects fully resolved page (all issues gone)', async () => {
    const { db } = mockDb([
      { url: 'https://shop.com/p', issue_type: 'SCHEMA_MISSING', created_at: '2026-01-01T00:00:00Z' },
    ]);
    const changes = await detectChanges('site-1', [], db);
    assert.equal(changes.length, 1);
    assert.equal(changes[0]!.change_type, 'resolved');
    assert.equal(changes[0]!.current_issues.length, 0);
    assert.ok(changes[0]!.severity_delta < 0);
  });
});

// ── detectChanges — unchanged ────────────────────────────────────────────────

describe('detectChanges — unchanged', () => {
  it('returns no changes when issues are identical', async () => {
    const { db } = mockDb([
      { url: 'https://shop.com/p', issue_type: 'SCHEMA_MISSING', created_at: '2026-01-01T00:00:00Z' },
    ]);
    const changes = await detectChanges('site-1', [
      { url: 'https://shop.com/p', issue_type: 'SCHEMA_MISSING' },
    ], db);
    assert.equal(changes.length, 0);
  });
});

// ── detectChanges — worsened ─────────────────────────────────────────────────

describe('detectChanges — worsened', () => {
  it('marks worsened when issues added AND removed but severity increased', async () => {
    const { db } = mockDb([
      { url: 'https://shop.com/p', issue_type: 'FONT_DISPLAY', created_at: '2026-01-01T00:00:00Z' },
    ]);
    // Replaced FONT_DISPLAY (4) with SCHEMA_MISSING (10) — net worse
    const changes = await detectChanges('site-1', [
      { url: 'https://shop.com/p', issue_type: 'SCHEMA_MISSING' },
    ], db);
    assert.equal(changes.length, 1);
    assert.equal(changes[0]!.change_type, 'worsened');
    assert.ok(changes[0]!.severity_delta > 0);
  });
});

// ── detectChanges — error handling ───────────────────────────────────────────

describe('detectChanges — errors', () => {
  it('returns empty array on DB error', async () => {
    const changes = await detectChanges('site-1', [
      { url: 'https://shop.com/p', issue_type: 'SCHEMA_MISSING' },
    ], errorDb());
    assert.deepEqual(changes, []);
  });
});

// ── detectChanges — multiple pages ───────────────────────────────────────────

describe('detectChanges — multiple pages', () => {
  it('handles mix of new pages and changed pages', async () => {
    const { db } = mockDb([
      { url: 'https://shop.com/a', issue_type: 'SCHEMA_MISSING', created_at: '2026-01-01T00:00:00Z' },
    ]);
    const changes = await detectChanges('site-1', [
      { url: 'https://shop.com/a', issue_type: 'SCHEMA_MISSING' }, // unchanged
      { url: 'https://shop.com/b', issue_type: 'META_TITLE_MISSING' }, // new page
    ], db);
    assert.equal(changes.length, 1); // only the new page
    assert.equal(changes[0]!.url, 'https://shop.com/b');
    assert.equal(changes[0]!.change_type, 'new_page');
  });
});

// ── storeSnapshot ────────────────────────────────────────────────────────────

describe('storeSnapshot', () => {
  it('writes issues as tracer observations', async () => {
    const { db, inserted } = mockDb();
    await storeSnapshot('site-1', [
      { url: 'https://shop.com/p', issue_type: 'SCHEMA_MISSING' },
    ], db);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0]!.site_id, 'site-1');
    assert.equal(inserted[0]!.sandbox_status, 'tracer_observation');
    assert.equal(inserted[0]!.approval_status, 'observation');
  });

  it('does nothing for empty issues array', async () => {
    const { db, inserted } = mockDb();
    await storeSnapshot('site-1', [], db);
    assert.equal(inserted.length, 0);
  });
});
