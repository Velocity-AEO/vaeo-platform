/**
 * tools/wordpress/wp_apply.test.ts
 *
 * Tests for WordPress apply engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWPFix,
  applyAllWPFixes,
  type WPApplyDeps,
  type WPApplyResult,
} from './wp_apply.js';
import type { WPIssue } from './wp_detect.js';
import type { WPCredentials } from './wp_adapter.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const creds: WPCredentials = {
  siteUrl:     'https://example.com',
  username:    'admin',
  appPassword: 'xxxx xxxx xxxx',
};

function mockDeps(overrides?: Partial<WPApplyDeps>): Partial<WPApplyDeps> {
  return {
    updatePost:        async () => {},
    injectSnippet:     async () => {},
    lookupPostId:      async () => 42,
    getPostContent:    async () => '<p>Hello <img src="/hero.jpg"> world</p>',
    updatePostContent: async () => {},
    ...overrides,
  };
}

// ── Schema fixes ─────────────────────────────────────────────────────────────

describe('applyWPFix — schema', () => {
  it('injects schema snippet for SCHEMA_MISSING', async () => {
    let snippetName = '';
    let snippetContent = '';
    const deps = mockDeps({
      injectSnippet: async (_creds, name, content) => {
        snippetName = name;
        snippetContent = content;
      },
    });

    const issue: WPIssue = {
      issue_type: 'SCHEMA_MISSING',
      url:        'https://example.com/about/',
      element:    '',
      fix_hint:   'Add structured data',
      category:   'schema',
    };

    const result = await applyWPFix(issue, creds, deps);
    assert.equal(result.success, true);
    assert.equal(result.action, 'inject_schema_snippet');
    assert.ok(snippetName.includes('schema'));
    assert.ok(snippetContent.includes('application/ld+json'));
    assert.ok(snippetContent.includes('wp_head'));
  });

  it('generates schema with correct URL', async () => {
    let captured = '';
    const deps = mockDeps({
      injectSnippet: async (_c, _n, content) => { captured = content; },
    });

    const issue: WPIssue = {
      issue_type: 'SCHEMA_MISSING',
      url:        'https://example.com/services/',
      element:    '',
      fix_hint:   'Add schema',
      category:   'schema',
    };

    await applyWPFix(issue, creds, deps);
    assert.ok(captured.includes('https://example.com/services/'));
  });
});

// ── Title/meta fixes ─────────────────────────────────────────────────────────

describe('applyWPFix — title/meta', () => {
  it('updates post meta for TITLE_MISSING', async () => {
    let updatedFields: Record<string, string> = {};
    const deps = mockDeps({
      updatePost: async (_c, _id, fields) => { updatedFields = fields; },
    });

    const issue: WPIssue = {
      issue_type: 'TITLE_MISSING',
      url:        'https://example.com/about-us/',
      element:    '',
      fix_hint:   'Add title',
      category:   'metadata',
    };

    const result = await applyWPFix(issue, creds, deps);
    assert.equal(result.success, true);
    assert.equal(result.action, 'update_post_meta');
    assert.ok(updatedFields['title']);
  });

  it('fails when post not found', async () => {
    const deps = mockDeps({
      lookupPostId: async () => null,
    });

    const issue: WPIssue = {
      issue_type: 'TITLE_MISSING',
      url:        'https://example.com/missing/',
      element:    '',
      fix_hint:   'Add title',
      category:   'metadata',
    };

    const result = await applyWPFix(issue, creds, deps);
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('not found'));
  });
});

// ── Performance fixes ────────────────────────────────────────────────────────

describe('applyWPFix — performance', () => {
  it('generates fix plan for DEFER_SCRIPT', async () => {
    const issue: WPIssue = {
      issue_type: 'DEFER_SCRIPT',
      url:        'https://example.com/',
      element:    '<script src="/app.js">',
      fix_hint:   'Add defer',
      category:   'performance',
    };

    const result = await applyWPFix(issue, creds, mockDeps());
    assert.equal(result.success, true);
    assert.equal(result.action, 'add_defer_attribute');
  });

  it('generates fix plan for LAZY_IMAGE', async () => {
    const issue: WPIssue = {
      issue_type: 'LAZY_IMAGE',
      url:        'https://example.com/',
      element:    '<img src="/hero.jpg" alt="Hero">',
      fix_hint:   'Add loading=lazy',
      category:   'performance',
    };

    const result = await applyWPFix(issue, creds, mockDeps());
    assert.equal(result.success, true);
    assert.equal(result.action, 'add_loading_lazy');
  });
});

// ── Image fixes ──────────────────────────────────────────────────────────────

describe('applyWPFix — images', () => {
  it('updates post content for IMG_MISSING_ALT', async () => {
    let updatedContent = '';
    const deps = mockDeps({
      getPostContent:    async () => '<p>Hello <img src="/hero.jpg"> world</p>',
      updatePostContent: async (_c, _id, content) => { updatedContent = content; },
    });

    const issue: WPIssue = {
      issue_type: 'IMG_MISSING_ALT',
      url:        'https://example.com/page/',
      element:    '<img src="/hero.jpg">',
      fix_hint:   'Add alt',
      category:   'images',
    };

    const result = await applyWPFix(issue, creds, deps);
    assert.equal(result.success, true);
    assert.equal(result.action, 'update_image_attributes');
    assert.ok(updatedContent.includes('alt='));
  });

  it('fails when post content not found', async () => {
    const deps = mockDeps({
      getPostContent: async () => null,
    });

    const issue: WPIssue = {
      issue_type: 'IMG_MISSING_ALT',
      url:        'https://example.com/page/',
      element:    '<img src="/hero.jpg">',
      fix_hint:   'Add alt',
      category:   'images',
    };

    const result = await applyWPFix(issue, creds, deps);
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('content'));
  });
});

// ── applyAllWPFixes ──────────────────────────────────────────────────────────

describe('applyAllWPFixes', () => {
  it('applies multiple fixes sequentially', async () => {
    const deps = mockDeps();
    const issues: WPIssue[] = [
      { issue_type: 'SCHEMA_MISSING', url: 'https://example.com/a/', element: '', fix_hint: '', category: 'schema' },
      { issue_type: 'DEFER_SCRIPT', url: 'https://example.com/b/', element: '<script src="/x.js">', fix_hint: '', category: 'performance' },
    ];

    const results = await applyAllWPFixes(issues, creds, deps);
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.success));
  });

  it('returns empty array for empty input', async () => {
    const results = await applyAllWPFixes([], creds, mockDeps());
    assert.equal(results.length, 0);
  });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe('applyWPFix — error handling', () => {
  it('never throws — returns error result', async () => {
    const deps = mockDeps({
      injectSnippet: async () => { throw new Error('Network failure'); },
    });

    const issue: WPIssue = {
      issue_type: 'SCHEMA_MISSING',
      url:        'https://example.com/broken/',
      element:    '',
      fix_hint:   'Add schema',
      category:   'schema',
    };

    const result = await applyWPFix(issue, creds, deps);
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('Network failure'));
  });
});
