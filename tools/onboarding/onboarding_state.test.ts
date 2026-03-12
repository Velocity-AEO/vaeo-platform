/**
 * tools/onboarding/onboarding_state.test.ts
 *
 * Tests for onboarding state machine — step progression, DB operations.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getNextStep,
  isOnboardingComplete,
  createInitialStatus,
  getOnboardingStatus,
  updateOnboardingStep,
  type OnboardingStatus,
  type OnboardingDb,
} from './onboarding_state.js';

// ── Mock DB ───────────────────────────────────────────────────────────────────

function mockDb(
  extraData: Record<string, unknown> | null = null,
): { db: OnboardingDb; updates: Array<Record<string, unknown>> } {
  const updates: Array<Record<string, unknown>> = [];
  const db: OnboardingDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: extraData !== null ? { extra_data: extraData } : null,
            error: null,
          }),
        }),
      }),
      update: (data: Record<string, unknown>) => {
        updates.push(data);
        return { eq: async () => ({ error: null }) };
      },
    }),
  };
  return { db, updates };
}

function errorDb(): OnboardingDb {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => { throw new Error('DB down'); },
        }),
      }),
      update: () => ({
        eq: async () => { throw new Error('DB down'); },
      }),
    }),
  };
}

function makeStatus(overrides: Partial<OnboardingStatus> = {}): OnboardingStatus {
  return {
    site_id:           'site-1',
    current_step:      'install',
    completed_steps:   [],
    shopify_connected: false,
    gsc_connected:     false,
    first_crawl_done:  false,
    issues_found:      0,
    created_at:        '2026-01-01T00:00:00Z',
    updated_at:        '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── createInitialStatus ───────────────────────────────────────────────────────

describe('createInitialStatus', () => {
  it('creates status with install as current step', () => {
    const status = createInitialStatus('site-1');
    assert.equal(status.current_step, 'install');
    assert.equal(status.site_id, 'site-1');
    assert.deepEqual(status.completed_steps, []);
  });
});

// ── getNextStep ───────────────────────────────────────────────────────────────

describe('getNextStep', () => {
  it('returns install when no steps completed', () => {
    assert.equal(getNextStep(makeStatus()), 'install');
  });

  it('returns connect_shopify after install', () => {
    assert.equal(getNextStep(makeStatus({ completed_steps: ['install'] })), 'connect_shopify');
  });

  it('returns connect_gsc after connect_shopify', () => {
    assert.equal(
      getNextStep(makeStatus({ completed_steps: ['install', 'connect_shopify'] })),
      'connect_gsc',
    );
  });

  it('returns first_crawl after connect_gsc', () => {
    assert.equal(
      getNextStep(makeStatus({ completed_steps: ['install', 'connect_shopify', 'connect_gsc'] })),
      'first_crawl',
    );
  });

  it('returns review_issues after first_crawl', () => {
    assert.equal(
      getNextStep(makeStatus({
        completed_steps: ['install', 'connect_shopify', 'connect_gsc', 'first_crawl'],
      })),
      'review_issues',
    );
  });

  it('returns complete when all steps done', () => {
    assert.equal(
      getNextStep(makeStatus({
        completed_steps: ['install', 'connect_shopify', 'connect_gsc', 'first_crawl', 'review_issues'],
      })),
      'complete',
    );
  });
});

// ── isOnboardingComplete ──────────────────────────────────────────────────────

describe('isOnboardingComplete', () => {
  it('returns false when no steps completed', () => {
    assert.equal(isOnboardingComplete(makeStatus()), false);
  });

  it('returns false when partially complete', () => {
    assert.equal(
      isOnboardingComplete(makeStatus({ completed_steps: ['install', 'connect_shopify'] })),
      false,
    );
  });

  it('returns true when all pre-complete steps done', () => {
    assert.equal(
      isOnboardingComplete(makeStatus({
        completed_steps: ['install', 'connect_shopify', 'connect_gsc', 'first_crawl', 'review_issues'],
      })),
      true,
    );
  });

  it('returns true when complete is in completed_steps', () => {
    assert.equal(
      isOnboardingComplete(makeStatus({ completed_steps: ['complete'] })),
      true,
    );
  });
});

// ── getOnboardingStatus ───────────────────────────────────────────────────────

describe('getOnboardingStatus', () => {
  it('returns status from sites.extra_data.onboarding', async () => {
    const status = makeStatus({ current_step: 'connect_gsc' });
    const { db } = mockDb({ onboarding: status });
    const result = await getOnboardingStatus('site-1', db);
    assert.equal(result?.current_step, 'connect_gsc');
  });

  it('returns null when site not found', async () => {
    const db: OnboardingDb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    };
    const result = await getOnboardingStatus('missing', db);
    assert.equal(result, null);
  });

  it('returns null when no onboarding data', async () => {
    const { db } = mockDb({});
    const result = await getOnboardingStatus('site-1', db);
    assert.equal(result, null);
  });

  it('returns null on DB error', async () => {
    const result = await getOnboardingStatus('site-1', errorDb());
    assert.equal(result, null);
  });
});

// ── updateOnboardingStep ──────────────────────────────────────────────────────

describe('updateOnboardingStep', () => {
  it('adds step to completed_steps and advances current_step', async () => {
    const status = makeStatus();
    const { db, updates } = mockDb({ onboarding: status });
    await updateOnboardingStep('site-1', 'install', undefined, db);
    assert.equal(updates.length, 1);
    const onboarding = (updates[0]!.extra_data as Record<string, unknown>).onboarding as OnboardingStatus;
    assert.ok(onboarding.completed_steps.includes('install'));
    assert.equal(onboarding.current_step, 'connect_shopify');
  });

  it('applies partial data overrides', async () => {
    const status = makeStatus({ completed_steps: ['install'] });
    const { db, updates } = mockDb({ onboarding: status });
    await updateOnboardingStep('site-1', 'connect_shopify', { shopify_connected: true }, db);
    const onboarding = (updates[0]!.extra_data as Record<string, unknown>).onboarding as OnboardingStatus;
    assert.equal(onboarding.shopify_connected, true);
  });

  it('does not duplicate steps in completed_steps', async () => {
    const status = makeStatus({ completed_steps: ['install'] });
    const { db, updates } = mockDb({ onboarding: status });
    await updateOnboardingStep('site-1', 'install', undefined, db);
    const onboarding = (updates[0]!.extra_data as Record<string, unknown>).onboarding as OnboardingStatus;
    assert.equal(onboarding.completed_steps.filter((s) => s === 'install').length, 1);
  });

  it('does not throw on DB error', async () => {
    await assert.doesNotReject(() =>
      updateOnboardingStep('site-1', 'install', undefined, errorDb()),
    );
  });
});
