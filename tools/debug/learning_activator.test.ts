/**
 * tools/debug/learning_activator.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPatternKey,
  activateLearning,
  type LearningRecord,
} from './learning_activator.ts';

// ── buildPatternKey ───────────────────────────────────────────────────────────

describe('buildPatternKey', () => {
  it('returns issue_type::hostname format', () => {
    const key = buildPatternKey('title_missing', 'https://cococabanalife.com/products/shoes');
    assert.equal(key, 'title_missing::cococabanalife.com');
  });

  it('lowercases the hostname', () => {
    const key = buildPatternKey('schema_missing', 'https://MyStore.MyShopify.COM/page');
    assert.equal(key, 'schema_missing::mystore.myshopify.com');
  });

  it('falls back to ::unknown for invalid URL', () => {
    const key = buildPatternKey('title_missing', 'not-a-url');
    assert.equal(key, 'title_missing::unknown');
  });

  it('falls back to ::unknown for empty URL', () => {
    const key = buildPatternKey('meta_missing', '');
    assert.equal(key, 'meta_missing::unknown');
  });

  it('never throws', () => {
    assert.doesNotThrow(() =>
      buildPatternKey(null as unknown as string, null as unknown as string),
    );
  });
});

// ── activateLearning ──────────────────────────────────────────────────────────

describe('activateLearning', () => {
  const SITE = 'site-001';
  const URL  = 'https://mystore.myshopify.com/products/shoes';

  it('returns written=false when no writeLearning dep provided', async () => {
    const r = await activateLearning(SITE, 'title_missing', URL, true, 5, 0.7);
    assert.equal(r.written, false);
    assert.ok(!r.error);
  });

  it('returns pattern_key even without writeLearning', async () => {
    const r = await activateLearning(SITE, 'title_missing', URL, true, 5, 0.7);
    assert.equal(r.pattern_key, 'title_missing::mystore.myshopify.com');
  });

  it('confidence_delta is +0.05 on success (capped)', async () => {
    const r = await activateLearning(SITE, 'title_missing', URL, true, 5, 0.7);
    assert.ok(Math.abs(r.confidence_delta - 0.05) < 0.0001);
  });

  it('confidence_delta is -0.10 on failure (floored)', async () => {
    const r = await activateLearning(SITE, 'title_missing', URL, false, 0, 0.7);
    assert.ok(Math.abs(r.confidence_delta - (-0.10)) < 0.0001);
  });

  it('confidence_delta caps at 0 when base score near 0 and failing', async () => {
    const r = await activateLearning(SITE, 'title_missing', URL, false, 0, 0.05);
    // base=0.05, delta=-0.10, clamped=0.0, so effective delta = 0.0 - 0.05 = -0.05
    assert.ok(r.confidence_delta >= -0.10);
  });

  it('confidence_delta caps at 1.0 when base score near 1 and succeeding', async () => {
    const r = await activateLearning(SITE, 'title_missing', URL, true, 5, 0.99);
    // base=0.99+0.05 > 1.0 → clamped to 1.0; delta = 1.0 - 0.99 = 0.01
    assert.ok(r.confidence_delta <= 0.05);
  });

  it('calls writeLearning with a correctly shaped LearningRecord', async () => {
    let captured: LearningRecord | null = null;
    await activateLearning(SITE, 'schema_missing', URL, true, 5, 0.8,
      '<p>before</p>', '<script type="application/ld+json">{}</script>',
      { writeLearning: async (r) => { captured = r; return 'lr-001'; } },
    );
    assert.ok(captured);
    assert.equal(captured!.site_id, SITE);
    assert.equal(captured!.issue_type, 'schema_missing');
    assert.equal(captured!.url, URL);
    assert.equal(captured!.fix_applied, true);
    assert.equal(captured!.health_delta, 5);
    assert.equal(captured!.confidence_score, 0.8);
    assert.equal(captured!.before_value, '<p>before</p>');
    assert.ok(captured!.created_at.length > 0);
  });

  it('returns written=true and learning_id when writeLearning succeeds', async () => {
    const r = await activateLearning(SITE, 'title_missing', URL, true, 5, 0.7,
      undefined, undefined,
      { writeLearning: async () => 'lr-999' },
    );
    assert.equal(r.written, true);
    assert.equal(r.learning_id, 'lr-999');
  });

  it('returns written=false with error when writeLearning throws', async () => {
    const r = await activateLearning(SITE, 'title_missing', URL, true, 5, 0.7,
      undefined, undefined,
      { writeLearning: async () => { throw new Error('DB down'); } },
    );
    assert.equal(r.written, false);
    assert.ok(r.error?.includes('DB down'));
  });

  it('before_value and after_value default to null when not provided', async () => {
    let captured: LearningRecord | null = null;
    await activateLearning(SITE, 'title_missing', URL, true, 5, 0.7,
      undefined, undefined,
      { writeLearning: async (r) => { captured = r; return 'lr-001'; } },
    );
    assert.equal(captured!.before_value, null);
    assert.equal(captured!.after_value, null);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      activateLearning(
        null as unknown as string,
        null as unknown as string,
        null as unknown as string,
        true, 0, 0,
      ),
    );
  });
});
