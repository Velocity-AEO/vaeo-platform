/**
 * tools/tracer/drift_event_store.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  saveDriftEvent,
  loadDriftEvents,
  loadDriftedFixes,
  markDriftResolved,
  summarizeDriftHistory,
  type DriftEventStoreRow,
} from './drift_event_store.js';
import type { DriftEvent } from './drift_scanner.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<DriftEvent> = {}): DriftEvent {
  return {
    fix_id:            'fix-1',
    site_id:           'site-1',
    url:               'https://shop.com/products/mug',
    issue_type:        'TITLE_MISSING',
    original_value:    '',
    expected_value:    'Ceramic Mug',
    current_value:     null,
    drift_status:      'drifted',
    drift_detected_at: '2026-03-01T00:00:00Z',
    applied_at:        '2026-01-01T00:00:00Z',
    days_since_fix:    59,
    probable_cause:    'theme_update',
    ...overrides,
  };
}

// ── saveDriftEvent ────────────────────────────────────────────────────────────

describe('saveDriftEvent — success', () => {
  it('returns true when saveFn returns an id', async () => {
    const ok = await saveDriftEvent(makeEvent(), {
      saveFn: async () => 'new-id',
    });
    assert.equal(ok, true);
  });

  it('passes the event to saveFn', async () => {
    let received: DriftEvent | null = null;
    await saveDriftEvent(makeEvent(), {
      saveFn: async (e) => { received = e; return 'id'; },
    });
    assert.equal(received!.fix_id, 'fix-1');
  });

  it('returns false when saveFn returns null', async () => {
    const ok = await saveDriftEvent(makeEvent(), {
      saveFn: async () => null,
    });
    assert.equal(ok, false);
  });

  it('returns false when saveFn throws', async () => {
    const ok = await saveDriftEvent(makeEvent(), {
      saveFn: async () => { throw new Error('db error'); },
    });
    assert.equal(ok, false);
  });
});

describe('saveDriftEvent — invalid input', () => {
  it('returns false for null event', async () => {
    assert.equal(await saveDriftEvent(null as never), false);
  });

  it('returns false when fix_id is missing', async () => {
    assert.equal(await saveDriftEvent({ ...makeEvent(), fix_id: '' }), false);
  });

  it('returns false when site_id is missing', async () => {
    assert.equal(await saveDriftEvent({ ...makeEvent(), site_id: '' }), false);
  });
});

// ── loadDriftEvents ───────────────────────────────────────────────────────────

describe('loadDriftEvents', () => {
  it('returns events from loadFn', async () => {
    const rows: DriftEventStoreRow[] = [makeEvent()];
    const result = await loadDriftEvents('site-1', {
      loadFn: async () => rows,
    });
    assert.equal(result.length, 1);
    assert.equal(result[0]!.fix_id, 'fix-1');
  });

  it('returns empty array for unknown site', async () => {
    const result = await loadDriftEvents('unknown', {
      loadFn: async () => [],
    });
    assert.deepEqual(result, []);
  });

  it('returns empty array when loadFn throws', async () => {
    const result = await loadDriftEvents('site-1', {
      loadFn: async () => { throw new Error('db down'); },
    });
    assert.deepEqual(result, []);
  });

  it('returns empty array for empty site_id', async () => {
    assert.deepEqual(await loadDriftEvents(''), []);
  });
});

// ── loadDriftedFixes ──────────────────────────────────────────────────────────

describe('loadDriftedFixes', () => {
  it('returns only drifted, unresolved events', async () => {
    const rows: DriftEventStoreRow[] = [
      makeEvent({ fix_id: 'a', drift_status: 'drifted' }),
      makeEvent({ fix_id: 'b', drift_status: 'stable' }),
      { ...makeEvent({ fix_id: 'c', drift_status: 'drifted' }), is_resolved: true },
    ];
    const result = await loadDriftedFixes('site-1', {
      loadFn: async () => rows,
    });
    assert.equal(result.length, 1);
    assert.equal(result[0]!.fix_id, 'a');
  });

  it('returns empty when all fixes are stable', async () => {
    const rows: DriftEventStoreRow[] = [
      makeEvent({ fix_id: 'a', drift_status: 'stable' }),
    ];
    const result = await loadDriftedFixes('site-1', { loadFn: async () => rows });
    assert.deepEqual(result, []);
  });
});

// ── markDriftResolved ─────────────────────────────────────────────────────────

describe('markDriftResolved', () => {
  it('returns true when resolveFn succeeds', async () => {
    const ok = await markDriftResolved('fix-1', {
      resolveFn: async () => true,
    });
    assert.equal(ok, true);
  });

  it('returns false when resolveFn returns false', async () => {
    const ok = await markDriftResolved('fix-1', {
      resolveFn: async () => false,
    });
    assert.equal(ok, false);
  });

  it('returns false when resolveFn throws', async () => {
    const ok = await markDriftResolved('fix-1', {
      resolveFn: async () => { throw new Error('db error'); },
    });
    assert.equal(ok, false);
  });

  it('returns false for empty fix_id', async () => {
    assert.equal(await markDriftResolved(''), false);
  });

  it('passes fix_id to resolveFn', async () => {
    let received = '';
    await markDriftResolved('fix-99', {
      resolveFn: async (id) => { received = id; return true; },
    });
    assert.equal(received, 'fix-99');
  });
});

// ── summarizeDriftHistory ─────────────────────────────────────────────────────

describe('summarizeDriftHistory — counts', () => {
  it('returns zero counts for empty events', async () => {
    const summary = await summarizeDriftHistory('site-1', {
      loadFn: async () => [],
    });
    assert.equal(summary.total_events, 0);
    assert.equal(summary.drift_rate, 0);
    assert.equal(summary.most_common_cause, null);
  });

  it('counts stable, drifted, unknown correctly', async () => {
    const rows: DriftEventStoreRow[] = [
      makeEvent({ fix_id: 'a', drift_status: 'stable'  }),
      makeEvent({ fix_id: 'b', drift_status: 'drifted' }),
      makeEvent({ fix_id: 'c', drift_status: 'unknown' }),
      makeEvent({ fix_id: 'd', drift_status: 'drifted' }),
    ];
    const summary = await summarizeDriftHistory('site-1', {
      loadFn: async () => rows,
    });
    assert.equal(summary.total_events, 4);
    assert.equal(summary.stable_count, 1);
    assert.equal(summary.drifted_count, 2);
    assert.equal(summary.unknown_count, 1);
  });

  it('calculates drift_rate correctly', async () => {
    const rows: DriftEventStoreRow[] = [
      makeEvent({ fix_id: 'a', drift_status: 'drifted' }),
      makeEvent({ fix_id: 'b', drift_status: 'stable' }),
    ];
    const summary = await summarizeDriftHistory('site-1', { loadFn: async () => rows });
    assert.equal(summary.drift_rate, 50);
  });

  it('identifies most_common_cause', async () => {
    const rows: DriftEventStoreRow[] = [
      makeEvent({ fix_id: 'a', drift_status: 'drifted', probable_cause: 'theme_update' }),
      makeEvent({ fix_id: 'b', drift_status: 'drifted', probable_cause: 'theme_update' }),
      makeEvent({ fix_id: 'c', drift_status: 'drifted', probable_cause: 'cms_edit' }),
    ];
    const summary = await summarizeDriftHistory('site-1', { loadFn: async () => rows });
    assert.equal(summary.most_common_cause, 'theme_update');
  });

  it('counts resolved events', async () => {
    const rows: DriftEventStoreRow[] = [
      makeEvent({ fix_id: 'a', drift_status: 'stable' }),
      { ...makeEvent({ fix_id: 'b', drift_status: 'drifted' }), is_resolved: true },
    ];
    const summary = await summarizeDriftHistory('site-1', { loadFn: async () => rows });
    assert.equal(summary.resolved_count, 1);
  });

  it('returns most_recent_at as the latest drift_detected_at', async () => {
    const rows: DriftEventStoreRow[] = [
      makeEvent({ fix_id: 'a', drift_detected_at: '2026-01-01T00:00:00Z' }),
      makeEvent({ fix_id: 'b', drift_detected_at: '2026-03-01T00:00:00Z' }),
    ];
    const summary = await summarizeDriftHistory('site-1', { loadFn: async () => rows });
    assert.equal(summary.most_recent_at, '2026-03-01T00:00:00Z');
  });
});

describe('summarizeDriftHistory — edge cases', () => {
  it('returns empty summary for empty site_id', async () => {
    const summary = await summarizeDriftHistory('');
    assert.equal(summary.total_events, 0);
  });

  it('never throws when loadFn throws', async () => {
    const summary = await summarizeDriftHistory('site-1', {
      loadFn: async () => { throw new Error('db down'); },
    });
    assert.equal(summary.total_events, 0);
  });
});
