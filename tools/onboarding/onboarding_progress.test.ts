/**
 * tools/onboarding/onboarding_progress.test.ts
 *
 * Tests for onboarding progress tracker.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateProgress,
  loadOnboardingProgress,
  SHOPIFY_ONBOARDING_STEPS,
  WORDPRESS_ONBOARDING_STEPS,
  type OnboardingStep,
  type OnboardingProgressDeps,
} from './onboarding_progress.js';

// ── calculateProgress ───────────────────────────────────────────────────────

describe('calculateProgress', () => {
  it('returns zero progress for empty steps', () => {
    const p = calculateProgress([]);
    assert.equal(p.total_steps, 0);
    assert.equal(p.completed_steps, 0);
    assert.equal(p.percent_complete, 0);
    assert.equal(p.is_complete, true); // no required steps = complete
  });

  it('calculates correct percent', () => {
    const steps: OnboardingStep[] = [
      { id: 'a', label: 'A', description: 'a', status: 'complete', completed_at: '2026-01-01T00:00:00Z', action_url: null, action_label: null, required: true, platform: 'shopify' },
      { id: 'b', label: 'B', description: 'b', status: 'pending', completed_at: null, action_url: null, action_label: null, required: true, platform: 'shopify' },
    ];
    const p = calculateProgress(steps, 'site-1', 'shopify');
    assert.equal(p.completed_steps, 1);
    assert.equal(p.percent_complete, 50);
  });

  it('sets current_step to first in_progress', () => {
    const steps: OnboardingStep[] = [
      { id: 'a', label: 'A', description: 'a', status: 'complete', completed_at: '2026-01-01T00:00:00Z', action_url: null, action_label: null, required: true, platform: 'shopify' },
      { id: 'b', label: 'B', description: 'b', status: 'in_progress', completed_at: null, action_url: null, action_label: null, required: true, platform: 'shopify' },
      { id: 'c', label: 'C', description: 'c', status: 'pending', completed_at: null, action_url: null, action_label: null, required: true, platform: 'shopify' },
    ];
    const p = calculateProgress(steps);
    assert.equal(p.current_step?.id, 'b');
  });

  it('falls back to first pending if no in_progress', () => {
    const steps: OnboardingStep[] = [
      { id: 'a', label: 'A', description: 'a', status: 'complete', completed_at: '2026-01-01T00:00:00Z', action_url: null, action_label: null, required: true, platform: 'shopify' },
      { id: 'b', label: 'B', description: 'b', status: 'pending', completed_at: null, action_url: null, action_label: null, required: true, platform: 'shopify' },
    ];
    const p = calculateProgress(steps);
    assert.equal(p.current_step?.id, 'b');
  });

  it('is_complete when all required steps are complete', () => {
    const steps: OnboardingStep[] = [
      { id: 'a', label: 'A', description: 'a', status: 'complete', completed_at: '2026-01-01T00:00:00Z', action_url: null, action_label: null, required: true, platform: 'shopify' },
      { id: 'b', label: 'B', description: 'b', status: 'pending', completed_at: null, action_url: null, action_label: null, required: false, platform: 'shopify' },
    ];
    const p = calculateProgress(steps);
    assert.equal(p.is_complete, true);
  });

  it('is not complete when required steps remain', () => {
    const steps: OnboardingStep[] = [
      { id: 'a', label: 'A', description: 'a', status: 'complete', completed_at: '2026-01-01T00:00:00Z', action_url: null, action_label: null, required: true, platform: 'shopify' },
      { id: 'b', label: 'B', description: 'b', status: 'pending', completed_at: null, action_url: null, action_label: null, required: true, platform: 'shopify' },
    ];
    const p = calculateProgress(steps);
    assert.equal(p.is_complete, false);
  });

  it('estimates remaining minutes from pending required steps', () => {
    const steps: OnboardingStep[] = [
      { id: 'a', label: 'A', description: 'a', status: 'complete', completed_at: '2026-01-01T00:00:00Z', action_url: null, action_label: null, required: true, platform: 'shopify' },
      { id: 'b', label: 'B', description: 'b', status: 'pending', completed_at: null, action_url: null, action_label: null, required: true, platform: 'shopify' },
      { id: 'c', label: 'C', description: 'c', status: 'pending', completed_at: null, action_url: null, action_label: null, required: true, platform: 'shopify' },
    ];
    const p = calculateProgress(steps);
    assert.equal(p.estimated_minutes_remaining, 4); // 2 pending required * 2 min
  });

  it('sets started_at from earliest completed_at', () => {
    const steps: OnboardingStep[] = [
      { id: 'a', label: 'A', description: 'a', status: 'complete', completed_at: '2026-01-02T00:00:00Z', action_url: null, action_label: null, required: true, platform: 'shopify' },
      { id: 'b', label: 'B', description: 'b', status: 'complete', completed_at: '2026-01-01T00:00:00Z', action_url: null, action_label: null, required: true, platform: 'shopify' },
    ];
    const p = calculateProgress(steps);
    assert.equal(p.started_at, '2026-01-01T00:00:00Z');
  });

  it('preserves site_id and platform', () => {
    const p = calculateProgress([], 'site-x', 'wordpress');
    assert.equal(p.site_id, 'site-x');
    assert.equal(p.platform, 'wordpress');
  });

  it('never throws on null steps', () => {
    assert.doesNotThrow(() => calculateProgress(null as any));
  });

  it('returns 100% when all steps complete', () => {
    const steps: OnboardingStep[] = [
      { id: 'a', label: 'A', description: 'a', status: 'complete', completed_at: '2026-01-01T00:00:00Z', action_url: null, action_label: null, required: true, platform: 'shopify' },
      { id: 'b', label: 'B', description: 'b', status: 'complete', completed_at: '2026-01-01T00:00:00Z', action_url: null, action_label: null, required: true, platform: 'shopify' },
    ];
    const p = calculateProgress(steps);
    assert.equal(p.percent_complete, 100);
  });

  it('current_step is null when all complete', () => {
    const steps: OnboardingStep[] = [
      { id: 'a', label: 'A', description: 'a', status: 'complete', completed_at: '2026-01-01T00:00:00Z', action_url: null, action_label: null, required: true, platform: 'shopify' },
    ];
    const p = calculateProgress(steps);
    assert.equal(p.current_step, null);
  });
});

// ── Step templates ──────────────────────────────────────────────────────────

describe('SHOPIFY_ONBOARDING_STEPS', () => {
  it('has 7 steps', () => {
    assert.equal(SHOPIFY_ONBOARDING_STEPS.length, 7);
  });

  it('all steps start as pending', () => {
    for (const s of SHOPIFY_ONBOARDING_STEPS) {
      assert.equal(s.status, 'pending');
    }
  });

  it('all steps have platform shopify', () => {
    for (const s of SHOPIFY_ONBOARDING_STEPS) {
      assert.equal(s.platform, 'shopify');
    }
  });

  it('first step is install_app', () => {
    assert.equal(SHOPIFY_ONBOARDING_STEPS[0].id, 'install_app');
  });

  it('last step is setup_complete', () => {
    assert.equal(SHOPIFY_ONBOARDING_STEPS[SHOPIFY_ONBOARDING_STEPS.length - 1].id, 'setup_complete');
  });

  it('gsc_connected is optional', () => {
    const gsc = SHOPIFY_ONBOARDING_STEPS.find(s => s.id === 'gsc_connected');
    assert.equal(gsc?.required, false);
  });

  it('review_issues is optional', () => {
    const review = SHOPIFY_ONBOARDING_STEPS.find(s => s.id === 'review_issues');
    assert.equal(review?.required, false);
  });
});

describe('WORDPRESS_ONBOARDING_STEPS', () => {
  it('has 7 steps', () => {
    assert.equal(WORDPRESS_ONBOARDING_STEPS.length, 7);
  });

  it('all steps have platform wordpress', () => {
    for (const s of WORDPRESS_ONBOARDING_STEPS) {
      assert.equal(s.platform, 'wordpress');
    }
  });

  it('first step is connect_wordpress', () => {
    assert.equal(WORDPRESS_ONBOARDING_STEPS[0].id, 'connect_wordpress');
  });

  it('includes plugin_conflict_check', () => {
    const plug = WORDPRESS_ONBOARDING_STEPS.find(s => s.id === 'plugin_conflict_check');
    assert.ok(plug);
  });
});

// ── loadOnboardingProgress ──────────────────────────────────────────────────

describe('loadOnboardingProgress', () => {
  it('returns empty progress with default deps', async () => {
    const p = await loadOnboardingProgress('site-1', 'shopify');
    assert.equal(p.site_id, 'site-1');
    assert.equal(p.platform, 'shopify');
    assert.equal(p.total_steps, 7);
  });

  it('marks install_app complete when site exists', async () => {
    const deps: OnboardingProgressDeps = {
      loadSiteFn: async () => ({ oauth_token: undefined, gsc_connected: false }),
      loadCrawlFn: async () => null,
      loadFixesFn: async () => null,
      loadEventFn: async () => false,
    };
    const p = await loadOnboardingProgress('site-1', 'shopify', deps);
    const install = p.steps.find(s => s.id === 'install_app');
    assert.equal(install?.status, 'complete');
  });

  it('marks oauth_connect complete when token exists', async () => {
    const deps: OnboardingProgressDeps = {
      loadSiteFn: async () => ({ oauth_token: 'tok-123', gsc_connected: false }),
      loadCrawlFn: async () => null,
      loadFixesFn: async () => null,
      loadEventFn: async () => false,
    };
    const p = await loadOnboardingProgress('site-1', 'shopify', deps);
    const oauth = p.steps.find(s => s.id === 'oauth_connect');
    assert.equal(oauth?.status, 'complete');
  });

  it('marks first_crawl complete when crawl_count > 0', async () => {
    const deps: OnboardingProgressDeps = {
      loadSiteFn: async () => ({ oauth_token: 'tok', gsc_connected: false }),
      loadCrawlFn: async () => ({ crawl_count: 5 }),
      loadFixesFn: async () => null,
      loadEventFn: async () => false,
    };
    const p = await loadOnboardingProgress('site-1', 'shopify', deps);
    const crawl = p.steps.find(s => s.id === 'first_crawl');
    assert.equal(crawl?.status, 'complete');
  });

  it('marks gsc_connected complete when gsc_connected is true', async () => {
    const deps: OnboardingProgressDeps = {
      loadSiteFn: async () => ({ oauth_token: 'tok', gsc_connected: true }),
      loadCrawlFn: async () => ({ crawl_count: 5 }),
      loadFixesFn: async () => ({ fix_count: 3 }),
      loadEventFn: async () => true,
    };
    const p = await loadOnboardingProgress('site-1', 'shopify', deps);
    const gsc = p.steps.find(s => s.id === 'gsc_connected');
    assert.equal(gsc?.status, 'complete');
  });

  it('sets first non-complete step to in_progress', async () => {
    const deps: OnboardingProgressDeps = {
      loadSiteFn: async () => ({ oauth_token: 'tok', gsc_connected: false }),
      loadCrawlFn: async () => null,
      loadFixesFn: async () => null,
      loadEventFn: async () => false,
    };
    const p = await loadOnboardingProgress('site-1', 'shopify', deps);
    assert.equal(p.current_step?.status, 'in_progress');
  });

  it('uses wordpress steps for wordpress platform', async () => {
    const p = await loadOnboardingProgress('site-1', 'wordpress');
    assert.equal(p.steps[0].id, 'connect_wordpress');
  });

  it('sets review_issues action_url dynamically', async () => {
    const p = await loadOnboardingProgress('site-1', 'shopify');
    const review = p.steps.find(s => s.id === 'review_issues');
    assert.equal(review?.action_url, '/client/site-1');
  });

  it('never throws on loadSite failure', async () => {
    const deps: OnboardingProgressDeps = {
      loadSiteFn: async () => { throw new Error('db down'); },
    };
    const p = await loadOnboardingProgress('site-1', 'shopify', deps);
    assert.equal(p.site_id, 'site-1');
    assert.equal(p.total_steps, 0); // falls back to emptyProgress
  });

  it('handles all steps complete', async () => {
    const deps: OnboardingProgressDeps = {
      loadSiteFn: async () => ({ oauth_token: 'tok', gsc_connected: true }),
      loadCrawlFn: async () => ({ crawl_count: 10 }),
      loadFixesFn: async () => ({ fix_count: 5 }),
      loadEventFn: async () => true,
    };
    const p = await loadOnboardingProgress('site-1', 'shopify', deps);
    assert.equal(p.is_complete, true);
    assert.equal(p.percent_complete, 100);
  });
});
