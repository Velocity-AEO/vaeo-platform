/**
 * tools/aeo/speakable_generator.test.ts
 *
 * Tests for speakable schema generator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSpeakable, type SpeakableConfig } from './speakable_generator.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const productConfig: SpeakableConfig = {
  url:              'https://example.com/products/blue-widget',
  page_title:       'Blue Widget - Premium Quality',
  meta_description: 'Buy our premium blue widget. Durable, affordable, ships free.',
  h1:               'Blue Widget',
  body_text:        'Our blue widget is the best on the market. Made from premium materials.',
  page_type:        'product',
};

const articleConfig: SpeakableConfig = {
  url:              'https://example.com/blog/how-to-use-widgets',
  page_title:       'How to Use Widgets Effectively',
  meta_description: 'Learn the best techniques for using widgets in your daily workflow.',
  h1:               'How to Use Widgets Effectively',
  body_text:        'Widgets are versatile tools. In this guide we cover the fundamentals.',
  page_type:        'article',
};

const pageConfig: SpeakableConfig = {
  url:              'https://example.com/about',
  page_title:       'About Us',
  meta_description: 'Learn about our company and mission.',
  h1:               'About Our Company',
  body_text:        'We are a leading provider of widgets.',
  page_type:        'page',
};

// ── Schema structure ─────────────────────────────────────────────────────────

describe('generateSpeakable — schema structure', () => {
  it('generates valid SpeakableSpecification schema', async () => {
    const result = await generateSpeakable(productConfig);
    assert.equal(result.speakable_schema['@context'], 'https://schema.org');
    assert.equal(result.speakable_schema['@type'], 'WebPage');
    const speakable = result.speakable_schema['speakable'] as Record<string, unknown>;
    assert.equal(speakable['@type'], 'SpeakableSpecification');
    assert.ok(Array.isArray(speakable['cssSelector']));
  });

  it('includes page name from title', async () => {
    const result = await generateSpeakable(productConfig);
    assert.equal(result.speakable_schema['name'], 'Blue Widget - Premium Quality');
  });

  it('falls back to h1 when title is empty', async () => {
    const config = { ...productConfig, page_title: '' };
    const result = await generateSpeakable(config);
    assert.equal(result.speakable_schema['name'], 'Blue Widget');
  });

  it('includes url in schema', async () => {
    const result = await generateSpeakable(productConfig);
    assert.equal(result.speakable_schema['url'], productConfig.url);
  });
});

// ── CSS selectors ────────────────────────────────────────────────────────────

describe('generateSpeakable — CSS selectors', () => {
  it('includes title and meta description selectors', async () => {
    const result = await generateSpeakable(productConfig);
    assert.ok(result.css_selectors.includes('title'));
    assert.ok(result.css_selectors.includes('meta[name=description]'));
  });

  it('includes product-specific selector for product pages', async () => {
    const result = await generateSpeakable(productConfig);
    assert.ok(result.css_selectors.some((s) => s.includes('product-description') || s.includes('product__description')));
  });

  it('includes article-specific selector for article pages', async () => {
    const result = await generateSpeakable(articleConfig);
    assert.ok(result.css_selectors.some((s) => s.includes('article')));
  });

  it('always includes h2 selector', async () => {
    const result = await generateSpeakable(pageConfig);
    assert.ok(result.css_selectors.includes('h2'));
  });
});

// ── XPath selectors ──────────────────────────────────────────────────────────

describe('generateSpeakable — XPath selectors', () => {
  it('generates xpath for each css selector', async () => {
    const result = await generateSpeakable(productConfig);
    assert.equal(result.xpath_selectors.length, result.css_selectors.length);
  });

  it('includes //title xpath', async () => {
    const result = await generateSpeakable(productConfig);
    assert.ok(result.xpath_selectors.includes('//title'));
  });
});

// ── Liquid snippet ───────────────────────────────────────────────────────────

describe('generateSpeakable — liquid snippet', () => {
  it('generates valid Liquid snippet with JSON-LD', async () => {
    const result = await generateSpeakable(productConfig);
    assert.ok(result.liquid_snippet.includes('application/ld+json'));
    assert.ok(result.liquid_snippet.includes('SpeakableSpecification'));
    assert.ok(result.liquid_snippet.includes('VAEO'));
  });
});

// ── Confidence ───────────────────────────────────────────────────────────────

describe('generateSpeakable — confidence', () => {
  it('returns 0.9 confidence for product pages', async () => {
    const result = await generateSpeakable(productConfig);
    assert.equal(result.confidence, 0.9);
  });

  it('returns 0.9 confidence for article pages', async () => {
    const result = await generateSpeakable(articleConfig);
    assert.equal(result.confidence, 0.9);
  });

  it('returns 0.7 confidence for generic pages', async () => {
    const result = await generateSpeakable(pageConfig);
    assert.equal(result.confidence, 0.7);
  });
});

// ── AI integration ───────────────────────────────────────────────────────────

describe('generateSpeakable — AI', () => {
  it('uses AI reasoning when callAI provided', async () => {
    const result = await generateSpeakable(productConfig, {
      callAI: async () => 'AI-generated reasoning about speakable content.',
    });
    assert.equal(result.reasoning, 'AI-generated reasoning about speakable content.');
  });

  it('falls back to default reasoning when AI fails', async () => {
    const result = await generateSpeakable(productConfig, {
      callAI: async () => { throw new Error('API error'); },
    });
    assert.ok(result.reasoning.length > 0);
    assert.ok(result.reasoning.includes('product'));
  });

  it('uses default reasoning when no callAI', async () => {
    const result = await generateSpeakable(productConfig);
    assert.ok(result.reasoning.length > 0);
  });
});
