/**
 * tools/email/digest_scheduler.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getNextSendAt,
  shouldSendDigest,
  getSchedulesForTenant,
  DEFAULT_DIGEST_SCHEDULE,
  type DigestSchedule,
} from './digest_scheduler.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Wednesday 2026-03-11 15:00 UTC
const REF = new Date('2026-03-11T15:00:00Z');
const TENANT = 't1';

function makeSchedule(overrides: Partial<DigestSchedule> = {}): DigestSchedule {
  return {
    tenant_id:    TENANT,
    frequency:    'weekly',
    day_of_week:  1,           // Monday
    hour_utc:     9,
    enabled:      true,
    next_send_at: '2026-03-16T09:00:00.000Z', // coming Monday
    ...overrides,
  };
}

function makeDb(rows: Record<string, unknown>[] = [], error?: string) {
  return {
    from() {
      let filtered = [...rows];
      const q: Record<string, unknown> = {
        select()  { return q; },
        eq(col: string, val: unknown) { filtered = filtered.filter((r) => r[col] === val); return q; },
        order()   { return q; },
        limit(n: number) { filtered = filtered.slice(0, n); return q; },
        then(resolve: (v: { data: unknown[] | null; error: unknown }) => void) {
          resolve({ data: error ? null : filtered, error: error ? { message: error } : null });
        },
      };
      return q;
    },
  };
}

// ── DEFAULT_DIGEST_SCHEDULE ───────────────────────────────────────────────────

describe('DEFAULT_DIGEST_SCHEDULE', () => {
  it('is weekly, Monday, 9am UTC, enabled', () => {
    assert.equal(DEFAULT_DIGEST_SCHEDULE.frequency, 'weekly');
    assert.equal(DEFAULT_DIGEST_SCHEDULE.day_of_week, 1);
    assert.equal(DEFAULT_DIGEST_SCHEDULE.hour_utc, 9);
    assert.equal(DEFAULT_DIGEST_SCHEDULE.enabled, true);
  });
});

// ── getNextSendAt — weekly ────────────────────────────────────────────────────

describe('getNextSendAt — weekly', () => {
  it('returns next Monday when called on a Wednesday', () => {
    // REF = Wednesday 2026-03-11. Next Monday = 2026-03-16
    const next = getNextSendAt({ tenant_id: TENANT, ...DEFAULT_DIGEST_SCHEDULE }, REF);
    assert.ok(next.startsWith('2026-03-16'), `expected 2026-03-16, got ${next}`);
  });

  it('sets time to hour_utc:00:00Z', () => {
    const next = getNextSendAt({ tenant_id: TENANT, ...DEFAULT_DIGEST_SCHEDULE }, REF);
    assert.ok(next.includes('T09:00:00'), `expected T09:00:00 in ${next}`);
  });

  it('skips today if current time already past hour_utc on that day', () => {
    // Monday 2026-03-09 at 10:00 UTC — hour 9 already passed
    const monday10 = new Date('2026-03-09T10:00:00Z');
    const next = getNextSendAt({ tenant_id: TENANT, ...DEFAULT_DIGEST_SCHEDULE }, monday10);
    // Next Monday = 2026-03-16
    assert.ok(next.startsWith('2026-03-16'), `expected 2026-03-16, got ${next}`);
  });

  it('returns today when it IS the day and hour has not passed', () => {
    // Monday 2026-03-09 at 08:00 UTC — before 9am
    const monday8 = new Date('2026-03-09T08:00:00Z');
    const next = getNextSendAt({ tenant_id: TENANT, ...DEFAULT_DIGEST_SCHEDULE }, monday8);
    assert.ok(next.startsWith('2026-03-09'), `expected 2026-03-09, got ${next}`);
  });

  it('returns a valid ISO string', () => {
    const next = getNextSendAt({ tenant_id: TENANT, ...DEFAULT_DIGEST_SCHEDULE }, REF);
    assert.ok(!isNaN(Date.parse(next)));
  });

  it('never throws on unusual day_of_week values', () => {
    assert.doesNotThrow(() =>
      getNextSendAt({ tenant_id: TENANT, frequency: 'weekly', day_of_week: 6, hour_utc: 0, enabled: true }, REF),
    );
  });
});

// ── getNextSendAt — monthly ───────────────────────────────────────────────────

describe('getNextSendAt — monthly', () => {
  it('returns first day of next month at hour_utc', () => {
    const next = getNextSendAt(
      { tenant_id: TENANT, frequency: 'monthly', day_of_week: 0, hour_utc: 9, enabled: true },
      REF,
    );
    // REF is March 2026 → next = 2026-04-01
    assert.ok(next.startsWith('2026-04-01'), `expected 2026-04-01, got ${next}`);
    assert.ok(next.includes('T09:00:00'), `expected T09:00:00 in ${next}`);
  });
});

// ── shouldSendDigest ──────────────────────────────────────────────────────────

describe('shouldSendDigest', () => {
  it('returns true when now >= next_send_at and enabled, no last_sent_at', () => {
    const s = makeSchedule({ next_send_at: '2026-03-10T09:00:00Z' });
    assert.ok(shouldSendDigest(s, REF));
  });

  it('returns false when enabled=false', () => {
    const s = makeSchedule({ enabled: false, next_send_at: '2026-03-10T09:00:00Z' });
    assert.ok(!shouldSendDigest(s, REF));
  });

  it('returns false when now < next_send_at', () => {
    const s = makeSchedule({ next_send_at: '2026-03-20T09:00:00Z' });
    assert.ok(!shouldSendDigest(s, REF));
  });

  it('returns false when last_sent_at is within 23 hours', () => {
    const twoHoursAgo = new Date(REF.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const s = makeSchedule({
      next_send_at: '2026-03-10T09:00:00Z',
      last_sent_at: twoHoursAgo,
    });
    assert.ok(!shouldSendDigest(s, REF));
  });

  it('returns true when last_sent_at is more than 23 hours ago', () => {
    const twoDaysAgo = new Date(REF.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const s = makeSchedule({
      next_send_at: '2026-03-10T09:00:00Z',
      last_sent_at: twoDaysAgo,
    });
    assert.ok(shouldSendDigest(s, REF));
  });

  it('never throws on malformed schedule', () => {
    assert.doesNotThrow(() => shouldSendDigest({} as DigestSchedule, REF));
  });
});

// ── getSchedulesForTenant ─────────────────────────────────────────────────────

describe('getSchedulesForTenant', () => {
  it('returns default schedule when no rows found', async () => {
    const db = makeDb([]);
    const schedules = await getSchedulesForTenant(TENANT, db);
    assert.equal(schedules.length, 1);
    assert.equal(schedules[0]?.frequency, 'weekly');
    assert.equal(schedules[0]?.enabled, true);
  });

  it('returns default when DB errors', async () => {
    const db = makeDb([], 'DB offline');
    const schedules = await getSchedulesForTenant(TENANT, db);
    assert.equal(schedules.length, 1);
  });

  it('returns mapped row when one exists', async () => {
    const db = makeDb([{
      tenant_id: TENANT, frequency: 'monthly', day_of_week: 0,
      hour_utc: 8, enabled: true, last_sent_at: null, next_send_at: '2026-04-01T08:00:00.000Z',
    }]);
    const schedules = await getSchedulesForTenant(TENANT, db);
    assert.equal(schedules.length, 1);
    assert.equal(schedules[0]?.frequency, 'monthly');
    assert.equal(schedules[0]?.hour_utc, 8);
  });

  it('tenant_id from default schedule matches input', async () => {
    const db = makeDb([]);
    const schedules = await getSchedulesForTenant(TENANT, db);
    assert.equal(schedules[0]?.tenant_id, TENANT);
  });

  it('never throws when db throws', async () => {
    const badDb = { from() { throw new Error('boom'); } };
    await assert.doesNotReject(() => getSchedulesForTenant(TENANT, badDb));
  });
});
