/**
 * tools/aeo/faq_generator.test.ts
 *
 * Tests for FAQ schema generator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractFAQFromHTML,
  generateFAQWithAI,
  buildFAQSchema,
  type FAQItem,
  type FAQResult,
} from './faq_generator.js';

const URL = 'https://example.com/page';

// ── extractFAQFromHTML ───────────────────────────────────────────────────────

describe('extractFAQFromHTML — dt/dd', () => {
  it('extracts dt/dd FAQ pairs', async () => {
    const html = '<dl><dt>What is a widget?</dt><dd>A widget is a useful device for solving problems.</dd></dl>';
    const items = await extractFAQFromHTML(html, URL);
    assert.equal(items.length, 1);
    assert.equal(items[0].question, 'What is a widget?');
    assert.ok(items[0].answer.includes('widget'));
    assert.equal(items[0].source_selector, 'dt/dd');
  });

  it('extracts multiple dt/dd pairs', async () => {
    const html = `<dl>
      <dt>What is X?</dt><dd>X is a thing that does something useful and important.</dd>
      <dt>How does Y work?</dt><dd>Y works by processing input data into output results.</dd>
    </dl>`;
    const items = await extractFAQFromHTML(html, URL);
    assert.equal(items.length, 2);
  });
});

describe('extractFAQFromHTML — h3+p', () => {
  it('extracts question-like H3 headings with answers', async () => {
    const html = '<h3>What is our return policy?</h3><p>We offer a 30-day return policy on all items purchased from our store.</p>';
    const items = await extractFAQFromHTML(html, URL);
    assert.ok(items.length >= 1);
    assert.ok(items[0].question.includes('return policy'));
  });

  it('skips non-question H3 headings', async () => {
    const html = '<h3>Our Team Members</h3><p>We have a great team of professionals.</p>';
    const items = await extractFAQFromHTML(html, URL);
    assert.equal(items.length, 0);
  });
});

describe('extractFAQFromHTML — limits', () => {
  it('returns max 10 items', async () => {
    let html = '<dl>';
    for (let i = 0; i < 15; i++) {
      html += `<dt>Question number ${i} about something?</dt><dd>This is a detailed answer for question number ${i}.</dd>`;
    }
    html += '</dl>';
    const items = await extractFAQFromHTML(html, URL);
    assert.ok(items.length <= 10);
  });

  it('deduplicates by question text', async () => {
    const html = `<dl>
      <dt>What is X?</dt><dd>X is a thing that does something very important.</dd>
      <dt>What is X?</dt><dd>X is also described as another type of thing.</dd>
    </dl>`;
    const items = await extractFAQFromHTML(html, URL);
    assert.equal(items.length, 1);
  });

  it('returns empty for no FAQ patterns', async () => {
    const html = '<html><body><p>Just a paragraph with no questions.</p></body></html>';
    const items = await extractFAQFromHTML(html, URL);
    assert.equal(items.length, 0);
  });
});

// ── generateFAQWithAI ────────────────────────────────────────────────────────

describe('generateFAQWithAI', () => {
  it('returns AI-generated FAQs', async () => {
    const items = await generateFAQWithAI(
      { url: URL, page_title: 'Blue Widget', body_text: 'Our blue widget is great.', page_type: 'product' },
      { callAI: async () => JSON.stringify([
        { question: 'What is a blue widget?', answer: 'A premium widget in blue color.' },
        { question: 'How much does it cost?', answer: 'See the product page for pricing.' },
      ]) },
    );
    assert.equal(items.length, 2);
    assert.ok(items[0].question.includes('blue widget'));
  });

  it('falls back to defaults when AI fails', async () => {
    const items = await generateFAQWithAI(
      { url: URL, page_title: 'Widget', body_text: 'Content', page_type: 'product' },
      { callAI: async () => { throw new Error('API error'); } },
    );
    assert.ok(items.length >= 3);
  });

  it('generates defaults when no callAI', async () => {
    const items = await generateFAQWithAI(
      { url: URL, page_title: 'Widget', body_text: 'Some body text', page_type: 'product' },
    );
    assert.ok(items.length >= 3);
    assert.ok(items[0].question.includes('Widget'));
  });
});

// ── buildFAQSchema ───────────────────────────────────────────────────────────

describe('buildFAQSchema — HTML extraction', () => {
  it('uses HTML items when 3+ found', async () => {
    const html = `<dl>
      <dt>What is Q1?</dt><dd>Answer 1 is a detailed response to the first question.</dd>
      <dt>How does Q2 work?</dt><dd>Answer 2 explains how this mechanism works in detail.</dd>
      <dt>Can I use Q3?</dt><dd>Answer 3 provides guidance on usage of this particular feature.</dd>
    </dl>`;
    const result = await buildFAQSchema(URL, html, { page_title: 'Test', body_text: '', page_type: 'page' });
    assert.equal(result.extracted_from, 'html');
    assert.equal(result.confidence, 0.9);
    assert.equal(result.faq_items.length, 3);
  });
});

describe('buildFAQSchema — AI supplementation', () => {
  it('supplements with AI when <3 HTML items', async () => {
    const html = '<dl><dt>What is X?</dt><dd>X is a very useful thing that we provide to customers.</dd></dl>';
    const result = await buildFAQSchema(URL, html,
      { page_title: 'Test', body_text: 'Some content', page_type: 'product' },
    );
    assert.equal(result.extracted_from, 'hybrid');
    assert.equal(result.confidence, 0.75);
    assert.ok(result.faq_items.length >= 3);
  });

  it('uses AI-only when no HTML items', async () => {
    const html = '<html><body><p>No FAQ content here at all.</p></body></html>';
    const result = await buildFAQSchema(URL, html,
      { page_title: 'Product', body_text: 'Content', page_type: 'product' },
    );
    assert.equal(result.extracted_from, 'ai');
    assert.equal(result.confidence, 0.6);
  });
});

describe('buildFAQSchema — schema output', () => {
  it('generates valid FAQPage schema', async () => {
    const html = '<html><body></body></html>';
    const result = await buildFAQSchema(URL, html,
      { page_title: 'Test', body_text: 'Content', page_type: 'page' },
    );
    assert.equal(result.schema['@context'], 'https://schema.org');
    assert.equal(result.schema['@type'], 'FAQPage');
    const mainEntity = result.schema['mainEntity'] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(mainEntity));
    assert.equal(mainEntity[0]['@type'], 'Question');
  });

  it('generates Liquid snippet', async () => {
    const result = await buildFAQSchema(URL, '', { page_title: 'T', body_text: 'B', page_type: 'page' });
    assert.ok(result.liquid_snippet.includes('application/ld+json'));
    assert.ok(result.liquid_snippet.includes('FAQPage'));
    assert.ok(result.liquid_snippet.includes('VAEO'));
  });

  it('sets url on result', async () => {
    const result = await buildFAQSchema(URL, '', { page_title: 'T', body_text: 'B', page_type: 'page' });
    assert.equal(result.url, URL);
  });
});
