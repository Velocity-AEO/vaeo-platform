/**
 * tools/optimize/timestamp_plan.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planTimestampFixes, type TimestampPlan } from './timestamp_plan.ts';
import type { TimestampSignals } from '../detect/timestamp_detect.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

const REF = new Date('2026-03-11T12:00:00.000Z');

function noSignals(): TimestampSignals {
  return {
    has_jsonld_date_modified:  false,
    has_og_modified_time:      false,
    has_jsonld_date_published: false,
    needs_injection:           true,
  };
}

function fullSignals(dateModified: string, ogModified: string): TimestampSignals {
  return {
    has_jsonld_date_modified:  true,
    has_og_modified_time:      true,
    has_jsonld_date_published: false,
    current_date_modified:     dateModified,
    current_og_modified_time:  ogModified,
    needs_injection:           false,
  };
}

// ISO within last 2 days relative to REF
const FRESH  = '2026-03-10T12:00:00Z';
// ISO 30 days before REF (stale)
const STALE  = '2026-02-09T12:00:00Z';

// ── basic plan shape ──────────────────────────────────────────────────────────

describe('planTimestampFixes — plan shape', () => {
  it('returns site_id, url, fixes, timestamp', () => {
    const plan = planTimestampFixes('s1', 'https://ex.com/', '', noSignals(), REF);
    assert.equal(plan.site_id, 's1');
    assert.equal(plan.url, 'https://ex.com/');
    assert.ok(Array.isArray(plan.fixes));
    assert.ok(typeof plan.timestamp === 'string');
  });

  it('timestamp is ISO 8601 without milliseconds', () => {
    const plan = planTimestampFixes('s1', 'https://ex.com/', '', noSignals(), REF);
    assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(plan.timestamp));
  });

  it('new_value matches timestamp', () => {
    const plan = planTimestampFixes('s1', 'https://ex.com/', '', noSignals(), REF);
    for (const fix of plan.fixes) {
      assert.equal(fix.new_value, plan.timestamp);
    }
  });

  it('never throws on empty signals', () => {
    assert.doesNotThrow(() => planTimestampFixes('s', 'http://x.com', '', noSignals()));
  });
});

// ── inject fixes ──────────────────────────────────────────────────────────────

describe('planTimestampFixes — inject fixes', () => {
  it('generates inject_jsonld_date_modified when JSON-LD signal missing', () => {
    const plan = planTimestampFixes('s1', 'https://ex.com/', '', noSignals(), REF);
    const fix  = plan.fixes.find((f) => f.type === 'inject_jsonld_date_modified');
    assert.ok(fix, 'inject_jsonld_date_modified fix expected');
    assert.equal(fix!.target, 'jsonld');
  });

  it('generates inject_og_modified_time when OG signal missing', () => {
    const plan = planTimestampFixes('s1', 'https://ex.com/', '', noSignals(), REF);
    const fix  = plan.fixes.find((f) => f.type === 'inject_og_modified_time');
    assert.ok(fix, 'inject_og_modified_time fix expected');
    assert.equal(fix!.target, 'og');
  });

  it('generates two fixes when both signals missing', () => {
    const plan = planTimestampFixes('s1', 'https://ex.com/', '', noSignals(), REF);
    assert.equal(plan.fixes.length, 2);
  });

  it('inject fix has no current_value', () => {
    const plan = planTimestampFixes('s1', 'https://ex.com/', '', noSignals(), REF);
    for (const fix of plan.fixes) {
      assert.equal(fix.current_value, undefined);
    }
  });
});

// ── update fixes (stale signals) ──────────────────────────────────────────────

describe('planTimestampFixes — update fixes for stale signals', () => {
  it('generates update_jsonld_date_modified for stale JSON-LD value', () => {
    const signals: TimestampSignals = {
      has_jsonld_date_modified:  true,
      has_og_modified_time:      false,
      has_jsonld_date_published: false,
      current_date_modified:     STALE,
      needs_injection:           true,
    };
    const plan = planTimestampFixes('s1', 'https://ex.com/', '', signals, REF);
    const fix  = plan.fixes.find((f) => f.type === 'update_jsonld_date_modified');
    assert.ok(fix);
    assert.equal(fix!.current_value, STALE);
    assert.equal(fix!.target, 'jsonld');
  });

  it('generates update_og_modified_time for stale OG value', () => {
    const signals: TimestampSignals = {
      has_jsonld_date_modified:  false,
      has_og_modified_time:      true,
      has_jsonld_date_published: false,
      current_og_modified_time:  STALE,
      needs_injection:           true,
    };
    const plan = planTimestampFixes('s1', 'https://ex.com/', '', signals, REF);
    const fix  = plan.fixes.find((f) => f.type === 'update_og_modified_time');
    assert.ok(fix);
    assert.equal(fix!.current_value, STALE);
  });

  it('includes current_value in update fix', () => {
    const signals: TimestampSignals = {
      has_jsonld_date_modified:  true,
      has_og_modified_time:      true,
      has_jsonld_date_published: false,
      current_date_modified:     STALE,
      current_og_modified_time:  STALE,
      needs_injection:           false,
    };
    const plan = planTimestampFixes('s1', 'https://ex.com/', '', signals, REF);
    assert.equal(plan.fixes.length, 2);
    for (const fix of plan.fixes) {
      assert.equal(fix.current_value, STALE);
    }
  });
});

// ── no fix when fresh ─────────────────────────────────────────────────────────

describe('planTimestampFixes — no fix when signals are fresh', () => {
  it('generates no fixes when both signals are recent', () => {
    const plan = planTimestampFixes('s1', 'https://ex.com/', '', fullSignals(FRESH, FRESH), REF);
    assert.equal(plan.fixes.length, 0);
  });

  it('generates only OG fix when JSON-LD is fresh but OG is stale', () => {
    const signals: TimestampSignals = {
      has_jsonld_date_modified:  true,
      has_og_modified_time:      true,
      has_jsonld_date_published: false,
      current_date_modified:     FRESH,
      current_og_modified_time:  STALE,
      needs_injection:           false,
    };
    const plan = planTimestampFixes('s1', 'https://ex.com/', '', signals, REF);
    assert.equal(plan.fixes.length, 1);
    assert.equal(plan.fixes[0]!.type, 'update_og_modified_time');
  });

  it('treats malformed date as stale', () => {
    const signals: TimestampSignals = {
      has_jsonld_date_modified:  true,
      has_og_modified_time:      true,
      has_jsonld_date_published: false,
      current_date_modified:     'not-a-date',
      current_og_modified_time:  'also-bad',
      needs_injection:           false,
    };
    const plan = planTimestampFixes('s1', 'https://ex.com/', '', signals, REF);
    assert.equal(plan.fixes.length, 2);
  });

  it('generates only JSON-LD fix when OG is fresh but JSON-LD is stale', () => {
    const signals: TimestampSignals = {
      has_jsonld_date_modified:  true,
      has_og_modified_time:      true,
      has_jsonld_date_published: false,
      current_date_modified:     STALE,
      current_og_modified_time:  FRESH,
      needs_injection:           false,
    };
    const plan = planTimestampFixes('s1', 'https://ex.com/', '', signals, REF);
    assert.equal(plan.fixes.length, 1);
    assert.equal(plan.fixes[0]!.type, 'update_jsonld_date_modified');
  });
});
