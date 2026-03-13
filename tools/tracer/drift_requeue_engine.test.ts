/**
 * tools/tracer/drift_requeue_engine.test.ts
 *
 * Tests for drift re-queue engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  requeueDriftedFix,
  requeueAllDriftedFixes,
  buildDriftRequeueSummary,
  type DriftEvent,
  type DriftRequeueResult,
} from './drift_requeue_engine.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDriftEvent(overrides?: Partial<DriftEvent>): DriftEvent {
  return {
    fix_id: 'fix-1',
    site_id: 'site-1',
    url: 'https://example.com/page',
    issue_type: 'title_missing',
    expected_value: 'My Title',
    current_value: '',
    probable_cause: 'theme_update',
    detected_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockDeps(created_id: string | null = 'new-fix-1') {
  const created: Record<string, unknown>[] = [];
  return {
    created,
    createFixFn: async (fix: Record<string, unknown>) => {
      created.push(fix);
      return created_id;
    },
    loadOriginalFn: async (fix_id: string) => ({
      fix_id,
      url: 'https://example.com/page',
      issue_type: 'title_missing',
      expected_value: 'My Title',
    }),
  };
}

// ── requeueDriftedFix ────────────────────────────────────────────────────────

describe('requeueDriftedFix', () => {
  it('creates new fix record', async () => {
    const deps = mockDeps();
    const result = await requeueDriftedFix(makeDriftEvent(), deps);
    assert.equal(result.requeued, true);
    assert.ok(result.new_fix_id);
    assert.equal(deps.created.length, 1);
  });

  it('preserves issue_type', async () => {
    const deps = mockDeps();
    await requeueDriftedFix(makeDriftEvent({ issue_type: 'schema_missing' }), deps);
    assert.equal(deps.created[0].issue_type, 'schema_missing');
  });

  it('preserves expected_value', async () => {
    const deps = mockDeps();
    await requeueDriftedFix(makeDriftEvent({ expected_value: 'Test Value' }), deps);
    assert.equal(deps.created[0].expected_value, 'Test Value');
  });

  it('sets trigger to drift_requeue', async () => {
    const deps = mockDeps();
    await requeueDriftedFix(makeDriftEvent(), deps);
    assert.equal(deps.created[0].trigger, 'drift_requeue');
  });

  it('sets priority to high', async () => {
    const deps = mockDeps();
    await requeueDriftedFix(makeDriftEvent(), deps);
    assert.equal(deps.created[0].priority, 'high');
  });

  it('sets status to queued', async () => {
    const deps = mockDeps();
    await requeueDriftedFix(makeDriftEvent(), deps);
    assert.equal(deps.created[0].status, 'queued');
  });

  it('sets original_fix_id', async () => {
    const deps = mockDeps();
    await requeueDriftedFix(makeDriftEvent({ fix_id: 'orig-123' }), deps);
    assert.equal(deps.created[0].original_fix_id, 'orig-123');
  });

  it('returns requeued=false on create failure', async () => {
    const result = await requeueDriftedFix(makeDriftEvent(), mockDeps(null));
    assert.equal(result.requeued, false);
    assert.equal(result.new_fix_id, null);
  });

  it('returns requeued=false for missing fix_id', async () => {
    const result = await requeueDriftedFix(makeDriftEvent({ fix_id: '' }));
    assert.equal(result.requeued, false);
  });

  it('returns requeued=false for missing site_id', async () => {
    const result = await requeueDriftedFix(makeDriftEvent({ site_id: '' }));
    assert.equal(result.requeued, false);
  });

  it('never throws on loadOriginal error', async () => {
    const deps = {
      loadOriginalFn: async () => { throw new Error('db down'); },
      createFixFn: async () => 'new-1',
    };
    await assert.doesNotReject(() => requeueDriftedFix(makeDriftEvent(), deps));
  });

  it('never throws on createFix error', async () => {
    const deps = {
      loadOriginalFn: async () => ({}),
      createFixFn: async () => { throw new Error('db down'); },
    };
    const result = await requeueDriftedFix(makeDriftEvent(), deps);
    assert.equal(result.requeued, false);
  });

  it('never throws on null event', async () => {
    await assert.doesNotReject(() => requeueDriftedFix(null as any));
  });
});

// ── requeueAllDriftedFixes ───────────────────────────────────────────────────

describe('requeueAllDriftedFixes', () => {
  it('processes all events', async () => {
    const events = [makeDriftEvent({ fix_id: 'f1' }), makeDriftEvent({ fix_id: 'f2' })];
    const results = await requeueAllDriftedFixes(events, mockDeps());
    assert.equal(results.length, 2);
  });

  it('returns all results including failures', async () => {
    let callCount = 0;
    const results = await requeueAllDriftedFixes(
      [makeDriftEvent({ fix_id: 'f1' }), makeDriftEvent({ fix_id: 'f2' })],
      {
        requeueFn: async (evt) => {
          callCount++;
          if (callCount === 1) return { fix_id: evt.fix_id, site_id: evt.site_id, requeued: true, new_fix_id: 'n1', reason: 'ok' };
          return { fix_id: evt.fix_id, site_id: evt.site_id, requeued: false, new_fix_id: null, reason: 'fail' };
        },
      },
    );
    assert.equal(results.length, 2);
    assert.equal(results[0].requeued, true);
    assert.equal(results[1].requeued, false);
  });

  it('returns empty for empty input', async () => {
    const results = await requeueAllDriftedFixes([]);
    assert.equal(results.length, 0);
  });

  it('never throws on null input', async () => {
    await assert.doesNotReject(() => requeueAllDriftedFixes(null as any));
  });

  it('never throws when requeueFn throws', async () => {
    const results = await requeueAllDriftedFixes(
      [makeDriftEvent()],
      { requeueFn: async () => { throw new Error('boom'); } },
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].requeued, false);
  });
});

// ── buildDriftRequeueSummary ─────────────────────────────────────────────────

describe('buildDriftRequeueSummary', () => {
  it('counts correctly', () => {
    const results: DriftRequeueResult[] = [
      { fix_id: 'f1', site_id: 's1', requeued: true, new_fix_id: 'n1', reason: 'ok' },
      { fix_id: 'f2', site_id: 's1', requeued: false, new_fix_id: null, reason: 'fail' },
      { fix_id: 'f3', site_id: 's1', requeued: true, new_fix_id: 'n3', reason: 'ok' },
    ];
    const summary = buildDriftRequeueSummary(results);
    assert.equal(summary.total, 3);
    assert.equal(summary.requeued, 2);
    assert.equal(summary.failed, 1);
  });

  it('lists requeued fix ids', () => {
    const results: DriftRequeueResult[] = [
      { fix_id: 'f1', site_id: 's1', requeued: true, new_fix_id: 'n1', reason: 'ok' },
      { fix_id: 'f2', site_id: 's1', requeued: true, new_fix_id: 'n2', reason: 'ok' },
    ];
    const summary = buildDriftRequeueSummary(results);
    assert.deepEqual(summary.requeued_fix_ids, ['n1', 'n2']);
  });

  it('returns empty for empty input', () => {
    const summary = buildDriftRequeueSummary([]);
    assert.equal(summary.total, 0);
    assert.equal(summary.requeued, 0);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildDriftRequeueSummary(null as any));
  });
});
