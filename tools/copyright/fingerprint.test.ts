/**
 * tools/copyright/fingerprint.test.ts
 *
 * Tests for content fingerprint model.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFingerprint,
  buildFingerprintBatch,
  simulateFingerprints,
} from './fingerprint.js';

const SAMPLE = 'Our organic cotton collection is ethically sourced from certified farms. Each garment undergoes rigorous quality testing to ensure lasting comfort and sustainability.';

// ── buildFingerprint ─────────────────────────────────────────────────────────

describe('buildFingerprint — content_hash', () => {
  it('sets content_hash as sha256 hex', () => {
    const fp = buildFingerprint('s1', 'https://x.com/p', SAMPLE);
    assert.equal(fp.content_hash.length, 64);
  });

  it('same content produces same hash', () => {
    const a = buildFingerprint('s1', 'https://x.com/a', SAMPLE);
    const b = buildFingerprint('s1', 'https://x.com/b', SAMPLE);
    assert.equal(a.content_hash, b.content_hash);
  });

  it('different content produces different hash', () => {
    const a = buildFingerprint('s1', 'https://x.com/a', 'hello');
    const b = buildFingerprint('s1', 'https://x.com/b', 'world');
    assert.notEqual(a.content_hash, b.content_hash);
  });
});

describe('buildFingerprint — content_preview', () => {
  it('max 200 chars', () => {
    const long = 'A'.repeat(500);
    const fp = buildFingerprint('s1', 'https://x.com/p', long);
    assert.equal(fp.content_preview.length, 200);
  });

  it('preserves short content', () => {
    const fp = buildFingerprint('s1', 'https://x.com/p', 'short');
    assert.equal(fp.content_preview, 'short');
  });
});

describe('buildFingerprint — word_count', () => {
  it('counts words correctly', () => {
    const fp = buildFingerprint('s1', 'https://x.com/p', 'one two three four five');
    assert.equal(fp.word_count, 5);
  });

  it('zero for empty content', () => {
    const fp = buildFingerprint('s1', 'https://x.com/p', '');
    assert.equal(fp.word_count, 0);
  });
});

describe('buildFingerprint — key_phrases', () => {
  it('returns up to 5 phrases', () => {
    const fp = buildFingerprint('s1', 'https://x.com/p', SAMPLE);
    assert.equal(fp.key_phrases.length, 5);
  });

  it('phrases contain multiple words', () => {
    const fp = buildFingerprint('s1', 'https://x.com/p', SAMPLE);
    for (const phrase of fp.key_phrases) {
      assert.ok(phrase.includes(' '));
    }
  });
});

describe('buildFingerprint — metadata', () => {
  it('sets fingerprint_id', () => {
    const fp = buildFingerprint('s1', 'https://x.com/p', SAMPLE);
    assert.ok(fp.fingerprint_id.length > 0);
  });

  it('sets fingerprinted_at to ISO', () => {
    const fp = buildFingerprint('s1', 'https://x.com/p', SAMPLE);
    assert.ok(fp.fingerprinted_at.includes('T'));
  });

  it('uses provided page_type', () => {
    const fp = buildFingerprint('s1', 'https://x.com/p', SAMPLE, 'product');
    assert.equal(fp.page_type, 'product');
  });

  it('defaults page_type to unknown', () => {
    const fp = buildFingerprint('s1', 'https://x.com/p', SAMPLE);
    assert.equal(fp.page_type, 'unknown');
  });
});

// ── buildFingerprintBatch ────────────────────────────────────────────────────

describe('buildFingerprintBatch', () => {
  it('length matches input', () => {
    const batch = buildFingerprintBatch('s1', [
      { url: 'https://x.com/a', content: 'hello world example text' },
      { url: 'https://x.com/b', content: 'another page content here' },
    ]);
    assert.equal(batch.length, 2);
  });

  it('handles empty input', () => {
    const batch = buildFingerprintBatch('s1', []);
    assert.equal(batch.length, 0);
  });
});

// ── simulateFingerprints ─────────────────────────────────────────────────────

describe('simulateFingerprints', () => {
  it('default count is 10', () => {
    const fps = simulateFingerprints('s1', 'example.com');
    assert.equal(fps.length, 10);
  });

  it('deterministic from domain', () => {
    const a = simulateFingerprints('s1', 'test.com', 5);
    const b = simulateFingerprints('s1', 'test.com', 5);
    assert.deepEqual(a.map((f) => f.content_hash), b.map((f) => f.content_hash));
  });

  it('never throws on empty domain', () => {
    const fps = simulateFingerprints('s1', '');
    assert.ok(Array.isArray(fps));
  });
});

// ── Never throws ─────────────────────────────────────────────────────────────

describe('buildFingerprint — never throws', () => {
  it('handles empty content', () => {
    const fp = buildFingerprint('s1', 'https://x.com/p', '');
    assert.ok(fp.fingerprint_id);
  });
});
