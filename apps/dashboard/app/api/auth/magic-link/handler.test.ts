/**
 * app/api/auth/magic-link/handler.test.ts
 *
 * Unit tests for validateEmail() and handleMagicLink().
 * No real Supabase calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEmail,
  handleMagicLink,
  type MagicLinkDeps,
} from './handler.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OK_SEND:   MagicLinkDeps['sendOtp'] = async () => ({ error: null });
const FAIL_SEND: MagicLinkDeps['sendOtp'] = async () => ({ error: 'SMTP error' });

// ── validateEmail ─────────────────────────────────────────────────────────────

describe('validateEmail', () => {
  it('undefined → invalid', () => {
    const r = validateEmail(undefined);
    assert.equal(r.valid, false);
  });

  it('null → invalid', () => {
    const r = validateEmail(null);
    assert.equal(r.valid, false);
  });

  it('empty string → invalid', () => {
    const r = validateEmail('');
    assert.equal(r.valid, false);
  });

  it('whitespace-only → invalid', () => {
    const r = validateEmail('   ');
    assert.equal(r.valid, false);
  });

  it('no @ sign → invalid', () => {
    const r = validateEmail('userexample.com');
    assert.equal(r.valid, false);
  });

  it('valid email → valid, trimmed', () => {
    const r = validateEmail('  dev@vaeo.test  ');
    assert.equal(r.valid, true);
    if (r.valid) assert.equal(r.email, 'dev@vaeo.test');
  });

  it('minimal valid email (a@b.c) → valid', () => {
    const r = validateEmail('a@b.c');
    assert.equal(r.valid, true);
  });
});

// ── handleMagicLink ───────────────────────────────────────────────────────────

describe('handleMagicLink', () => {
  it('missing email key → ok=false, status=400', async () => {
    const r = await handleMagicLink({}, { sendOtp: OK_SEND });
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
  });

  it('invalid email format → ok=false, status=400', async () => {
    const r = await handleMagicLink({ email: 'notanemail' }, { sendOtp: OK_SEND });
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
    assert.ok(r.error?.toLowerCase().includes('email'));
  });

  it('valid email, sendOtp succeeds → ok=true, status=200', async () => {
    const r = await handleMagicLink({ email: 'dev@vaeo.test' }, { sendOtp: OK_SEND });
    assert.equal(r.ok, true);
    assert.equal(r.status, 200);
    assert.equal(r.error, undefined);
  });

  it('valid email, sendOtp returns error → ok=false, status=500', async () => {
    const r = await handleMagicLink({ email: 'dev@vaeo.test' }, { sendOtp: FAIL_SEND });
    assert.equal(r.ok, false);
    assert.equal(r.status, 500);
    assert.ok(r.error?.includes('SMTP'));
  });

  it('sendOtp throws → ok=false, status=500, error propagated', async () => {
    const r = await handleMagicLink(
      { email: 'dev@vaeo.test' },
      { sendOtp: async () => { throw new Error('Network timeout'); } },
    );
    assert.equal(r.ok, false);
    assert.equal(r.status, 500);
    assert.ok(r.error?.includes('Network timeout'));
  });

  it('sendOtp called with trimmed email', async () => {
    let captured = '';
    await handleMagicLink(
      { email: '  user@example.com  ' },
      { sendOtp: async (e) => { captured = e; return { error: null }; } },
    );
    assert.equal(captured, 'user@example.com');
  });
});
