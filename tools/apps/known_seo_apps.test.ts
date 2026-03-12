/**
 * tools/apps/known_seo_apps.test.ts
 *
 * Tests for known SEO apps catalog, savings, and ROI.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWN_SEO_APPS,
  findKnownApp,
  calculateMonthlySavings,
  generateROIStatement,
} from './known_seo_apps.js';

// ── KNOWN_SEO_APPS catalog ───────────────────────────────────────────────────

describe('KNOWN_SEO_APPS', () => {
  it('has exactly 10 apps', () => {
    assert.equal(KNOWN_SEO_APPS.length, 10);
  });

  it('every app has required fields', () => {
    for (const app of KNOWN_SEO_APPS) {
      assert.ok(app.name.length > 0);
      assert.ok(app.category.length > 0);
      assert.ok(app.what_vaeo_replaces.length > 0);
      assert.ok(typeof app.estimated_monthly_cost_usd === 'number');
      assert.ok(app.notes.length > 0);
    }
  });

  it('includes SEO Manager', () => {
    assert.ok(KNOWN_SEO_APPS.some((a) => a.name === 'SEO Manager'));
  });

  it('includes JSON-LD for SEO', () => {
    assert.ok(KNOWN_SEO_APPS.some((a) => a.name === 'JSON-LD for SEO'));
  });
});

// ── findKnownApp ─────────────────────────────────────────────────────────────

describe('findKnownApp', () => {
  it('finds app by exact name', () => {
    const app = findKnownApp('SEO Manager');
    assert.ok(app);
    assert.equal(app.name, 'SEO Manager');
    assert.equal(app.category, 'seo');
  });

  it('finds app case-insensitively', () => {
    const app = findKnownApp('seo manager');
    assert.ok(app);
    assert.equal(app.name, 'SEO Manager');
  });

  it('returns null for unknown app', () => {
    const app = findKnownApp('Unknown App XYZ');
    assert.equal(app, null);
  });

  it('returns null for empty string', () => {
    assert.equal(findKnownApp(''), null);
  });
});

// ── calculateMonthlySavings ──────────────────────────────────────────────────

describe('calculateMonthlySavings', () => {
  it('returns 0 for empty array', () => {
    assert.equal(calculateMonthlySavings([]), 0);
  });

  it('sums costs of replaced apps', () => {
    const apps = KNOWN_SEO_APPS.filter((a) => a.name === 'SEO Manager' || a.name === 'Smart SEO');
    assert.equal(calculateMonthlySavings(apps), 30); // 20 + 10
  });

  it('includes free apps without error', () => {
    const apps = KNOWN_SEO_APPS.filter((a) => a.estimated_monthly_cost_usd === 0);
    assert.equal(calculateMonthlySavings(apps), 0);
  });
});

// ── generateROIStatement ─────────────────────────────────────────────────────

describe('generateROIStatement', () => {
  it('generates statement when VAEO costs more', () => {
    const apps = [KNOWN_SEO_APPS[0]]; // SEO Manager $20
    const stmt = generateROIStatement(apps, 49);
    assert.ok(stmt.includes('replaced 1 app'));
    assert.ok(stmt.includes('$20/month'));
    assert.ok(stmt.includes('costs $29/month more'));
    assert.ok(stmt.includes('automated execution'));
  });

  it('generates statement when VAEO saves money', () => {
    const apps = KNOWN_SEO_APPS.slice(0, 5); // $20+$10+$14+$9+$7 = $60
    const stmt = generateROIStatement(apps, 49);
    assert.ok(stmt.includes('replaced 5 apps'));
    assert.ok(stmt.includes('saves you $11/month'));
  });

  it('handles single app plural correctly', () => {
    const stmt = generateROIStatement([KNOWN_SEO_APPS[0]], 49);
    assert.ok(stmt.includes('1 app saving'));
    assert.ok(!stmt.includes('1 apps'));
  });

  it('handles multiple apps plural correctly', () => {
    const stmt = generateROIStatement(KNOWN_SEO_APPS.slice(0, 3), 49);
    assert.ok(stmt.includes('3 apps'));
  });
});
