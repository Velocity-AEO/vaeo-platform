/**
 * tools/billing/plan_definitions.test.ts
 *
 * Tests for plan tier definitions, feature flags, and usage limits.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_DEFINITIONS,
  getPlanLimits,
  isFeatureAllowed,
  isWithinLimit,
  type PlanTier,
} from './plan_definitions.js';

// ── PLAN_DEFINITIONS ─────────────────────────────────────────────────────────

describe('PLAN_DEFINITIONS', () => {
  it('defines all four tiers', () => {
    const tiers: PlanTier[] = ['starter', 'pro', 'agency', 'enterprise'];
    for (const t of tiers) {
      assert.ok(PLAN_DEFINITIONS[t], `missing tier: ${t}`);
    }
  });

  it('starter allows only 1 site', () => {
    assert.equal(PLAN_DEFINITIONS.starter.sites_allowed, 1);
  });

  it('pro allows 5 sites', () => {
    assert.equal(PLAN_DEFINITIONS.pro.sites_allowed, 5);
  });

  it('agency allows 25 sites', () => {
    assert.equal(PLAN_DEFINITIONS.agency.sites_allowed, 25);
  });

  it('enterprise allows 999 sites', () => {
    assert.equal(PLAN_DEFINITIONS.enterprise.sites_allowed, 999);
  });

  it('starter has community support', () => {
    assert.equal(PLAN_DEFINITIONS.starter.support_level, 'community');
  });

  it('pro has email support', () => {
    assert.equal(PLAN_DEFINITIONS.pro.support_level, 'email');
  });

  it('agency and enterprise have priority support', () => {
    assert.equal(PLAN_DEFINITIONS.agency.support_level, 'priority');
    assert.equal(PLAN_DEFINITIONS.enterprise.support_level, 'priority');
  });
});

// ── getPlanLimits ────────────────────────────────────────────────────────────

describe('getPlanLimits', () => {
  it('returns correct limits for starter', () => {
    const limits = getPlanLimits('starter');
    assert.equal(limits.crawls_per_month, 10);
    assert.equal(limits.fixes_per_month, 25);
  });

  it('returns correct limits for pro', () => {
    const limits = getPlanLimits('pro');
    assert.equal(limits.crawls_per_month, 100);
    assert.equal(limits.fixes_per_month, 500);
  });
});

// ── isFeatureAllowed ─────────────────────────────────────────────────────────

describe('isFeatureAllowed', () => {
  it('starter does not allow exports', () => {
    assert.equal(isFeatureAllowed('starter', 'exports_allowed'), false);
  });

  it('pro allows exports', () => {
    assert.equal(isFeatureAllowed('pro', 'exports_allowed'), true);
  });

  it('starter does not allow aeo_features', () => {
    assert.equal(isFeatureAllowed('starter', 'aeo_features'), false);
  });

  it('pro allows aeo_features', () => {
    assert.equal(isFeatureAllowed('pro', 'aeo_features'), true);
  });

  it('starter does not allow vehicle_schema', () => {
    assert.equal(isFeatureAllowed('starter', 'vehicle_schema'), false);
  });

  it('agency allows vehicle_schema', () => {
    assert.equal(isFeatureAllowed('agency', 'vehicle_schema'), true);
  });

  it('pro does not allow multi_site_jobs', () => {
    assert.equal(isFeatureAllowed('pro', 'multi_site_jobs'), false);
  });

  it('agency allows multi_site_jobs', () => {
    assert.equal(isFeatureAllowed('agency', 'multi_site_jobs'), true);
  });

  it('pro does not allow api_access', () => {
    assert.equal(isFeatureAllowed('pro', 'api_access'), false);
  });

  it('agency allows api_access', () => {
    assert.equal(isFeatureAllowed('agency', 'api_access'), true);
  });

  it('support_level is always allowed (string field)', () => {
    assert.equal(isFeatureAllowed('starter', 'support_level'), true);
  });

  it('numeric limits count as allowed when > 0', () => {
    assert.equal(isFeatureAllowed('starter', 'sites_allowed'), true);
  });
});

// ── isWithinLimit ────────────────────────────────────────────────────────────

describe('isWithinLimit', () => {
  it('allows when usage is below limit', () => {
    assert.equal(isWithinLimit('starter', 'sites_allowed', 0), true);
  });

  it('blocks when usage equals limit', () => {
    assert.equal(isWithinLimit('starter', 'sites_allowed', 1), false);
  });

  it('blocks when usage exceeds limit', () => {
    assert.equal(isWithinLimit('starter', 'crawls_per_month', 15), false);
  });

  it('allows pro crawls under 100', () => {
    assert.equal(isWithinLimit('pro', 'crawls_per_month', 50), true);
  });

  it('blocks pro fixes at 500', () => {
    assert.equal(isWithinLimit('pro', 'fixes_per_month', 500), false);
  });
});
