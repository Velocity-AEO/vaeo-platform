/**
 * tools/email/digest_sender.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sendDigestForTenant,
  sendAllDueDigests,
  type DigestSendResult,
} from './digest_sender.ts';
import type { TenantDigestData, DigestPeriod } from './digest_aggregator.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT = 't1';

const PERIOD: DigestPeriod = {
  from: '2026-03-04T00:00:00Z',
  to:   '2026-03-11T23:59:59Z',
  days: 7,
};

function makeDigestData(overrides: Partial<TenantDigestData> = {}): TenantDigestData {
  return {
    tenant_id:           TENANT,
    period:              PERIOD,
    sites:               [{ site_id: 's1', domain: 'a.com', health_score_current: 80, health_score_previous: 60, health_score_delta: 20, fixes_applied: 3, fixes_pending: 1, top_fixes: [], regressions_detected: 0, aeo_items_added: 0, timestamp_fixes_applied: 0, gsc_clicks_delta: 0, gsc_impressions_delta: 0 }],
    total_fixes_applied: 3,
    total_sites:         1,
    sites_improved:      1,
    sites_regressed:     0,
    generated_at:        '2026-03-11T12:00:00Z',
    ...overrides,
  };
}

type TableRows = Record<string, Record<string, unknown>[] | Record<string, unknown>>;

function makeDb(tables: TableRows) {
  return {
    from(table: string) {
      const rowsOrRow = (tables[table] ?? []);
      const isArray = Array.isArray(rowsOrRow);
      let rows: Record<string, unknown>[] = isArray
        ? (rowsOrRow as Record<string, unknown>[])
        : [rowsOrRow as Record<string, unknown>];

      const q: Record<string, unknown> = {
        select()  { return q; },
        eq(col: string, val: unknown) {
          rows = rows.filter((r) => r[col] === val);
          return q;
        },
        limit(n: number) { rows = rows.slice(0, n); return q; },
        maybeSingle() {
          return {
            then(resolve: (v: { data: unknown; error: null }) => void) {
              resolve({ data: rows[0] ?? null, error: null });
            },
          };
        },
        then(resolve: (v: { data: unknown[]; error: null }) => void) {
          resolve({ data: rows, error: null });
        },
      };
      return q;
    },
  };
}

function makeDbWithEmail(email: string) {
  return makeDb({ tenants: [{ tenant_id: TENANT, email }] });
}

// ── sendDigestForTenant ───────────────────────────────────────────────────────

describe('sendDigestForTenant — result shape', () => {
  it('returns DigestSendResult with required fields', async () => {
    const db = makeDbWithEmail('test@example.com');
    const r = await sendDigestForTenant(TENANT, db, {
      buildDigest:  async () => makeDigestData(),
      renderDigest: () => '<p>html</p>',
      sendEmail:    async () => true,
    });
    assert.equal(r.tenant_id, TENANT);
    assert.ok(typeof r.sent === 'boolean');
    assert.ok(typeof r.sites_included === 'number');
    assert.ok(r.period !== undefined);
  });

  it('sent=true when email delivers successfully', async () => {
    const db = makeDbWithEmail('test@example.com');
    const r = await sendDigestForTenant(TENANT, db, {
      buildDigest:  async () => makeDigestData(),
      renderDigest: () => '<p>html</p>',
      sendEmail:    async () => true,
    });
    assert.ok(r.sent);
    assert.equal(r.recipient_email, 'test@example.com');
  });

  it('sent=false when sendEmail returns false', async () => {
    const db = makeDbWithEmail('test@example.com');
    const r = await sendDigestForTenant(TENANT, db, {
      buildDigest:  async () => makeDigestData(),
      renderDigest: () => '<p>html</p>',
      sendEmail:    async () => false,
    });
    assert.ok(!r.sent);
    assert.ok(r.error !== undefined);
  });
});

describe('sendDigestForTenant — no activity skip', () => {
  it('skips send (sent=false) when total_fixes_applied=0', async () => {
    const db = makeDbWithEmail('test@example.com');
    let sendCalled = false;
    const r = await sendDigestForTenant(TENANT, db, {
      buildDigest:  async () => makeDigestData({ total_fixes_applied: 0 }),
      renderDigest: () => '<p>html</p>',
      sendEmail:    async () => { sendCalled = true; return true; },
    });
    assert.ok(!r.sent);
    assert.ok(!sendCalled, 'sendEmail should not be called when no activity');
  });

  it('sites_included reflects total_sites even when skipping', async () => {
    const db = makeDbWithEmail('test@example.com');
    const r = await sendDigestForTenant(TENANT, db, {
      buildDigest:  async () => makeDigestData({ total_fixes_applied: 0, total_sites: 3 }),
      renderDigest: () => '<p>html</p>',
      sendEmail:    async () => true,
    });
    assert.equal(r.sites_included, 3);
  });
});

describe('sendDigestForTenant — no email found', () => {
  it('returns error when no email in tenants or profiles', async () => {
    const db = makeDb({ tenants: [] });
    const r = await sendDigestForTenant(TENANT, db, {
      buildDigest:  async () => makeDigestData(),
      renderDigest: () => '',
      sendEmail:    async () => true,
    });
    assert.ok(!r.sent);
    assert.ok(r.error?.includes('email'));
  });

  it('falls back to profiles table for email', async () => {
    const db = makeDb({
      tenants:  [],
      profiles: [{ tenant_id: TENANT, email: 'profile@example.com' }],
    });
    const r = await sendDigestForTenant(TENANT, db, {
      buildDigest:  async () => makeDigestData(),
      renderDigest: () => '<p>html</p>',
      sendEmail:    async () => true,
    });
    assert.ok(r.sent);
    assert.equal(r.recipient_email, 'profile@example.com');
  });
});

describe('sendDigestForTenant — error handling', () => {
  it('never throws when buildDigest throws', async () => {
    const db = makeDbWithEmail('test@example.com');
    await assert.doesNotReject(() =>
      sendDigestForTenant(TENANT, db, {
        buildDigest: async () => { throw new Error('DB exploded'); },
      }),
    );
  });

  it('returns sent=false with error when buildDigest throws', async () => {
    const db = makeDbWithEmail('test@example.com');
    const r = await sendDigestForTenant(TENANT, db, {
      buildDigest: async () => { throw new Error('DB exploded'); },
    });
    assert.ok(!r.sent);
    assert.ok(r.error?.includes('DB exploded'));
  });

  it('never throws when sendEmail throws', async () => {
    const db = makeDbWithEmail('test@example.com');
    await assert.doesNotReject(() =>
      sendDigestForTenant(TENANT, db, {
        buildDigest:  async () => makeDigestData(),
        renderDigest: () => '<p>html</p>',
        sendEmail:    async () => { throw new Error('network error'); },
      }),
    );
  });

  it('period is included in result even on error', async () => {
    const badDb = { from() { throw new Error('boom'); } };
    const r = await sendDigestForTenant(TENANT, badDb);
    assert.ok(r.period !== undefined);
    assert.ok(typeof r.period.days === 'number');
  });
});

// ── sendAllDueDigests ─────────────────────────────────────────────────────────

describe('sendAllDueDigests', () => {
  it('returns empty array when no tenants found', async () => {
    const db = makeDb({ tenants: [] });
    const results = await sendAllDueDigests(db);
    assert.deepStrictEqual(results, []);
  });

  it('sends to each tenant in the tenants table', async () => {
    const tenantsSent: string[] = [];
    const db = makeDb({
      tenants: [
        { tenant_id: 't1', email: 'a@example.com' },
        { tenant_id: 't2', email: 'b@example.com' },
      ],
    });
    const results = await sendAllDueDigests(db, {
      buildDigest:  async (tid) => makeDigestData({ tenant_id: tid }),
      renderDigest: () => '<p>html</p>',
      sendEmail:    async (to) => { tenantsSent.push(to); return true; },
    });
    assert.equal(results.length, 2);
    assert.ok(tenantsSent.includes('a@example.com'));
    assert.ok(tenantsSent.includes('b@example.com'));
  });

  it('returns array of DigestSendResult', async () => {
    const db = makeDb({ tenants: [{ tenant_id: 't1', email: 'a@example.com' }] });
    const results = await sendAllDueDigests(db, {
      buildDigest:  async () => makeDigestData(),
      renderDigest: () => '<p>html</p>',
      sendEmail:    async () => true,
    });
    assert.equal(results.length, 1);
    assert.ok(typeof results[0]?.sent === 'boolean');
  });

  it('never throws when db throws', async () => {
    const badDb = { from() { throw new Error('boom'); } };
    await assert.doesNotReject(() => sendAllDueDigests(badDb));
  });
});
