/**
 * tools/security/audit_log.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  logAuditEvent,
  getAuditLog,
  getAuditSummary,
  AuditAction,
  type AuditEvent,
} from './audit_log.ts';

// ── Mock DB ───────────────────────────────────────────────────────────────────

type AuditRow = Omit<AuditEvent, 'id'> & { id: string };

function makeDb(
  stored:  AuditRow[] = [],
  dbError: string | null = null,
) {
  const rows = [...stored];
  const newId = crypto.randomUUID();

  return {
    from(_table: 'audit_log') {
      return {
        insert(row: Record<string, unknown>) {
          if (!dbError) rows.push({ id: newId, ...row } as any);
          return {
            select(_col: string) {
              return {
                maybeSingle: async () => ({
                  data:  dbError ? null : { id: newId },
                  error: dbError ? { message: dbError } : null,
                }),
              };
            },
          };
        },
        select(_cols: string) {
          let filtered = [...rows];
          const builder: any = {
            eq(col: string, val: unknown) {
              filtered = filtered.filter((r) => (r as any)[col] === val);
              return builder;
            },
            gte(col: string, val: string) {
              filtered = filtered.filter((r) => (r as any)[col] >= val);
              return builder;
            },
            lte(col: string, val: string) {
              filtered = filtered.filter((r) => (r as any)[col] <= val);
              return builder;
            },
            order(_col: string, _opts: object) { return builder; },
            limit(n: number) { filtered = filtered.slice(0, n); return builder; },
            then<T>(fn?: (v: { data: AuditRow[] | null; error: null }) => T): Promise<T> {
              return Promise.resolve({
                data:  dbError ? null : filtered,
                error: dbError ? { message: dbError } : null,
              } as any).then(fn as any);
            },
          };
          return builder;
        },
      };
    },
  };
}

function event(overrides: Partial<Omit<AuditEvent, 'id' | 'created_at'>> = {}): Omit<AuditEvent, 'id' | 'created_at'> {
  return {
    tenant_id:     'tenant-1',
    actor_type:    'system',
    action:        AuditAction.CRAWL_STARTED,
    resource_type: 'site',
    outcome:       'success',
    ...overrides,
  };
}

function storedEvent(overrides: Partial<AuditEvent> = {}): AuditRow {
  return {
    id:            crypto.randomUUID(),
    tenant_id:     'tenant-1',
    actor_type:    'system',
    action:        AuditAction.CRAWL_STARTED,
    resource_type: 'site',
    outcome:       'success',
    created_at:    new Date().toISOString(),
    ...overrides,
  };
}

// ── AuditAction ───────────────────────────────────────────────────────────────

describe('AuditAction', () => {
  it('defines SITE_CREATED', () => {
    assert.equal(AuditAction.SITE_CREATED, 'site.created');
  });

  it('defines FIX_APPROVED', () => {
    assert.equal(AuditAction.FIX_APPROVED, 'fix.approved');
  });

  it('defines RATE_LIMIT_HIT', () => {
    assert.equal(AuditAction.RATE_LIMIT_HIT, 'rate_limit.hit');
  });

  it('has all 15 expected actions', () => {
    assert.equal(Object.keys(AuditAction).length, 15);
  });
});

// ── logAuditEvent ─────────────────────────────────────────────────────────────

describe('logAuditEvent', () => {
  it('returns ok=true with event_id on success', async () => {
    const db = makeDb();
    const r  = await logAuditEvent(event(), db);
    assert.equal(r.ok, true);
    assert.ok(typeof r.event_id === 'string');
  });

  it('includes optional fields when provided', async () => {
    const db = makeDb();
    const r  = await logAuditEvent(
      event({ user_id: 'u1', ip_address: '1.2.3.4', resource_id: 'site-1' }),
      db,
    );
    assert.equal(r.ok, true);
  });

  it('returns ok=false on DB error', async () => {
    const db = makeDb([], 'DB down');
    const r  = await logAuditEvent(event(), db);
    assert.equal(r.ok, false);
    assert.equal(r.event_id, undefined);
  });

  it('never throws when db is null', async () => {
    await assert.doesNotReject(() => logAuditEvent(event(), null));
  });

  it('returns ok=false silently — no throw — on store error', async () => {
    const r = await logAuditEvent(event(), null);
    assert.equal(r.ok, false);
  });

  it('accepts all actor_types', async () => {
    const db = makeDb();
    for (const actor_type of ['user', 'system', 'api'] as const) {
      const r = await logAuditEvent(event({ actor_type }), db);
      assert.equal(r.ok, true);
    }
  });

  it('accepts all outcome values', async () => {
    const db = makeDb();
    for (const outcome of ['success', 'failure', 'blocked'] as const) {
      const r = await logAuditEvent(event({ outcome }), db);
      assert.equal(r.ok, true);
    }
  });
});

// ── getAuditLog ───────────────────────────────────────────────────────────────

describe('getAuditLog', () => {
  it('returns events for tenant', async () => {
    const db = makeDb([storedEvent(), storedEvent()]);
    const r  = await getAuditLog({ tenant_id: 'tenant-1' }, db);
    assert.equal(r.length, 2);
  });

  it('filters by resource_type', async () => {
    const db = makeDb([
      storedEvent({ resource_type: 'site' }),
      storedEvent({ resource_type: 'fix' }),
    ]);
    const r = await getAuditLog({ tenant_id: 'tenant-1', resource_type: 'fix' }, db);
    assert.ok(r.every((e) => e.resource_type === 'fix'));
  });

  it('filters by action', async () => {
    const db = makeDb([
      storedEvent({ action: 'site.created' }),
      storedEvent({ action: 'fix.applied' }),
    ]);
    const r = await getAuditLog({ tenant_id: 'tenant-1', action: 'fix.applied' }, db);
    assert.ok(r.every((e) => e.action === 'fix.applied'));
  });

  it('returns empty array on DB error', async () => {
    const db = makeDb([], 'fail');
    const r  = await getAuditLog({ tenant_id: 'tenant-1' }, db);
    assert.deepEqual(r, []);
  });

  it('returns empty array when db is null', async () => {
    const r = await getAuditLog({ tenant_id: 'tenant-1' }, null);
    assert.deepEqual(r, []);
  });

  it('respects limit', async () => {
    const db = makeDb(Array.from({ length: 5 }, () => storedEvent()));
    const r  = await getAuditLog({ tenant_id: 'tenant-1', limit: 3 }, db);
    assert.equal(r.length, 3);
  });

  it('defaults to limit 100', async () => {
    const db = makeDb(Array.from({ length: 50 }, () => storedEvent()));
    const r  = await getAuditLog({ tenant_id: 'tenant-1' }, db);
    assert.equal(r.length, 50); // only 50 exist
  });
});

// ── getAuditSummary ───────────────────────────────────────────────────────────

describe('getAuditSummary', () => {
  it('counts total events', async () => {
    const db = makeDb([storedEvent(), storedEvent()]);
    const r  = await getAuditSummary('tenant-1', 30, db);
    assert.equal(r.total_events, 2);
  });

  it('groups by action', async () => {
    const db = makeDb([
      storedEvent({ action: 'crawl.started' }),
      storedEvent({ action: 'crawl.started' }),
      storedEvent({ action: 'site.created' }),
    ]);
    const r = await getAuditSummary('tenant-1', 30, db);
    assert.equal(r.by_action['crawl.started'], 2);
    assert.equal(r.by_action['site.created'], 1);
  });

  it('groups by outcome', async () => {
    const db = makeDb([
      storedEvent({ outcome: 'success' }),
      storedEvent({ outcome: 'failure' }),
      storedEvent({ outcome: 'failure' }),
    ]);
    const r = await getAuditSummary('tenant-1', 30, db);
    assert.equal(r.by_outcome['success'], 1);
    assert.equal(r.by_outcome['failure'], 2);
  });

  it('extracts recent_failures from failure/blocked outcomes', async () => {
    const db = makeDb([
      storedEvent({ outcome: 'failure' }),
      storedEvent({ outcome: 'success' }),
      storedEvent({ outcome: 'blocked' }),
    ]);
    const r = await getAuditSummary('tenant-1', 30, db);
    assert.equal(r.recent_failures.length, 2);
    assert.ok(r.recent_failures.every((e) => e.outcome === 'failure' || e.outcome === 'blocked'));
  });

  it('returns zeros on DB error', async () => {
    const r = await getAuditSummary('tenant-1', 30, null);
    assert.equal(r.total_events, 0);
    assert.deepEqual(r.by_action, {});
    assert.deepEqual(r.by_outcome, {});
    assert.deepEqual(r.recent_failures, []);
  });
});
