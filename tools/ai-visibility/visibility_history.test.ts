import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVisibilitySnapshot,
  simulateVisibilityHistory,
  computeVisibilityTrend,
  type AIVisibilitySnapshot,
} from './visibility_history.js';
import type { UnifiedAISignal } from './unified_signal.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSignal(overrides: Partial<UnifiedAISignal> = {}): UnifiedAISignal {
  return {
    signal_id: 'sig-1',
    site_id: 'site1',
    domain: 'test.com',
    perplexity_citation_rate: 0.3,
    google_aio_citation_rate: 0.2,
    combined_citation_rate: 0.25,
    combined_score: 25,
    total_queries: 10,
    total_citations: 5,
    citations_by_source: { perplexity: 3, google_ai_overview: 2, chatgpt: 0, bing_copilot: 0, unknown: 0 },
    strongest_source: 'perplexity',
    weakest_source: 'google_ai_overview',
    trend: 'stable',
    computed_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── buildVisibilitySnapshot ──────────────────────────────────────────────────

describe('buildVisibilitySnapshot', () => {
  it('sets snapshot_id as UUID', () => {
    const snap = buildVisibilitySnapshot('site1', 'test.com', makeSignal());
    assert.ok(snap.snapshot_id);
    assert.match(snap.snapshot_id, /^[0-9a-f-]{36}$/);
  });

  it('sets site_id and domain', () => {
    const snap = buildVisibilitySnapshot('site1', 'test.com', makeSignal());
    assert.equal(snap.site_id, 'site1');
    assert.equal(snap.domain, 'test.com');
  });

  it('sets date as YYYY-MM-DD', () => {
    const snap = buildVisibilitySnapshot('site1', 'test.com', makeSignal());
    assert.match(snap.date, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('combined_score from signal', () => {
    const snap = buildVisibilitySnapshot('site1', 'test.com', makeSignal({ combined_score: 42 }));
    assert.equal(snap.combined_score, 42);
  });

  it('perplexity_rate from signal', () => {
    const snap = buildVisibilitySnapshot('site1', 'test.com', makeSignal({ perplexity_citation_rate: 0.55 }));
    assert.equal(snap.perplexity_rate, 0.55);
  });

  it('google_aio_rate from signal', () => {
    const snap = buildVisibilitySnapshot('site1', 'test.com', makeSignal({ google_aio_citation_rate: 0.33 }));
    assert.equal(snap.google_aio_rate, 0.33);
  });

  it('total_citations from signal', () => {
    const snap = buildVisibilitySnapshot('site1', 'test.com', makeSignal({ total_citations: 7 }));
    assert.equal(snap.total_citations, 7);
  });

  it('new_citations is 0 when no previous', () => {
    const snap = buildVisibilitySnapshot('site1', 'test.com', makeSignal({ total_citations: 5 }));
    assert.equal(snap.new_citations, 0);
  });

  it('lost_citations is 0 when no previous', () => {
    const snap = buildVisibilitySnapshot('site1', 'test.com', makeSignal({ total_citations: 5 }));
    assert.equal(snap.lost_citations, 0);
  });

  it('new_citations computed from previous', () => {
    const prev: AIVisibilitySnapshot = {
      snapshot_id: 'prev-1', site_id: 'site1', domain: 'test.com',
      date: '2026-01-01', combined_score: 20, perplexity_rate: 0.2,
      google_aio_rate: 0.1, total_citations: 3, new_citations: 0, lost_citations: 0,
    };
    const snap = buildVisibilitySnapshot('site1', 'test.com', makeSignal({ total_citations: 7 }), prev);
    assert.equal(snap.new_citations, 4);
  });

  it('lost_citations computed from previous', () => {
    const prev: AIVisibilitySnapshot = {
      snapshot_id: 'prev-1', site_id: 'site1', domain: 'test.com',
      date: '2026-01-01', combined_score: 20, perplexity_rate: 0.2,
      google_aio_rate: 0.1, total_citations: 10, new_citations: 0, lost_citations: 0,
    };
    const snap = buildVisibilitySnapshot('site1', 'test.com', makeSignal({ total_citations: 6 }), prev);
    assert.equal(snap.lost_citations, 4);
  });

  it('never throws on bad inputs', () => {
    const snap = buildVisibilitySnapshot('', '', null as unknown as UnifiedAISignal);
    assert.ok(snap);
    assert.equal(typeof snap.combined_score, 'number');
  });
});

// ── simulateVisibilityHistory ────────────────────────────────────────────────

describe('simulateVisibilityHistory', () => {
  it('returns correct number of days', () => {
    const history = simulateVisibilityHistory('site1', 'test.com', 30);
    assert.equal(history.length, 30);
  });

  it('each snapshot has required fields', () => {
    const history = simulateVisibilityHistory('site1', 'test.com', 5);
    for (const snap of history) {
      assert.ok(snap.snapshot_id);
      assert.equal(snap.site_id, 'site1');
      assert.equal(snap.domain, 'test.com');
      assert.match(snap.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof snap.combined_score, 'number');
      assert.equal(typeof snap.perplexity_rate, 'number');
      assert.equal(typeof snap.google_aio_rate, 'number');
      assert.equal(typeof snap.total_citations, 'number');
    }
  });

  it('scores improve over time on average', () => {
    const history = simulateVisibilityHistory('site1', 'test.com', 30);
    const firstAvg = history.slice(0, 5).reduce((s, h) => s + h.combined_score, 0) / 5;
    const lastAvg = history.slice(-5).reduce((s, h) => s + h.combined_score, 0) / 5;
    assert.ok(lastAvg > firstAvg, `last avg ${lastAvg} should exceed first avg ${firstAvg}`);
  });

  it('scores stay within 0-100', () => {
    const history = simulateVisibilityHistory('site1', 'test.com', 60);
    for (const snap of history) {
      assert.ok(snap.combined_score >= 0);
      assert.ok(snap.combined_score <= 100);
    }
  });

  it('rates stay within 0-1', () => {
    const history = simulateVisibilityHistory('site1', 'test.com', 30);
    for (const snap of history) {
      assert.ok(snap.perplexity_rate >= 0 && snap.perplexity_rate <= 1);
      assert.ok(snap.google_aio_rate >= 0 && snap.google_aio_rate <= 1);
    }
  });

  it('deterministic for same domain', () => {
    const a = simulateVisibilityHistory('site1', 'test.com', 10);
    const b = simulateVisibilityHistory('site1', 'test.com', 10);
    for (let i = 0; i < 10; i++) {
      assert.equal(a[i].combined_score, b[i].combined_score);
    }
  });

  it('different domains produce different scores', () => {
    const a = simulateVisibilityHistory('site1', 'alpha.com', 10);
    const b = simulateVisibilityHistory('site1', 'beta.com', 10);
    const same = a.every((s, i) => s.combined_score === b[i].combined_score);
    assert.ok(!same, 'different domains should produce different scores');
  });

  it('returns empty array on zero days', () => {
    const history = simulateVisibilityHistory('site1', 'test.com', 0);
    assert.equal(history.length, 0);
  });

  it('never throws on empty domain', () => {
    const history = simulateVisibilityHistory('site1', '', 5);
    assert.ok(Array.isArray(history));
  });
});

// ── computeVisibilityTrend ───────────────────────────────────────────────────

describe('computeVisibilityTrend', () => {
  it('returns stable for fewer than 7 snapshots', () => {
    const history = simulateVisibilityHistory('site1', 'test.com', 5);
    assert.equal(computeVisibilityTrend(history), 'stable');
  });

  it('returns improving when scores rise', () => {
    const history: AIVisibilitySnapshot[] = [];
    for (let i = 0; i < 14; i++) {
      history.push({
        snapshot_id: `snap-${i}`, site_id: 'site1', domain: 'test.com',
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        combined_score: 10 + i * 5, perplexity_rate: 0.1, google_aio_rate: 0.1,
        total_citations: 1, new_citations: 0, lost_citations: 0,
      });
    }
    assert.equal(computeVisibilityTrend(history), 'improving');
  });

  it('returns declining when scores drop', () => {
    const history: AIVisibilitySnapshot[] = [];
    for (let i = 0; i < 14; i++) {
      history.push({
        snapshot_id: `snap-${i}`, site_id: 'site1', domain: 'test.com',
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        combined_score: 80 - i * 5, perplexity_rate: 0.1, google_aio_rate: 0.1,
        total_citations: 1, new_citations: 0, lost_citations: 0,
      });
    }
    assert.equal(computeVisibilityTrend(history), 'declining');
  });

  it('returns stable when scores flat', () => {
    const history: AIVisibilitySnapshot[] = [];
    for (let i = 0; i < 14; i++) {
      history.push({
        snapshot_id: `snap-${i}`, site_id: 'site1', domain: 'test.com',
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        combined_score: 50, perplexity_rate: 0.1, google_aio_rate: 0.1,
        total_citations: 1, new_citations: 0, lost_citations: 0,
      });
    }
    assert.equal(computeVisibilityTrend(history), 'stable');
  });

  it('never throws on null input', () => {
    const trend = computeVisibilityTrend(null as unknown as AIVisibilitySnapshot[]);
    assert.equal(trend, 'stable');
  });

  it('never throws on empty array', () => {
    const trend = computeVisibilityTrend([]);
    assert.equal(trend, 'stable');
  });
});
