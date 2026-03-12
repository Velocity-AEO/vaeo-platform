/**
 * tools/detect/aeo_detect.test.ts
 *
 * Tests for AEO issue detector.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectAEOIssues, type AEOIssue } from './aeo_detect.js';

const URL = 'https://example.com/page';

// ── SPEAKABLE_MISSING ────────────────────────────────────────────────────────

describe('detectAEOIssues — SPEAKABLE_MISSING', () => {
  it('flags missing speakable schema', async () => {
    const html = '<html><head></head><body><p>Hello world</p></body></html>';
    const issues = await detectAEOIssues(html, URL, 'page');
    const sp = issues.find((i) => i.issue_type === 'SPEAKABLE_MISSING');
    assert.ok(sp);
    assert.equal(sp!.severity, 8);
  });

  it('does not flag when speakable schema exists', async () => {
    const html = `<html><head>
      <script type="application/ld+json">{"speakable":{"@type":"SpeakableSpecification","cssSelector":[".main"]}}</script>
    </head><body></body></html>`;
    const issues = await detectAEOIssues(html, URL, 'page');
    const sp = issues.find((i) => i.issue_type === 'SPEAKABLE_MISSING');
    assert.equal(sp, undefined);
  });
});

// ── AEO_SCHEMA_INCOMPLETE ────────────────────────────────────────────────────

describe('detectAEOIssues — AEO_SCHEMA_INCOMPLETE', () => {
  it('flags speakable without selectors', async () => {
    const html = `<html><head>
      <script type="application/ld+json">{"speakable":{"@type":"SpeakableSpecification"}}</script>
    </head><body></body></html>`;
    const issues = await detectAEOIssues(html, URL, 'page');
    const inc = issues.find((i) => i.issue_type === 'AEO_SCHEMA_INCOMPLETE');
    assert.ok(inc);
    assert.equal(inc!.severity, 7);
  });

  it('does not flag when speakable has cssSelector', async () => {
    const html = `<html><head>
      <script type="application/ld+json">{"speakable":{"@type":"SpeakableSpecification","cssSelector":[".content"]}}</script>
    </head><body></body></html>`;
    const issues = await detectAEOIssues(html, URL, 'page');
    const inc = issues.find((i) => i.issue_type === 'AEO_SCHEMA_INCOMPLETE');
    assert.equal(inc, undefined);
  });

  it('does not flag when speakable has xpath', async () => {
    const html = `<html><head>
      <script type="application/ld+json">{"speakable":{"@type":"SpeakableSpecification","xpath":["//article"]}}</script>
    </head><body></body></html>`;
    const issues = await detectAEOIssues(html, URL, 'page');
    const inc = issues.find((i) => i.issue_type === 'AEO_SCHEMA_INCOMPLETE');
    assert.equal(inc, undefined);
  });
});

// ── FAQ_OPPORTUNITY ──────────────────────────────────────────────────────────

describe('detectAEOIssues — FAQ_OPPORTUNITY', () => {
  it('flags FAQ content without FAQPage schema', async () => {
    const html = '<html><head></head><body><h3>How much does it cost?</h3><p>It depends on options.</p></body></html>';
    const issues = await detectAEOIssues(html, URL, 'page');
    const faq = issues.find((i) => i.issue_type === 'FAQ_OPPORTUNITY');
    assert.ok(faq);
    assert.equal(faq!.severity, 6);
  });

  it('does not flag FAQ content when FAQPage schema exists', async () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[]}</script>
    </head><body><h3>How much does it cost?</h3><p>It depends.</p></body></html>`;
    const issues = await detectAEOIssues(html, URL, 'page');
    const faq = issues.find((i) => i.issue_type === 'FAQ_OPPORTUNITY');
    assert.equal(faq, undefined);
  });

  it('flags dt/dd content without schema', async () => {
    const html = '<html><head></head><body><dl><dt>What is X?</dt><dd>X is a thing.</dd></dl></body></html>';
    const issues = await detectAEOIssues(html, URL, 'page');
    const faq = issues.find((i) => i.issue_type === 'FAQ_OPPORTUNITY');
    assert.ok(faq);
  });
});

// ── ANSWER_BLOCK_OPPORTUNITY ─────────────────────────────────────────────────

describe('detectAEOIssues — ANSWER_BLOCK_OPPORTUNITY', () => {
  it('flags answer block patterns', async () => {
    const html = '<html><body><h2>How to Build a Widget</h2><ol><li>Step 1</li><li>Step 2</li></ol></body></html>';
    const issues = await detectAEOIssues(html, URL, 'article');
    const ab = issues.find((i) => i.issue_type === 'ANSWER_BLOCK_OPPORTUNITY');
    assert.ok(ab);
    assert.equal(ab!.severity, 5);
    assert.ok(ab!.opportunity);
  });

  it('does not flag clean content', async () => {
    const html = '<html><body><p>Simple paragraph.</p></body></html>';
    const issues = await detectAEOIssues(html, URL, 'page');
    const ab = issues.find((i) => i.issue_type === 'ANSWER_BLOCK_OPPORTUNITY');
    assert.equal(ab, undefined);
  });
});

// ── Sorting & edge cases ─────────────────────────────────────────────────────

describe('detectAEOIssues — sorting', () => {
  it('sorts by severity descending', async () => {
    const html = `<html><head></head><body>
      <h3>How much does it cost?</h3><p>It depends on the model.</p>
      <h2>How to Build a Widget</h2><ol><li>Step 1</li><li>Step 2</li></ol>
    </body></html>`;
    const issues = await detectAEOIssues(html, URL, 'page');
    for (let i = 1; i < issues.length; i++) {
      assert.ok(issues[i - 1].severity >= issues[i].severity);
    }
  });

  it('returns empty for fully optimized page', async () => {
    const html = `<html><head>
      <script type="application/ld+json">{"speakable":{"cssSelector":[".main"]},"@type":"FAQPage","mainEntity":[]}</script>
    </head><body><p>Simple optimized content.</p></body></html>`;
    const issues = await detectAEOIssues(html, URL, 'page');
    assert.equal(issues.length, 0);
  });
});

describe('detectAEOIssues — @graph support', () => {
  it('detects speakable in @graph', async () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@graph":[{"@type":"SpeakableSpecification","cssSelector":[".article"]}]}</script>
    </head><body></body></html>`;
    const issues = await detectAEOIssues(html, URL, 'page');
    const sp = issues.find((i) => i.issue_type === 'SPEAKABLE_MISSING');
    assert.equal(sp, undefined);
  });

  it('detects FAQPage in @graph', async () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@graph":[{"@type":"FAQPage"}]}</script>
    </head><body><h3>What is this?</h3><p>Answer here.</p></body></html>`;
    const issues = await detectAEOIssues(html, URL, 'page');
    const faq = issues.find((i) => i.issue_type === 'FAQ_OPPORTUNITY');
    assert.equal(faq, undefined);
  });
});
