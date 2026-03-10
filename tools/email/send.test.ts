/**
 * tools/email/send.test.ts
 *
 * Tests for sendDigest — email delivery via Resend API.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { sendDigest, type SendDeps } from './send.js';
import type { DigestReport } from './digest.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeReport(overrides?: Partial<DigestReport>): DigestReport {
  return {
    site_id:          'site-001',
    tenant_id:        'tenant-001',
    site_url:         'https://example.com',
    health_before:    72,
    health_after:     85,
    grade_before:     'C',
    grade_after:      'B',
    fixes_applied:    4,
    issues_resolved:  5,
    issues_remaining: 3,
    top_win:          'Fixed 3 title missing issues this week.',
    generated_at:     '2026-03-10T12:00:00Z',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('sendDigest', () => {
  it('returns ok: true on successful send', async () => {
    const deps: Partial<SendDeps> = {
      resendSend: async () => ({ id: 'msg-001' }),
    };

    const result = await sendDigest('user@example.com', makeReport(), deps);
    assert.equal(result.ok, true);
    assert.equal(result.id, 'msg-001');
    assert.equal(result.error, undefined);
  });

  it('passes correct from, to, subject, and html to resendSend', async () => {
    let captured: { from: string; to: string; subject: string; html: string } | null = null;
    const deps: Partial<SendDeps> = {
      resendSend: async (payload) => {
        captured = payload;
        return { id: 'msg-002' };
      },
    };

    await sendDigest('user@example.com', makeReport(), deps);

    assert.ok(captured);
    assert.equal(captured!.to, 'user@example.com');
    assert.match(captured!.from, /Velocity AEO/);
    assert.match(captured!.subject, /improved.*C.*B/);
    assert.match(captured!.html, /<!DOCTYPE html>/);
  });

  it('returns ok: false with error message on API failure', async () => {
    const deps: Partial<SendDeps> = {
      resendSend: async () => { throw new Error('Resend API 429: rate limited'); },
    };

    const result = await sendDigest('user@example.com', makeReport(), deps);
    assert.equal(result.ok, false);
    assert.match(result.error!, /rate limited/);
  });

  it('never throws even on unexpected errors', async () => {
    const deps: Partial<SendDeps> = {
      resendSend: async () => { throw 'string error'; },
    };

    const result = await sendDigest('user@example.com', makeReport(), deps);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'string error');
  });

  it('uses correct subject line for score improvement', async () => {
    let capturedSubject = '';
    const deps: Partial<SendDeps> = {
      resendSend: async (p) => { capturedSubject = p.subject; return { id: 'x' }; },
    };

    await sendDigest('u@e.com', makeReport({ health_before: 60, health_after: 90, grade_before: 'C', grade_after: 'A' }), deps);
    assert.match(capturedSubject, /improved from C to A/);
  });

  it('uses correct subject line for score drop', async () => {
    let capturedSubject = '';
    const deps: Partial<SendDeps> = {
      resendSend: async (p) => { capturedSubject = p.subject; return { id: 'x' }; },
    };

    await sendDigest('u@e.com', makeReport({ health_before: 90, health_after: 60, grade_before: 'A', grade_after: 'C' }), deps);
    assert.match(capturedSubject, /dropped from A to C/);
  });
});
