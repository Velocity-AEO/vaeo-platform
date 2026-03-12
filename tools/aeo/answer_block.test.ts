/**
 * tools/aeo/answer_block.test.ts
 *
 * Tests for answer block detector and injector.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectAnswerOpportunities,
  injectAnswerSchema,
  type AnswerOpportunity,
} from './answer_block.js';

const URL = 'https://example.com/page';

// ── detectAnswerOpportunities — definitions ──────────────────────────────────

describe('detectAnswerOpportunities — definition', () => {
  it('detects "What is" patterns', async () => {
    const html = '<html><body><p>What is a widget? A widget is a device used for automation.</p></body></html>';
    const opps = await detectAnswerOpportunities(html, URL, 'page');
    const def = opps.find((o) => o.opportunity_type === 'definition');
    assert.ok(def);
    assert.equal(def!.recommended_schema, 'DefinedTerm');
  });

  it('detects "defined as" patterns', async () => {
    const html = '<html><body><p>A sprocket is defined as a toothed wheel that engages a chain.</p></body></html>';
    const opps = await detectAnswerOpportunities(html, URL, 'page');
    const def = opps.find((o) => o.opportunity_type === 'definition');
    assert.ok(def);
  });
});

// ── detectAnswerOpportunities — how_to ───────────────────────────────────────

describe('detectAnswerOpportunities — how_to', () => {
  it('detects "How to" headings', async () => {
    const html = '<html><body><h2>How to Build a Widget</h2><p>Step 1: gather materials.</p></body></html>';
    const opps = await detectAnswerOpportunities(html, URL, 'article');
    const howTo = opps.find((o) => o.opportunity_type === 'how_to');
    assert.ok(howTo);
    assert.equal(howTo!.recommended_schema, 'HowTo');
  });

  it('detects ordered lists', async () => {
    const html = '<html><body><ol><li>First step</li><li>Second step</li></ol></body></html>';
    const opps = await detectAnswerOpportunities(html, URL, 'article');
    const howTo = opps.find((o) => o.opportunity_type === 'how_to');
    assert.ok(howTo);
  });
});

// ── detectAnswerOpportunities — list ─────────────────────────────────────────

describe('detectAnswerOpportunities — list', () => {
  it('detects unordered lists with 3+ items', async () => {
    const html = '<html><body><ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul></body></html>';
    const opps = await detectAnswerOpportunities(html, URL, 'page');
    const list = opps.find((o) => o.opportunity_type === 'list');
    assert.ok(list);
    assert.equal(list!.recommended_schema, 'ItemList');
  });

  it('detects "Top X" headings', async () => {
    const html = '<html><body><h2>Top 10 Best Widgets for Your Home</h2><p>Here are our picks.</p></body></html>';
    const opps = await detectAnswerOpportunities(html, URL, 'article');
    const list = opps.find((o) => o.opportunity_type === 'list');
    assert.ok(list);
  });
});

// ── detectAnswerOpportunities — comparison ───────────────────────────────────

describe('detectAnswerOpportunities — comparison', () => {
  it('detects "vs" patterns', async () => {
    const html = '<html><body><h2>Widget A vs Widget B</h2><p>Let us compare these two products.</p></body></html>';
    const opps = await detectAnswerOpportunities(html, URL, 'article');
    const comp = opps.find((o) => o.opportunity_type === 'comparison');
    assert.ok(comp);
  });

  it('detects tables', async () => {
    const html = '<html><body><table><tr><td>Feature</td><td>A</td><td>B</td></tr></table></body></html>';
    const opps = await detectAnswerOpportunities(html, URL, 'page');
    const comp = opps.find((o) => o.opportunity_type === 'comparison');
    assert.ok(comp);
  });
});

// ── detectAnswerOpportunities — faq ──────────────────────────────────────────

describe('detectAnswerOpportunities — faq', () => {
  it('detects question marks in headings', async () => {
    const html = '<html><body><h3>How much does it cost?</h3><p>It depends.</p></body></html>';
    const opps = await detectAnswerOpportunities(html, URL, 'page');
    const faq = opps.find((o) => o.opportunity_type === 'faq');
    assert.ok(faq);
    assert.equal(faq!.recommended_schema, 'FAQPage');
  });

  it('detects FAQ keyword', async () => {
    const html = '<html><body><h2>Frequently Asked Questions</h2><p>Below are answers.</p></body></html>';
    const opps = await detectAnswerOpportunities(html, URL, 'page');
    const faq = opps.find((o) => o.opportunity_type === 'faq');
    assert.ok(faq);
  });
});

// ── detectAnswerOpportunities — sorting ──────────────────────────────────────

describe('detectAnswerOpportunities — sorting', () => {
  it('sorts by confidence descending', async () => {
    const html = `<html><body>
      <h2>How to fix widgets</h2>
      <ol><li>Step 1</li><li>Step 2</li></ol>
      <p>What is a widget? A widget is defined as a useful device.</p>
    </body></html>`;
    const opps = await detectAnswerOpportunities(html, URL, 'article');
    for (let i = 1; i < opps.length; i++) {
      assert.ok(opps[i - 1].confidence >= opps[i].confidence);
    }
  });

  it('returns empty for clean content with no patterns', async () => {
    const html = '<html><body><p>Just a simple paragraph with no trigger patterns.</p></body></html>';
    const opps = await detectAnswerOpportunities(html, URL, 'page');
    assert.equal(opps.length, 0);
  });
});

// ── injectAnswerSchema ───────────────────────────────────────────────────────

describe('injectAnswerSchema — how_to', () => {
  it('injects HowTo schema with steps', async () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    const opp: AnswerOpportunity = {
      url: URL, opportunity_type: 'how_to',
      trigger_phrases: ['How to'], recommended_schema: 'HowTo', confidence: 0.8,
    };
    const result = await injectAnswerSchema(html, opp, { steps: ['Gather materials', 'Assemble parts', 'Test result'] });
    assert.ok(result.html.includes('HowTo'));
    assert.ok(result.html.includes('HowToStep'));
    assert.equal(result.schema_injected['@type'], 'HowTo');
    const steps = result.schema_injected['step'] as Array<Record<string, unknown>>;
    assert.equal(steps.length, 3);
  });
});

describe('injectAnswerSchema — list', () => {
  it('injects ItemList schema', async () => {
    const html = '<html><head></head><body></body></html>';
    const opp: AnswerOpportunity = {
      url: URL, opportunity_type: 'list',
      trigger_phrases: ['Top 5'], recommended_schema: 'ItemList', confidence: 0.7,
    };
    const result = await injectAnswerSchema(html, opp, { items: ['Widget A', 'Widget B', 'Widget C'] });
    assert.equal(result.schema_injected['@type'], 'ItemList');
    assert.equal(result.schema_injected['numberOfItems'], 3);
    assert.ok(result.liquid_snippet.includes('list schema'));
  });
});

describe('injectAnswerSchema — definition', () => {
  it('injects DefinedTerm schema', async () => {
    const html = '<html><head></head><body></body></html>';
    const opp: AnswerOpportunity = {
      url: URL, opportunity_type: 'definition',
      trigger_phrases: ['What is'], recommended_schema: 'DefinedTerm', confidence: 0.6,
    };
    const result = await injectAnswerSchema(html, opp, { definition: 'A widget is a useful device.' });
    assert.equal(result.schema_injected['@type'], 'DefinedTerm');
    assert.equal(result.schema_injected['description'], 'A widget is a useful device.');
  });
});

describe('injectAnswerSchema — html injection', () => {
  it('injects before </head>', async () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    const opp: AnswerOpportunity = {
      url: URL, opportunity_type: 'definition',
      trigger_phrases: [], recommended_schema: 'DefinedTerm', confidence: 0.5,
    };
    const result = await injectAnswerSchema(html, opp, { definition: 'Test' });
    assert.ok(result.html.includes('application/ld+json'));
    // JSON-LD should be before </head>
    const jsonLdPos = result.html.indexOf('application/ld+json');
    const headPos   = result.html.indexOf('</head>');
    assert.ok(jsonLdPos < headPos);
  });
});
