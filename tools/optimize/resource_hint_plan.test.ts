/**
 * tools/optimize/resource_hint_plan.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPreconnectTag,
  buildDnsPrefetchTag,
  generateResourceHintPlan,
  CROSSORIGIN_DOMAINS,
} from './resource_hint_plan.ts';
import type { ResourceHintSignals } from '../detect/resource_hint_detect.ts';

function emptySignals(): ResourceHintSignals {
  return {
    external_domains:    [],
    has_preconnect:      [],
    has_dns_prefetch:    [],
    missing_preconnect:  [],
    missing_dns_prefetch: [],
    needs_hints:         false,
  };
}

const PAGE_URL = 'https://mystore.myshopify.com/products/shoes';

// ── buildPreconnectTag ────────────────────────────────────────────────────────

describe('buildPreconnectTag', () => {
  it('builds a basic preconnect tag', () => {
    const tag = buildPreconnectTag('www.googletagmanager.com');
    assert.equal(tag, '<link rel="preconnect" href="https://www.googletagmanager.com">');
  });

  it('adds crossorigin for font domains (fonts.googleapis.com)', () => {
    const tag = buildPreconnectTag('fonts.googleapis.com');
    assert.ok(tag.includes('crossorigin'));
  });

  it('adds crossorigin for fonts.gstatic.com', () => {
    assert.ok(buildPreconnectTag('fonts.gstatic.com').includes('crossorigin'));
  });

  it('adds crossorigin for use.typekit.net', () => {
    assert.ok(buildPreconnectTag('use.typekit.net').includes('crossorigin'));
  });

  it('adds crossorigin for fast.fonts.net', () => {
    assert.ok(buildPreconnectTag('fast.fonts.net').includes('crossorigin'));
  });

  it('does NOT add crossorigin for non-font domains', () => {
    const tag = buildPreconnectTag('cdn.shopify.com');
    assert.ok(!tag.includes('crossorigin'));
  });
});

// ── buildDnsPrefetchTag ───────────────────────────────────────────────────────

describe('buildDnsPrefetchTag', () => {
  it('builds a dns-prefetch tag with protocol-relative href', () => {
    const tag = buildDnsPrefetchTag('fonts.gstatic.com');
    assert.equal(tag, '<link rel="dns-prefetch" href="//fonts.gstatic.com">');
  });

  it('never adds crossorigin to dns-prefetch', () => {
    assert.ok(!buildDnsPrefetchTag('fonts.googleapis.com').includes('crossorigin'));
  });
});

// ── CROSSORIGIN_DOMAINS ───────────────────────────────────────────────────────

describe('CROSSORIGIN_DOMAINS', () => {
  it('contains the 4 expected font domains', () => {
    const expected = [
      'fonts.googleapis.com', 'fonts.gstatic.com', 'use.typekit.net', 'fast.fonts.net',
    ];
    for (const d of expected) {
      assert.ok(CROSSORIGIN_DOMAINS.has(d), `Missing: ${d}`);
    }
  });
});

// ── generateResourceHintPlan ──────────────────────────────────────────────────

describe('generateResourceHintPlan', () => {
  it('returns empty plan when no missing hints', () => {
    const plan = generateResourceHintPlan(emptySignals(), PAGE_URL);
    assert.equal(plan.entries.length, 0);
    assert.equal(plan.insert_html, '');
    assert.equal(plan.domain_count, 0);
    assert.equal(plan.url, PAGE_URL);
  });

  it('generates preconnect entry for missing_preconnect domain', () => {
    const signals = { ...emptySignals(), missing_preconnect: ['www.googletagmanager.com'], needs_hints: true };
    const plan = generateResourceHintPlan(signals, PAGE_URL);
    assert.ok(plan.entries.some((e) => e.hint_type === 'preconnect' && e.domain === 'www.googletagmanager.com'));
  });

  it('generates dns-prefetch entry for missing_dns_prefetch domain', () => {
    const signals = { ...emptySignals(), missing_dns_prefetch: ['connect.facebook.net'], needs_hints: true };
    const plan = generateResourceHintPlan(signals, PAGE_URL);
    assert.ok(plan.entries.some((e) => e.hint_type === 'dns-prefetch' && e.domain === 'connect.facebook.net'));
  });

  it('entry for font domain has crossorigin=true', () => {
    const signals = { ...emptySignals(), missing_preconnect: ['fonts.googleapis.com'], needs_hints: true };
    const plan = generateResourceHintPlan(signals, PAGE_URL);
    const entry = plan.entries.find((e) => e.domain === 'fonts.googleapis.com');
    assert.ok(entry?.crossorigin);
  });

  it('entry for non-font domain has crossorigin=false', () => {
    const signals = { ...emptySignals(), missing_preconnect: ['cdn.shopify.com'], needs_hints: true };
    const plan = generateResourceHintPlan(signals, PAGE_URL);
    const entry = plan.entries.find((e) => e.domain === 'cdn.shopify.com');
    assert.equal(entry?.crossorigin, false);
  });

  it('insert_html contains all tags newline-joined', () => {
    const signals = { ...emptySignals(), missing_preconnect: ['www.googletagmanager.com', 'cdn.shopify.com'], needs_hints: true };
    const plan = generateResourceHintPlan(signals, PAGE_URL);
    assert.ok(plan.insert_html.includes('<link rel="preconnect"'));
    assert.ok(plan.insert_html.includes('www.googletagmanager.com'));
    assert.ok(plan.insert_html.includes('cdn.shopify.com'));
  });

  it('domain_count reflects unique domains', () => {
    const signals = {
      ...emptySignals(),
      missing_preconnect:  ['fonts.googleapis.com', 'cdn.shopify.com'],
      missing_dns_prefetch: ['fonts.googleapis.com', 'cdn.shopify.com'],
      needs_hints: true,
    };
    const plan = generateResourceHintPlan(signals, PAGE_URL);
    assert.equal(plan.domain_count, 2);
  });

  it('description includes domain name', () => {
    const signals = { ...emptySignals(), missing_preconnect: ['static.klaviyo.com'], needs_hints: true };
    const plan = generateResourceHintPlan(signals, PAGE_URL);
    const entry = plan.entries[0];
    assert.ok(entry?.description.includes('static.klaviyo.com'));
  });

  it('description references PRIORITY_DOMAINS label', () => {
    const signals = { ...emptySignals(), missing_preconnect: ['static.klaviyo.com'], needs_hints: true };
    const plan = generateResourceHintPlan(signals, PAGE_URL);
    const entry = plan.entries[0];
    assert.ok(entry?.description.includes('Klaviyo'));
  });

  it('handles multiple domains across both hint types', () => {
    const signals = {
      ...emptySignals(),
      missing_preconnect:  ['www.googletagmanager.com', 'connect.facebook.net'],
      missing_dns_prefetch: ['www.google-analytics.com'],
      needs_hints: true,
    };
    const plan = generateResourceHintPlan(signals, PAGE_URL);
    assert.equal(plan.entries.length, 3);
    assert.equal(plan.domain_count, 3);
  });

  it('never throws on malformed input', () => {
    assert.doesNotThrow(() =>
      generateResourceHintPlan(null as unknown as ResourceHintSignals, PAGE_URL),
    );
  });
});
