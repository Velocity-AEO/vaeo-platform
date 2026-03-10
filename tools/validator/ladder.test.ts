/**
 * tools/validator/ladder.test.ts
 *
 * Tests for attemptFix — the Minimal-Effort Validator ladder.
 * All Shopify API calls and file writes mocked via injectable LadderDeps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  attemptFix,
  type LadderDeps,
  type SiteRecord,
  type RungName,
} from './ladder.js';
import type { IssueReport } from '../scoring/issue_classifier.js';
import type { SeoFields, ValidationResult } from '../sandbox/liquid_renderer.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SITE: SiteRecord = {
  site_id:   'site-uuid-001',
  tenant_id: 'tenant-uuid-001',
  cms_type:  'shopify',
  site_url:  'https://example.myshopify.com',
};

function makeIssue(overrides: Partial<IssueReport> = {}): IssueReport {
  return {
    url:             'https://example.myshopify.com/products/hat',
    field:           'title',
    issue_type:      'title_missing',
    severity:        'critical',
    current_value:   null,
    char_count:      0,
    points_deducted: 3,
    ...overrides,
  };
}

const GOOD_FIELDS: SeoFields = {
  title:            'Beach Hat | Example Store',
  meta_description: 'Shop our stylish beach hats perfect for summer days at the shore. Free shipping on all orders over fifty dollars today.',
  h1:               ['Beach Hat'],
  canonical:        'https://example.myshopify.com/products/hat',
  schema_json_ld:   ['{"@type":"Product","name":"Beach Hat"}'],
};

const GOOD_VALIDATION: ValidationResult = { pass: true, issues: [] };

const TITLE_STILL_MISSING: ValidationResult = {
  pass: false,
  issues: [{ field: 'title', rule: 'title_missing', severity: 'critical', message: 'Page has no <title> tag', value: null }],
};

const META_STILL_MISSING: ValidationResult = {
  pass: false,
  issues: [{ field: 'meta_description', rule: 'meta_missing', severity: 'major', message: 'Page has no meta description', value: null }],
};

function happyDeps(overrides: Partial<LadderDeps> = {}): LadderDeps {
  return {
    applyToggle:      async () => false,
    applyMetafield:   async () => false,
    applySnippet:     async () => false,
    applyTemplate:    async () => false,
    renderAndExtract: async () => GOOD_FIELDS,
    validateFields:   () => GOOD_VALIDATION,
    ...overrides,
  };
}

// ── Rung 1: toggle ───────────────────────────────────────────────────────────

describe('attemptFix — rung 1: toggle', () => {
  it('returns fixed at toggle when toggle succeeds and proof passes', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyToggle: async () => true,
    }));
    assert.equal(result.status, 'fixed');
    assert.equal(result.rung_used, 'toggle');
    assert.equal(result.proof?.pass, true);
    assert.equal(result.rungs_attempted.length, 1);
    assert.equal(result.rungs_attempted[0].rung, 'toggle');
    assert.equal(result.rungs_attempted[0].applied, true);
  });

  it('skips toggle when applyToggle returns false', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyToggle:    async () => false,
      applyMetafield: async () => true,
    }));
    assert.equal(result.status, 'fixed');
    assert.equal(result.rung_used, 'metafield');
    assert.equal(result.rungs_attempted[0].rung, 'toggle');
    assert.equal(result.rungs_attempted[0].applied, false);
  });

  it('moves past toggle when proof fails', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyToggle: async () => true,
      applyMetafield: async () => true,
      renderAndExtract: async () => ({ ...GOOD_FIELDS, title: null }),
      validateFields: (fields) => {
        if (!fields.title) return TITLE_STILL_MISSING;
        return GOOD_VALIDATION;
      },
    }));
    // Both toggle and metafield applied but proof fails for both (same mock)
    assert.equal(result.status, 'manual_required');
    assert.ok(result.rungs_attempted.length >= 2);
    assert.ok(result.rungs_attempted[0].error?.includes('proof check did not pass'));
  });

  it('handles toggle throw gracefully', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyToggle:    async () => { throw new Error('API 500'); },
      applyMetafield: async () => true,
    }));
    assert.equal(result.status, 'fixed');
    assert.equal(result.rung_used, 'metafield');
    assert.equal(result.rungs_attempted[0].rung, 'toggle');
    assert.equal(result.rungs_attempted[0].applied, false);
    assert.ok(result.rungs_attempted[0].error?.includes('API 500'));
  });
});

// ── Rung 2: metafield ────────────────────────────────────────────────────────

describe('attemptFix — rung 2: metafield', () => {
  it('returns fixed at metafield when toggle skipped', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyMetafield: async () => true,
    }));
    assert.equal(result.status, 'fixed');
    assert.equal(result.rung_used, 'metafield');
    assert.equal(result.rungs_attempted.length, 2); // toggle(skipped) + metafield
  });

  it('records metafield error and continues to snippet', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyMetafield: async () => { throw new Error('metafield write failed'); },
      applySnippet:   async () => true,
    }));
    assert.equal(result.status, 'fixed');
    assert.equal(result.rung_used, 'snippet');
    assert.ok(result.rungs_attempted[1].error?.includes('metafield write failed'));
  });
});

// ── Rung 3: snippet ──────────────────────────────────────────────────────────

describe('attemptFix — rung 3: snippet', () => {
  it('returns fixed at snippet when earlier rungs skip', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applySnippet: async () => true,
    }));
    assert.equal(result.status, 'fixed');
    assert.equal(result.rung_used, 'snippet');
    assert.equal(result.rungs_attempted.length, 3); // toggle + metafield + snippet
  });

  it('snippet proof failure moves to template', async () => {
    let callCount = 0;
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applySnippet:  async () => true,
      applyTemplate: async () => true,
      renderAndExtract: async () => {
        callCount++;
        // First call (snippet proof): title still missing
        // Second call (template proof): title present
        if (callCount === 1) return { ...GOOD_FIELDS, title: null };
        return GOOD_FIELDS;
      },
      validateFields: (fields) => {
        if (!fields.title) return TITLE_STILL_MISSING;
        return GOOD_VALIDATION;
      },
    }));
    assert.equal(result.status, 'fixed');
    assert.equal(result.rung_used, 'template');
  });
});

// ── Rung 4: template ─────────────────────────────────────────────────────────

describe('attemptFix — rung 4: template', () => {
  it('returns fixed at template when all earlier rungs skip', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyTemplate: async () => true,
    }));
    assert.equal(result.status, 'fixed');
    assert.equal(result.rung_used, 'template');
    assert.equal(result.rungs_attempted.length, 4);
  });

  it('template proof failure → manual_required', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyTemplate: async () => true,
      renderAndExtract: async () => ({ ...GOOD_FIELDS, title: null }),
      validateFields: () => TITLE_STILL_MISSING,
    }));
    assert.equal(result.status, 'manual_required');
    assert.equal(result.rung_used, undefined);
  });
});

// ── Full ladder exhaustion ───────────────────────────────────────────────────

describe('attemptFix — full ladder exhaustion', () => {
  it('returns manual_required when all rungs return false', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps());
    assert.equal(result.status, 'manual_required');
    assert.equal(result.rung_used, undefined);
    assert.equal(result.proof, undefined);
    assert.equal(result.rungs_attempted.length, 4);
    const names = result.rungs_attempted.map((r) => r.rung);
    assert.deepEqual(names, ['toggle', 'metafield', 'snippet', 'template']);
  });

  it('returns manual_required when all rungs throw', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyToggle:    async () => { throw new Error('e1'); },
      applyMetafield: async () => { throw new Error('e2'); },
      applySnippet:   async () => { throw new Error('e3'); },
      applyTemplate:  async () => { throw new Error('e4'); },
    }));
    assert.equal(result.status, 'manual_required');
    assert.equal(result.rungs_attempted.length, 4);
    for (const attempt of result.rungs_attempted) {
      assert.equal(attempt.applied, false);
      assert.ok(attempt.error);
    }
  });

  it('returns manual_required when all rungs apply but proof fails', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyToggle:    async () => true,
      applyMetafield: async () => true,
      applySnippet:   async () => true,
      applyTemplate:  async () => true,
      renderAndExtract: async () => ({ ...GOOD_FIELDS, title: null }),
      validateFields: () => TITLE_STILL_MISSING,
    }));
    assert.equal(result.status, 'manual_required');
    assert.equal(result.rungs_attempted.length, 4);
    for (const attempt of result.rungs_attempted) {
      assert.equal(attempt.applied, true);
      assert.ok(attempt.error?.includes('proof check'));
    }
  });

  it('rungs_attempted records all 4 rung names in order', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps());
    const expected: RungName[] = ['toggle', 'metafield', 'snippet', 'template'];
    assert.deepEqual(result.rungs_attempted.map((r) => r.rung), expected);
  });
});

// ── Proof check — field-specific ─────────────────────────────────────────────

describe('attemptFix — field-specific proof checking', () => {
  it('passes proof when target field is fixed but other fields still have issues', async () => {
    const result = await attemptFix(makeIssue({ field: 'title', issue_type: 'title_missing' }), SITE, happyDeps({
      applyToggle: async () => true,
      renderAndExtract: async () => ({ ...GOOD_FIELDS, meta_description: null }),
      validateFields: () => META_STILL_MISSING, // meta is bad, but title is fine
    }));
    assert.equal(result.status, 'fixed');
    assert.equal(result.rung_used, 'toggle');
    assert.equal(result.proof?.pass, true);
  });

  it('fails proof when target field still has issues', async () => {
    const result = await attemptFix(makeIssue({ field: 'title', issue_type: 'title_missing' }), SITE, happyDeps({
      applyToggle: async () => true,
      renderAndExtract: async () => ({ ...GOOD_FIELDS, title: null }),
      validateFields: () => TITLE_STILL_MISSING,
    }));
    // toggle proof fails, other rungs skip → manual_required
    assert.equal(result.rungs_attempted[0].applied, true);
    assert.ok(result.rungs_attempted[0].error?.includes('proof check'));
  });

  it('proof check for meta_description field', async () => {
    const issue = makeIssue({ field: 'meta_description', issue_type: 'meta_missing' });
    const result = await attemptFix(issue, SITE, happyDeps({
      applyMetafield: async () => true,
      renderAndExtract: async () => GOOD_FIELDS, // meta_description present
      validateFields: () => GOOD_VALIDATION,
    }));
    assert.equal(result.status, 'fixed');
    assert.equal(result.rung_used, 'metafield');
  });

  it('proof check for h1 field', async () => {
    const issue = makeIssue({ field: 'h1', issue_type: 'h1_missing' });
    const result = await attemptFix(issue, SITE, happyDeps({
      applySnippet: async () => true,
      renderAndExtract: async () => GOOD_FIELDS,
      validateFields: () => GOOD_VALIDATION,
    }));
    assert.equal(result.status, 'fixed');
    assert.equal(result.rung_used, 'snippet');
  });

  it('proof check for schema field', async () => {
    const issue = makeIssue({ field: 'schema', issue_type: 'schema_missing' });
    const result = await attemptFix(issue, SITE, happyDeps({
      applySnippet: async () => true,
      renderAndExtract: async () => GOOD_FIELDS,
      validateFields: () => GOOD_VALIDATION,
    }));
    assert.equal(result.status, 'fixed');
    assert.equal(result.rung_used, 'snippet');
  });
});

// ── Proof check — renderAndExtract failure ───────────────────────────────────

describe('attemptFix — proof render failure', () => {
  it('records error and continues to next rung when render throws', async () => {
    let renderCount = 0;
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyToggle: async () => true,
      applyMetafield: async () => true,
      renderAndExtract: async () => {
        renderCount++;
        if (renderCount === 1) throw new Error('render timeout');
        return GOOD_FIELDS;
      },
      validateFields: () => GOOD_VALIDATION,
    }));
    assert.equal(result.status, 'fixed');
    assert.equal(result.rung_used, 'metafield');
    assert.ok(result.rungs_attempted[0].error?.includes('render timeout'));
  });

  it('all render failures → manual_required', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyToggle:    async () => true,
      applyMetafield: async () => true,
      applySnippet:   async () => true,
      applyTemplate:  async () => true,
      renderAndExtract: async () => { throw new Error('render crashed'); },
    }));
    assert.equal(result.status, 'manual_required');
    assert.equal(result.rungs_attempted.length, 4);
    for (const attempt of result.rungs_attempted) {
      assert.equal(attempt.applied, true);
      assert.ok(attempt.error?.includes('render crashed'));
    }
  });
});

// ── Mixed rung outcomes ──────────────────────────────────────────────────────

describe('attemptFix — mixed rung outcomes', () => {
  it('toggle throws, metafield skips, snippet applies and passes', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyToggle:    async () => { throw new Error('toggle err'); },
      applyMetafield: async () => false,
      applySnippet:   async () => true,
    }));
    assert.equal(result.status, 'fixed');
    assert.equal(result.rung_used, 'snippet');
    assert.equal(result.rungs_attempted.length, 3);
    // toggle: error
    assert.ok(result.rungs_attempted[0].error?.includes('toggle err'));
    assert.equal(result.rungs_attempted[0].applied, false);
    // metafield: skipped
    assert.equal(result.rungs_attempted[1].applied, false);
    assert.equal(result.rungs_attempted[1].error, undefined);
    // snippet: applied
    assert.equal(result.rungs_attempted[2].applied, true);
  });

  it('toggle skips, metafield applies but proof fails, snippet applies and passes', async () => {
    let renderCount = 0;
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyMetafield: async () => true,
      applySnippet:   async () => true,
      renderAndExtract: async () => {
        renderCount++;
        if (renderCount === 1) return { ...GOOD_FIELDS, title: null };
        return GOOD_FIELDS;
      },
      validateFields: (fields) => {
        if (!fields.title) return TITLE_STILL_MISSING;
        return GOOD_VALIDATION;
      },
    }));
    assert.equal(result.status, 'fixed');
    assert.equal(result.rung_used, 'snippet');
    assert.equal(result.rungs_attempted[1].applied, true);
    assert.ok(result.rungs_attempted[1].error?.includes('proof check'));
    assert.equal(result.rungs_attempted[2].applied, true);
    assert.equal(result.rungs_attempted[2].error, undefined);
  });
});

// ── Result shape ─────────────────────────────────────────────────────────────

describe('attemptFix — result shape', () => {
  it('fixed result includes proof with fields and validation', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyToggle: async () => true,
    }));
    assert.ok(result.proof);
    assert.ok(result.proof.fields);
    assert.ok('title' in result.proof.fields);
    assert.ok('meta_description' in result.proof.fields);
    assert.ok('h1' in result.proof.fields);
    assert.ok(result.proof.validation);
    assert.equal(result.proof.validation.pass, true);
  });

  it('manual_required result has no proof or rung_used', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps());
    assert.equal(result.status, 'manual_required');
    assert.equal(result.rung_used, undefined);
    assert.equal(result.proof, undefined);
  });

  it('rungs_attempted is always an array', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps());
    assert.ok(Array.isArray(result.rungs_attempted));
  });

  it('each rung attempt has rung name and applied flag', async () => {
    const result = await attemptFix(makeIssue(), SITE, happyDeps({
      applyToggle: async () => true,
    }));
    for (const attempt of result.rungs_attempted) {
      assert.ok(['toggle', 'metafield', 'snippet', 'template'].includes(attempt.rung));
      assert.equal(typeof attempt.applied, 'boolean');
    }
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      attemptFix(makeIssue(), SITE, happyDeps({
        applyToggle:    async () => { throw new Error('e1'); },
        applyMetafield: async () => { throw new Error('e2'); },
        applySnippet:   async () => { throw new Error('e3'); },
        applyTemplate:  async () => { throw new Error('e4'); },
      })),
    );
  });
});

// ── Passes correct args to deps ──────────────────────────────────────────────

describe('attemptFix — deps receive correct arguments', () => {
  it('passes issue and site to each rung', async () => {
    const calls: { rung: string; issue: IssueReport; site: SiteRecord }[] = [];
    const issue = makeIssue();
    await attemptFix(issue, SITE, happyDeps({
      applyToggle:    async (i, s) => { calls.push({ rung: 'toggle', issue: i, site: s }); return false; },
      applyMetafield: async (i, s) => { calls.push({ rung: 'metafield', issue: i, site: s }); return false; },
      applySnippet:   async (i, s) => { calls.push({ rung: 'snippet', issue: i, site: s }); return false; },
      applyTemplate:  async (i, s) => { calls.push({ rung: 'template', issue: i, site: s }); return false; },
    }));
    assert.equal(calls.length, 4);
    for (const call of calls) {
      assert.equal(call.issue.url, issue.url);
      assert.equal(call.site.site_id, SITE.site_id);
    }
  });

  it('passes issue URL to renderAndExtract', async () => {
    let renderedUrl = '';
    const issue = makeIssue({ url: 'https://example.myshopify.com/products/special' });
    await attemptFix(issue, SITE, happyDeps({
      applyToggle: async () => true,
      renderAndExtract: async (url) => { renderedUrl = url; return GOOD_FIELDS; },
    }));
    assert.equal(renderedUrl, 'https://example.myshopify.com/products/special');
  });

  it('stops calling rungs after first successful proof', async () => {
    const called: string[] = [];
    await attemptFix(makeIssue(), SITE, happyDeps({
      applyToggle:    async () => { called.push('toggle'); return true; },
      applyMetafield: async () => { called.push('metafield'); return true; },
      applySnippet:   async () => { called.push('snippet'); return true; },
      applyTemplate:  async () => { called.push('template'); return true; },
    }));
    assert.deepEqual(called, ['toggle']);
  });
});
