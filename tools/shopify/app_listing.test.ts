/**
 * tools/shopify/app_listing.test.ts
 *
 * Tests for Shopify App Store listing copy generator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_LISTING,
  generateListingMarkdown,
  generateListingJson,
} from './app_listing.js';

// ── APP_LISTING structure ────────────────────────────────────────────────────

describe('APP_LISTING', () => {
  it('has correct app_name', () => {
    assert.equal(APP_LISTING.app_name, 'Velocity AEO');
  });

  it('has a tagline', () => {
    assert.ok(APP_LISTING.tagline.length > 10);
  });

  it('has a multi-sentence description', () => {
    assert.ok(APP_LISTING.description.length > 100);
    assert.ok(APP_LISTING.description.includes('SEO'));
  });

  it('has exactly 5 key benefits', () => {
    assert.equal(APP_LISTING.key_benefits.length, 5);
  });

  it('key benefits mention core features', () => {
    const joined = APP_LISTING.key_benefits.join(' ').toLowerCase();
    assert.ok(joined.includes('title'));
    assert.ok(joined.includes('schema'));
    assert.ok(joined.includes('health score'));
  });

  it('has exactly 3 how_it_works sections', () => {
    assert.equal(APP_LISTING.how_it_works.length, 3);
    assert.equal(APP_LISTING.how_it_works[0].title, 'Connect');
    assert.equal(APP_LISTING.how_it_works[1].title, 'Review');
    assert.equal(APP_LISTING.how_it_works[2].title, 'Deploy');
  });

  it('has exactly 5 FAQs', () => {
    assert.equal(APP_LISTING.faqs.length, 5);
  });

  it('each FAQ has question and answer', () => {
    for (const faq of APP_LISTING.faqs) {
      assert.ok(faq.question.length > 5);
      assert.ok(faq.answer.length > 20);
    }
  });

  it('has support email', () => {
    assert.equal(APP_LISTING.support_email, 'support@velocityaeo.com');
  });

  it('has privacy policy URL', () => {
    assert.ok(APP_LISTING.privacy_policy_url.includes('/privacy'));
  });
});

// ── generateListingMarkdown ──────────────────────────────────────────────────

describe('generateListingMarkdown', () => {
  it('starts with app name heading', () => {
    const md = generateListingMarkdown();
    assert.ok(md.startsWith('# Velocity AEO'));
  });

  it('includes tagline', () => {
    const md = generateListingMarkdown();
    assert.ok(md.includes(APP_LISTING.tagline));
  });

  it('includes key benefits as bullet points', () => {
    const md = generateListingMarkdown();
    for (const benefit of APP_LISTING.key_benefits) {
      assert.ok(md.includes(`- ${benefit}`));
    }
  });

  it('includes FAQ section', () => {
    const md = generateListingMarkdown();
    assert.ok(md.includes('## FAQ'));
    for (const faq of APP_LISTING.faqs) {
      assert.ok(md.includes(faq.question));
    }
  });

  it('includes support email', () => {
    const md = generateListingMarkdown();
    assert.ok(md.includes('support@velocityaeo.com'));
  });
});

// ── generateListingJson ──────────────────────────────────────────────────────

describe('generateListingJson', () => {
  it('returns valid JSON', () => {
    const json = generateListingJson();
    const parsed = JSON.parse(json);
    assert.equal(parsed.app_name, 'Velocity AEO');
  });

  it('is formatted with indentation', () => {
    const json = generateListingJson();
    assert.ok(json.includes('\n'));
    assert.ok(json.includes('  '));
  });

  it('round-trips all fields', () => {
    const parsed = JSON.parse(generateListingJson());
    assert.equal(parsed.key_benefits.length, 5);
    assert.equal(parsed.how_it_works.length, 3);
    assert.equal(parsed.faqs.length, 5);
  });
});
