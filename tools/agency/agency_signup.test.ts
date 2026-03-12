import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgencySignupState,
  advanceAgencySignup,
  getAgencySignupProgress,
  validateAgencyDetails,
} from './agency_signup.js';

// ── buildAgencySignupState ────────────────────────────────────────────────────

describe('buildAgencySignupState', () => {
  it('starts at choose_plan', () => {
    const state = buildAgencySignupState();
    assert.equal(state.step, 'choose_plan');
  });

  it('has no error', () => {
    const state = buildAgencySignupState();
    assert.equal(state.error, undefined);
  });
});

// ── advanceAgencySignup ───────────────────────────────────────────────────────

describe('advanceAgencySignup', () => {
  it('merges result into state', () => {
    const state = buildAgencySignupState();
    const next = advanceAgencySignup(state, { plan: 'growth' });
    assert.equal(next.plan, 'growth');
  });

  it('advances to next step', () => {
    const state = buildAgencySignupState();
    const next = advanceAgencySignup(state, { plan: 'starter' });
    assert.equal(next.step, 'agency_details');
  });

  it('advances from agency_details to owner_account', () => {
    const state = { step: 'agency_details' as const, agency_name: 'Test' };
    const next = advanceAgencySignup(state, { owner_name: 'Bob' });
    assert.equal(next.step, 'owner_account');
  });

  it('advances from billing to complete', () => {
    const state = { step: 'billing' as const };
    const next = advanceAgencySignup(state, {});
    assert.equal(next.step, 'complete');
  });

  it('does not advance past complete', () => {
    const state = { step: 'complete' as const };
    const next = advanceAgencySignup(state, {});
    assert.equal(next.step, 'complete');
  });

  it('clears error on advance', () => {
    const state = { step: 'choose_plan' as const, error: 'old error' };
    const next = advanceAgencySignup(state, {});
    assert.equal(next.error, undefined);
  });

  it('never throws on null state', () => {
    assert.doesNotThrow(() => advanceAgencySignup(null as any, {}));
  });
});

// ── getAgencySignupProgress ───────────────────────────────────────────────────

describe('getAgencySignupProgress', () => {
  it('returns step 1 of 5 at choose_plan', () => {
    const p = getAgencySignupProgress({ step: 'choose_plan' });
    assert.equal(p.step_number, 1);
    assert.equal(p.total_steps, 5);
    assert.equal(p.percent, 20);
  });

  it('returns step 3 of 5 at owner_account', () => {
    const p = getAgencySignupProgress({ step: 'owner_account' });
    assert.equal(p.step_number, 3);
    assert.equal(p.percent, 60);
  });

  it('returns 100% at complete', () => {
    const p = getAgencySignupProgress({ step: 'complete' });
    assert.equal(p.percent, 100);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => getAgencySignupProgress(null as any));
  });
});

// ── validateAgencyDetails ─────────────────────────────────────────────────────

describe('validateAgencyDetails', () => {
  it('accepts valid inputs', () => {
    const r = validateAgencyDetails('Acme SEO', 'bob@acme.com');
    assert.equal(r.valid, true);
    assert.equal(r.errors.length, 0);
  });

  it('rejects short agency_name', () => {
    const r = validateAgencyDetails('A', 'bob@acme.com');
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('2 characters')));
  });

  it('rejects long agency_name', () => {
    const r = validateAgencyDetails('A'.repeat(81), 'bob@acme.com');
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('80')));
  });

  it('rejects invalid email', () => {
    const r = validateAgencyDetails('Acme', 'notanemail');
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('email')));
  });

  it('returns all errors when multiple invalid', () => {
    const r = validateAgencyDetails('A', 'bad');
    assert.equal(r.valid, false);
    assert.ok(r.errors.length >= 2);
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => validateAgencyDetails(null as any, null as any));
  });
});
