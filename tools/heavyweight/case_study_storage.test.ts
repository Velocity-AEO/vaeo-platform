import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  storeCaseStudy,
  getCaseStudy,
  listCaseStudies,
  deleteCaseStudy,
  formatCaseStudyAsMarkdown,
  resetStore,
  getStore,
  type CaseStudyRecord,
} from './case_study_storage.js';
import type { CaseStudy, CaseStudySection, CaseStudyMetrics } from './case_study_generator.js';

function makeMetrics(overrides: Partial<CaseStudyMetrics> = {}): CaseStudyMetrics {
  return {
    performance_before: 38,
    performance_after: 67,
    performance_delta: 29,
    lcp_before_ms: 9800,
    lcp_after_ms: 4200,
    lcp_delta_ms: 5600,
    apps_detected: 3,
    fixes_applied: 3,
    monthly_savings_usd: 20,
    ...overrides,
  };
}

function makeSection(heading: string, body: string): CaseStudySection {
  return {
    heading,
    body,
    data_points: [{ label: 'Score', value: '67' }],
  };
}

function makeCaseStudy(overrides: Partial<CaseStudy> = {}): CaseStudy {
  return {
    site_id: 'site1',
    site_domain: 'example.com',
    generated_at: new Date().toISOString(),
    headline: 'example.com: +29 Lighthouse Points in One VAEO Run',
    subheadline: 'From 38 to 67 performance score with 3 third-party apps running',
    sections: [
      makeSection('The Challenge', 'Site was slow with 3 apps.'),
      makeSection('The Results', 'Score improved by +29 points.'),
    ],
    metrics_snapshot: makeMetrics(),
    pullquote: 'LCP dropped from 9.8s to 4.2s — a 57% improvement.',
    cta: 'Ready to see these results on your store? Start your VAEO trial at vaeo.app',
    shareable_summary: 'example.com improved Lighthouse performance from 38 to 67 (+29 pts) using VAEO.',
    ...overrides,
  };
}

describe('storeCaseStudy', () => {
  beforeEach(() => resetStore());

  it('stores and returns a record with id and version', () => {
    const record = storeCaseStudy(makeCaseStudy());
    assert.equal(record.site_id, 'site1');
    assert.equal(record.version, 1);
    assert.ok(record.id.includes('site1'));
    assert.ok(record.stored_at);
  });

  it('increments version on update', () => {
    storeCaseStudy(makeCaseStudy());
    const r2 = storeCaseStudy(makeCaseStudy());
    assert.equal(r2.version, 2);
    assert.ok(r2.id.includes('v2'));
  });

  it('replaces existing record for same site_id', () => {
    storeCaseStudy(makeCaseStudy());
    storeCaseStudy(makeCaseStudy());
    assert.equal(getStore().records.length, 1);
  });

  it('stores multiple sites independently', () => {
    storeCaseStudy(makeCaseStudy({ site_id: 'a' }));
    storeCaseStudy(makeCaseStudy({ site_id: 'b' }));
    assert.equal(getStore().records.length, 2);
  });
});

describe('getCaseStudy', () => {
  beforeEach(() => resetStore());

  it('returns stored record', () => {
    storeCaseStudy(makeCaseStudy());
    const r = getCaseStudy('site1');
    assert.ok(r);
    assert.equal(r.site_domain, 'example.com');
  });

  it('returns undefined for missing site', () => {
    assert.equal(getCaseStudy('nope'), undefined);
  });
});

describe('listCaseStudies', () => {
  beforeEach(() => resetStore());

  it('returns empty array when no records', () => {
    assert.equal(listCaseStudies().length, 0);
  });

  it('returns all records sorted by stored_at descending', () => {
    storeCaseStudy(makeCaseStudy({ site_id: 'a', site_domain: 'a.com' }));
    storeCaseStudy(makeCaseStudy({ site_id: 'b', site_domain: 'b.com' }));
    const list = listCaseStudies();
    assert.equal(list.length, 2);
    assert.ok(list[0].stored_at >= list[1].stored_at);
  });
});

describe('deleteCaseStudy', () => {
  beforeEach(() => resetStore());

  it('deletes existing record and returns true', () => {
    storeCaseStudy(makeCaseStudy());
    assert.equal(deleteCaseStudy('site1'), true);
    assert.equal(getStore().records.length, 0);
  });

  it('returns false for missing site', () => {
    assert.equal(deleteCaseStudy('nope'), false);
  });
});

describe('formatCaseStudyAsMarkdown', () => {
  it('includes headline as H1', () => {
    const md = formatCaseStudyAsMarkdown(makeCaseStudy());
    assert.ok(md.includes('# example.com: +29'));
  });

  it('includes subheadline in italics', () => {
    const md = formatCaseStudyAsMarkdown(makeCaseStudy());
    assert.ok(md.includes('*From 38 to 67'));
  });

  it('includes section headings as H2', () => {
    const md = formatCaseStudyAsMarkdown(makeCaseStudy());
    assert.ok(md.includes('## The Challenge'));
    assert.ok(md.includes('## The Results'));
  });

  it('includes data points as table', () => {
    const md = formatCaseStudyAsMarkdown(makeCaseStudy());
    assert.ok(md.includes('| Score | 67 |'));
  });

  it('includes pullquote as blockquote', () => {
    const md = formatCaseStudyAsMarkdown(makeCaseStudy());
    assert.ok(md.includes('> LCP dropped'));
  });

  it('includes key metrics table', () => {
    const md = formatCaseStudyAsMarkdown(makeCaseStudy());
    assert.ok(md.includes('| Performance Before | 38 |'));
    assert.ok(md.includes('| Performance After | 67 |'));
    assert.ok(md.includes('| Performance Delta | +29 |'));
  });

  it('includes monthly savings when > 0', () => {
    const md = formatCaseStudyAsMarkdown(makeCaseStudy());
    assert.ok(md.includes('$20/mo'));
  });

  it('omits monthly savings when 0', () => {
    const md = formatCaseStudyAsMarkdown(makeCaseStudy({ metrics_snapshot: makeMetrics({ monthly_savings_usd: 0 }) }));
    assert.ok(!md.includes('Monthly Savings'));
  });

  it('includes shareable summary', () => {
    const md = formatCaseStudyAsMarkdown(makeCaseStudy());
    assert.ok(md.includes('**Share:**'));
    assert.ok(md.includes('VAEO'));
  });

  it('includes CTA', () => {
    const md = formatCaseStudyAsMarkdown(makeCaseStudy());
    assert.ok(md.includes('vaeo.app'));
  });

  it('includes generated timestamp', () => {
    const cs = makeCaseStudy();
    const md = formatCaseStudyAsMarkdown(cs);
    assert.ok(md.includes(cs.generated_at));
  });

  it('handles empty sections', () => {
    const md = formatCaseStudyAsMarkdown(makeCaseStudy({ sections: [] }));
    assert.ok(md.includes('# example.com'));
    assert.ok(md.includes('Key Metrics'));
  });
});
