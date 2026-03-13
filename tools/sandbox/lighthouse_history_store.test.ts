import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  saveLighthouseScore,
  loadLighthouseHistory,
  loadSiteLighthouseHistory,
  type LighthouseHistoryEntry,
} from './lighthouse_history_store.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides?: Partial<LighthouseHistoryEntry>): LighthouseHistoryEntry {
  return {
    id:             'entry_1',
    site_id:        'site_1',
    url:            'https://example.com/page-1',
    fix_id:         'fix_1',
    form_factor:    'mobile',
    performance:    85,
    seo:            90,
    accessibility:  92,
    best_practices: 88,
    measured_at:    new Date().toISOString(),
    trigger:        'fix_sandbox',
    ...overrides,
  };
}

// ── saveLighthouseScore ──────────────────────────────────────────────────────

describe('saveLighthouseScore', () => {
  it('returns true on success', async () => {
    const result = await saveLighthouseScore(makeEntry(), {
      saveFn: async () => true,
    });
    assert.equal(result, true);
  });

  it('returns false on error', async () => {
    const result = await saveLighthouseScore(makeEntry(), {
      saveFn: async () => { throw new Error('db error'); },
    });
    assert.equal(result, false);
  });

  it('returns false for null entry', async () => {
    const result = await saveLighthouseScore(null as any);
    assert.equal(result, false);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => saveLighthouseScore(null as any, null as any));
  });
});

// ── loadLighthouseHistory ────────────────────────────────────────────────────

describe('loadLighthouseHistory', () => {
  it('returns sorted desc by measured_at', async () => {
    const entries = [
      makeEntry({ id: 'a', measured_at: '2025-01-01T00:00:00Z' }),
      makeEntry({ id: 'c', measured_at: '2025-01-03T00:00:00Z' }),
      makeEntry({ id: 'b', measured_at: '2025-01-02T00:00:00Z' }),
    ];
    const result = await loadLighthouseHistory('site_1', 'https://example.com', 'mobile', 30, {
      loadFn: async () => entries,
    });
    assert.equal(result[0].id, 'c');
    assert.equal(result[1].id, 'b');
    assert.equal(result[2].id, 'a');
  });

  it('returns [] on error', async () => {
    const result = await loadLighthouseHistory('site_1', 'url', 'mobile', 30, {
      loadFn: async () => { throw new Error('fail'); },
    });
    assert.deepEqual(result, []);
  });

  it('respects limit', async () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ id: `e${i}`, measured_at: new Date(Date.now() - i * 86_400_000).toISOString() }),
    );
    const result = await loadLighthouseHistory('site_1', 'url', 'mobile', 3, {
      loadFn: async () => entries,
    });
    assert.equal(result.length, 3);
  });

  it('form_factor is passed through', async () => {
    let receivedFF = '';
    await loadLighthouseHistory('site_1', 'url', 'desktop', 30, {
      loadFn: async (_s, _u, ff) => { receivedFF = ff; return []; },
    });
    assert.equal(receivedFF, 'desktop');
  });
});

// ── loadSiteLighthouseHistory ────────────────────────────────────────────────

describe('loadSiteLighthouseHistory', () => {
  it('respects period', async () => {
    let receivedSince = '';
    await loadSiteLighthouseHistory('site_1', 'mobile', 7, {
      loadFn: async (_s, _ff, since) => { receivedSince = since; return []; },
    });
    const sinceDate = new Date(receivedSince);
    const daysAgo = (Date.now() - sinceDate.getTime()) / 86_400_000;
    assert.ok(daysAgo >= 6.9 && daysAgo <= 7.1);
  });

  it('returns [] on error', async () => {
    const result = await loadSiteLighthouseHistory('site_1', 'mobile', 30, {
      loadFn: async () => { throw new Error('fail'); },
    });
    assert.deepEqual(result, []);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => loadSiteLighthouseHistory(null as any, null as any, null as any));
  });
});
