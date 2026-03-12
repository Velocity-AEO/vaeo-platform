/**
 * tools/jobs/priority_queue.test.ts
 *
 * Tests for priority scoring, sorting, queue building.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePriorityScore,
  sortByPriority,
  buildPriorityQueue,
  peekNextJob,
  type PriorityQueueItem,
  type PriorityQueueDb,
} from './priority_queue.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW = new Date().toISOString();
const MINUTES_AGO = (m: number) => new Date(Date.now() - m * 60000).toISOString();

function makeItem(overrides: Partial<PriorityQueueItem> = {}): PriorityQueueItem {
  return {
    job_id:      'j-1',
    site_id:     's-1',
    tenant_id:   't-1',
    priority:    'normal',
    enqueued_at: NOW,
    score:       500,
    ...overrides,
  };
}

function makeDb(rows: Array<{ job_id: string; site_id: string; tenant_id: string; priority: 'high' | 'normal' | 'low'; enqueued_at: string; health_score?: number }> = []): PriorityQueueDb {
  return {
    getQueuedJobs: async (tenant_id) => rows.filter((r) => r.tenant_id === tenant_id),
  };
}

// ── calculatePriorityScore ──────────────────────────────────────────────────

describe('calculatePriorityScore', () => {
  it('returns base 1000 for high priority (just enqueued)', () => {
    const score = calculatePriorityScore('high', NOW);
    assert.equal(score, 1000);
  });

  it('returns base 500 for normal priority', () => {
    const score = calculatePriorityScore('normal', NOW);
    assert.equal(score, 500);
  });

  it('returns base 100 for low priority', () => {
    const score = calculatePriorityScore('low', NOW);
    assert.equal(score, 100);
  });

  it('adds age bonus for waiting jobs (10 min = +10)', () => {
    const score = calculatePriorityScore('normal', MINUTES_AGO(15));
    assert.equal(score, 510); // 500 + floor(15/10)*10 = 510
  });

  it('caps age bonus at 200', () => {
    const score = calculatePriorityScore('normal', MINUTES_AGO(500));
    assert.equal(score, 700); // 500 + 200 cap
  });

  it('adds health bonus when score < 40', () => {
    const score = calculatePriorityScore('normal', NOW, 30);
    assert.equal(score, 550); // 500 + 50
  });

  it('no health bonus when score >= 40', () => {
    const score = calculatePriorityScore('normal', NOW, 80);
    assert.equal(score, 500);
  });

  it('combines age bonus and health bonus', () => {
    const score = calculatePriorityScore('low', MINUTES_AGO(25), 20);
    assert.equal(score, 170); // 100 + 20 (age) + 50 (health)
  });
});

// ── sortByPriority ──────────────────────────────────────────────────────────

describe('sortByPriority', () => {
  it('sorts by score descending', () => {
    const items = [
      makeItem({ job_id: 'j1', score: 100 }),
      makeItem({ job_id: 'j2', score: 500 }),
      makeItem({ job_id: 'j3', score: 1000 }),
    ];
    const sorted = sortByPriority(items);
    assert.equal(sorted[0]!.job_id, 'j3');
    assert.equal(sorted[1]!.job_id, 'j2');
    assert.equal(sorted[2]!.job_id, 'j1');
  });

  it('stable sort: earlier enqueued first on tie', () => {
    const items = [
      makeItem({ job_id: 'j1', score: 500, enqueued_at: MINUTES_AGO(5) }),
      makeItem({ job_id: 'j2', score: 500, enqueued_at: MINUTES_AGO(10) }),
    ];
    const sorted = sortByPriority(items);
    assert.equal(sorted[0]!.job_id, 'j2'); // older first
  });

  it('returns new array (does not mutate)', () => {
    const items = [makeItem({ score: 100 }), makeItem({ score: 200 })];
    const sorted = sortByPriority(items);
    assert.notEqual(sorted, items);
  });
});

// ── buildPriorityQueue ──────────────────────────────────────────────────────

describe('buildPriorityQueue', () => {
  it('returns sorted queue from db', async () => {
    const db = makeDb([
      { job_id: 'j1', site_id: 's1', tenant_id: 't-1', priority: 'low', enqueued_at: NOW },
      { job_id: 'j2', site_id: 's2', tenant_id: 't-1', priority: 'high', enqueued_at: NOW },
    ]);
    const queue = await buildPriorityQueue('t-1', db);
    assert.equal(queue.length, 2);
    assert.equal(queue[0]!.job_id, 'j2'); // high first
  });

  it('returns empty array on db error', async () => {
    const db: PriorityQueueDb = {
      getQueuedJobs: async () => { throw new Error('db fail'); },
    };
    const queue = await buildPriorityQueue('t-1', db);
    assert.equal(queue.length, 0);
  });

  it('filters by tenant_id', async () => {
    const db = makeDb([
      { job_id: 'j1', site_id: 's1', tenant_id: 't-1', priority: 'normal', enqueued_at: NOW },
      { job_id: 'j2', site_id: 's2', tenant_id: 't-2', priority: 'normal', enqueued_at: NOW },
    ]);
    const queue = await buildPriorityQueue('t-1', db);
    assert.equal(queue.length, 1);
    assert.equal(queue[0]!.tenant_id, 't-1');
  });
});

// ── peekNextJob ─────────────────────────────────────────────────────────────

describe('peekNextJob', () => {
  it('returns highest-score job', async () => {
    const db = makeDb([
      { job_id: 'j1', site_id: 's1', tenant_id: 't-1', priority: 'low', enqueued_at: NOW },
      { job_id: 'j2', site_id: 's2', tenant_id: 't-1', priority: 'high', enqueued_at: NOW },
    ]);
    const next = await peekNextJob('t-1', db);
    assert.equal(next?.job_id, 'j2');
  });

  it('returns null when queue is empty', async () => {
    const db = makeDb([]);
    const next = await peekNextJob('t-1', db);
    assert.equal(next, null);
  });
});
