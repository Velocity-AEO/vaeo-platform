import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOnboardingState,
  advanceOnboarding,
  getOnboardingProgress,
  type WPOnboardingState,
} from './wp_onboarding.js';

// ── buildOnboardingState ─────────────────────────────────────────────────────

describe('buildOnboardingState', () => {
  it('starts at enter_url step', () => {
    const state = buildOnboardingState();
    assert.equal(state.step, 'enter_url');
  });

  it('connection_verified is false', () => {
    const state = buildOnboardingState();
    assert.equal(state.connection_verified, false);
  });

  it('plugins_detected is empty array', () => {
    const state = buildOnboardingState();
    assert.deepEqual(state.plugins_detected, []);
  });

  it('site_id is undefined', () => {
    const state = buildOnboardingState();
    assert.equal(state.site_id, undefined);
  });

  it('error is undefined', () => {
    const state = buildOnboardingState();
    assert.equal(state.error, undefined);
  });
});

// ── advanceOnboarding ────────────────────────────────────────────────────────

describe('advanceOnboarding', () => {
  it('merges result into state', () => {
    const state = buildOnboardingState();
    const next = advanceOnboarding(state, { wp_url: 'https://example.com' });
    assert.equal(next.wp_url, 'https://example.com');
  });

  it('advances step from enter_url to generate_password', () => {
    const state = buildOnboardingState();
    const next = advanceOnboarding(state, {});
    assert.equal(next.step, 'generate_password');
  });

  it('advances through full sequence', () => {
    let state = buildOnboardingState();
    state = advanceOnboarding(state, { wp_url: 'https://example.com' });
    assert.equal(state.step, 'generate_password');
    state = advanceOnboarding(state, {});
    assert.equal(state.step, 'enter_credentials');
    state = advanceOnboarding(state, { username: 'admin', app_password: 'pass' });
    assert.equal(state.step, 'verify_connection');
    state = advanceOnboarding(state, { connection_verified: true });
    assert.equal(state.step, 'detect_plugins');
    state = advanceOnboarding(state, { plugins_detected: ['yoast'] });
    assert.equal(state.step, 'register_site');
    state = advanceOnboarding(state, { site_id: 'wp-site-1' });
    assert.equal(state.step, 'complete');
  });

  it('clears error on advance', () => {
    const state = { ...buildOnboardingState(), error: 'something broke' };
    const next = advanceOnboarding(state, {});
    assert.equal(next.error, undefined);
  });

  it('sets completed_at on complete step', () => {
    let state = buildOnboardingState();
    // Advance to register_site
    state = advanceOnboarding(state, {}); // generate_password
    state = advanceOnboarding(state, {}); // enter_credentials
    state = advanceOnboarding(state, {}); // verify_connection
    state = advanceOnboarding(state, {}); // detect_plugins
    state = advanceOnboarding(state, {}); // register_site
    state = advanceOnboarding(state, {}); // complete
    assert.ok(state.completed_at);
    assert.ok(!isNaN(Date.parse(state.completed_at)));
  });

  it('does not advance past complete', () => {
    let state = buildOnboardingState();
    for (let i = 0; i < 10; i++) state = advanceOnboarding(state, {});
    assert.equal(state.step, 'complete');
  });

  it('never throws on null state', () => {
    const next = advanceOnboarding(null as unknown as WPOnboardingState, {});
    assert.ok(next);
    assert.equal(next.step, 'generate_password');
  });
});

// ── getOnboardingProgress ────────────────────────────────────────────────────

describe('getOnboardingProgress', () => {
  it('step 1 at enter_url', () => {
    const state = buildOnboardingState();
    const p = getOnboardingProgress(state);
    assert.equal(p.step_number, 1);
    assert.equal(p.total_steps, 7);
  });

  it('percent at enter_url is 14', () => {
    const state = buildOnboardingState();
    const p = getOnboardingProgress(state);
    assert.equal(p.percent, 14);
  });

  it('percent at complete is 100', () => {
    const state = { ...buildOnboardingState(), step: 'complete' as const };
    const p = getOnboardingProgress(state);
    assert.equal(p.percent, 100);
  });

  it('never throws on null', () => {
    const p = getOnboardingProgress(null as unknown as WPOnboardingState);
    assert.equal(typeof p.percent, 'number');
  });
});
