/**
 * tools/onboarding/onboarding_state_store.test.ts
 *
 * Tests for onboarding wizard resume state.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSessionId,
  getResumeStep,
  buildInitialOnboardingState,
  saveOnboardingState,
  loadOnboardingState,
  clearOnboardingState,
  type OnboardingState,
} from './onboarding_state_store.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides?: Partial<OnboardingState>): OnboardingState {
  return {
    session_id:      'onboard_shopify_t1_abc',
    platform:        'shopify',
    current_step:    2,
    total_steps:     5,
    completed_steps: [0, 1],
    form_data:       { domain: 'test.myshopify.com' },
    started_at:      '2026-01-01T00:00:00Z',
    last_updated_at: '2026-01-01T00:10:00Z',
    completed:       false,
    ...overrides,
  };
}

// ── generateSessionId ────────────────────────────────────────────────────────

describe('generateSessionId', () => {
  it('includes platform and tenant_id', () => {
    const id = generateSessionId('tenant_123', 'shopify');
    assert.ok(id.includes('shopify'));
    assert.ok(id.includes('tenant_123'));
  });

  it('includes timestamp', () => {
    const id = generateSessionId('t1', 'wordpress');
    assert.ok(id.startsWith('onboard_wordpress_t1_'));
    // timestamp portion should be non-empty
    const parts = id.split('_');
    assert.ok(parts[parts.length - 1].length > 0);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() => generateSessionId(null as any, null as any));
  });

  it('starts with onboard_ prefix', () => {
    const id = generateSessionId('t1', 'shopify');
    assert.ok(id.startsWith('onboard_'));
  });
});

// ── getResumeStep ────────────────────────────────────────────────────────────

describe('getResumeStep', () => {
  it('returns 0 for null state', () => {
    assert.equal(getResumeStep(null), 0);
  });

  it('returns current_step from state', () => {
    assert.equal(getResumeStep(makeState({ current_step: 3 })), 3);
  });

  it('returns 0 for undefined current_step', () => {
    assert.equal(getResumeStep(makeState({ current_step: undefined as any })), 0);
  });

  it('never throws', () => {
    assert.doesNotThrow(() => getResumeStep(null as any));
  });
});

// ── buildInitialOnboardingState ──────────────────────────────────────────────

describe('buildInitialOnboardingState', () => {
  it('creates state with correct fields', () => {
    const state = buildInitialOnboardingState('s1', 'wordpress', 7);
    assert.equal(state.session_id, 's1');
    assert.equal(state.platform, 'wordpress');
    assert.equal(state.total_steps, 7);
    assert.equal(state.current_step, 0);
    assert.equal(state.completed, false);
    assert.deepEqual(state.completed_steps, []);
  });

  it('includes timestamps', () => {
    const state = buildInitialOnboardingState('s1', 'shopify', 5);
    assert.ok(state.started_at);
    assert.ok(state.last_updated_at);
  });
});

// ── saveOnboardingState ──────────────────────────────────────────────────────

describe('saveOnboardingState', () => {
  it('calls saveFn with state', async () => {
    let saved: OnboardingState | null = null;
    const result = await saveOnboardingState(makeState(), {
      saveFn: async (s) => { saved = s; },
    });
    assert.equal(result, true);
    assert.ok(saved);
    assert.equal(saved!.session_id, 'onboard_shopify_t1_abc');
  });

  it('upsert called with correct session_id', async () => {
    let savedId = '';
    await saveOnboardingState(makeState({ session_id: 'my_session' }), {
      saveFn: async (s) => { savedId = s.session_id; },
    });
    assert.equal(savedId, 'my_session');
  });

  it('returns false on error', async () => {
    const result = await saveOnboardingState(makeState(), {
      saveFn: async () => { throw new Error('fail'); },
    });
    assert.equal(result, false);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      saveOnboardingState(null as any, { saveFn: async () => { throw new Error('fail'); } }),
    );
  });
});

// ── loadOnboardingState ──────────────────────────────────────────────────────

describe('loadOnboardingState', () => {
  it('returns state from loadFn', async () => {
    const state = makeState();
    const result = await loadOnboardingState('s1', {
      loadFn: async () => state,
    });
    assert.equal(result?.session_id, 'onboard_shopify_t1_abc');
  });

  it('returns null when not found', async () => {
    const result = await loadOnboardingState('s1', {
      loadFn: async () => null,
    });
    assert.equal(result, null);
  });

  it('returns null on error', async () => {
    const result = await loadOnboardingState('s1', {
      loadFn: async () => { throw new Error('fail'); },
    });
    assert.equal(result, null);
  });

  it('returns null with no deps', async () => {
    const result = await loadOnboardingState('s1');
    assert.equal(result, null);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      loadOnboardingState(null as any, { loadFn: async () => { throw new Error('fail'); } }),
    );
  });
});

// ── clearOnboardingState ─────────────────────────────────────────────────────

describe('clearOnboardingState', () => {
  it('calls deleteFn with session_id', async () => {
    let deletedId = '';
    const result = await clearOnboardingState('s1', {
      deleteFn: async (id) => { deletedId = id; },
    });
    assert.equal(result, true);
    assert.equal(deletedId, 's1');
  });

  it('returns false on error', async () => {
    const result = await clearOnboardingState('s1', {
      deleteFn: async () => { throw new Error('fail'); },
    });
    assert.equal(result, false);
  });

  it('never throws', async () => {
    await assert.doesNotReject(() =>
      clearOnboardingState(null as any, { deleteFn: async () => { throw new Error('fail'); } }),
    );
  });
});
