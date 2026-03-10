/**
 * app/api/auth/login/handler.test.ts
 *
 * Unit tests for validateLoginInput() and handleLogin().
 * No real Supabase calls — deps are inline fakes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLoginInput,
  handleLogin,
  type LoginDeps,
} from './handler.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_EMAIL    = 'dev@vaeo.test';
const VALID_PASSWORD = 'secure-password-123';
const FAKE_SESSION   = { access_token: 'tok_abc', user: { id: 'uid-1' } };

function makeSignIn(result: { session: unknown | null; error: string | null }): LoginDeps['signIn'] {
  return async () => result;
}

// ── validateLoginInput ────────────────────────────────────────────────────────

describe('validateLoginInput', () => {
  it('null input → invalid', () => {
    const r = validateLoginInput(null);
    assert.equal(r.valid, false);
  });

  it('array input → invalid', () => {
    const r = validateLoginInput([]);
    assert.equal(r.valid, false);
  });

  it('missing email → invalid with message', () => {
    const r = validateLoginInput({ password: VALID_PASSWORD });
    assert.equal(r.valid, false);
    if (!r.valid) assert.ok(r.error.toLowerCase().includes('email'));
  });

  it('email without @ → invalid', () => {
    const r = validateLoginInput({ email: 'notemail', password: VALID_PASSWORD });
    assert.equal(r.valid, false);
  });

  it('non-string email → invalid', () => {
    const r = validateLoginInput({ email: 42, password: VALID_PASSWORD });
    assert.equal(r.valid, false);
  });

  it('missing password → invalid with message', () => {
    const r = validateLoginInput({ email: VALID_EMAIL });
    assert.equal(r.valid, false);
    if (!r.valid) assert.ok(r.error.toLowerCase().includes('password'));
  });

  it('password shorter than 6 chars → invalid', () => {
    const r = validateLoginInput({ email: VALID_EMAIL, password: '12345' });
    assert.equal(r.valid, false);
  });

  it('valid email + password → valid, trims email whitespace', () => {
    const r = validateLoginInput({ email: `  ${VALID_EMAIL}  `, password: VALID_PASSWORD });
    assert.equal(r.valid, true);
    if (r.valid) {
      assert.equal(r.email, VALID_EMAIL);
      assert.equal(r.password, VALID_PASSWORD);
    }
  });

  it('password exactly 6 chars → valid', () => {
    const r = validateLoginInput({ email: VALID_EMAIL, password: '123456' });
    assert.equal(r.valid, true);
  });
});

// ── handleLogin ───────────────────────────────────────────────────────────────

describe('handleLogin', () => {
  it('successful sign-in → ok=true, session returned, status=200', async () => {
    const r = await handleLogin(
      { email: VALID_EMAIL, password: VALID_PASSWORD },
      { signIn: makeSignIn({ session: FAKE_SESSION, error: null }) },
    );
    assert.equal(r.ok, true);
    assert.equal(r.status, 200);
    assert.deepEqual(r.session, FAKE_SESSION);
  });

  it('signIn returns error string → ok=false, status=401', async () => {
    const r = await handleLogin(
      { email: VALID_EMAIL, password: VALID_PASSWORD },
      { signIn: makeSignIn({ session: null, error: 'Invalid login credentials' }) },
    );
    assert.equal(r.ok, false);
    assert.equal(r.status, 401);
    assert.ok(r.error?.includes('Invalid login credentials'));
  });

  it('signIn returns error, session is null → no session in result', async () => {
    const r = await handleLogin(
      { email: VALID_EMAIL, password: VALID_PASSWORD },
      { signIn: makeSignIn({ session: null, error: 'User not found' }) },
    );
    assert.equal(r.session, undefined);
  });

  it('signIn throws → ok=false, status=500, error propagated', async () => {
    const r = await handleLogin(
      { email: VALID_EMAIL, password: VALID_PASSWORD },
      { signIn: async () => { throw new Error('Connection refused'); } },
    );
    assert.equal(r.ok, false);
    assert.equal(r.status, 500);
    assert.ok(r.error?.includes('Connection refused'));
  });

  it('non-Error thrown → ok=false, status=500, coerced to string', async () => {
    const r = await handleLogin(
      { email: VALID_EMAIL, password: VALID_PASSWORD },
      { signIn: async () => { throw 'network down'; } },
    );
    assert.equal(r.ok, false);
    assert.equal(r.status, 500);
    assert.ok(typeof r.error === 'string');
  });
});
