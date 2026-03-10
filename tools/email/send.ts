/**
 * tools/email/send.ts
 *
 * Sends a weekly digest email via the Resend API.
 * All HTTP calls injectable via SendDeps for testing.
 * Never throws — returns { ok, error? }.
 */

import type { DigestReport } from './digest.js';
import { renderDigestEmail, digestSubject } from './render.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SendResult {
  ok:     boolean;
  id?:    string;
  error?: string;
}

export interface SendDeps {
  /** Send an email via the Resend API (or mock). */
  resendSend: (payload: {
    from:    string;
    to:      string;
    subject: string;
    html:    string;
  }) => Promise<{ id: string }>;
}

// ── Default (real) deps ──────────────────────────────────────────────────────

function getResendApiKey(): string {
  const key = process.env['RESEND_API_KEY'];
  if (!key?.trim()) {
    throw new Error('[vaeo/email] Missing required environment variable: RESEND_API_KEY');
  }
  return key.trim();
}

const realResendSend: SendDeps['resendSend'] = async (payload) => {
  const apiKey = getResendApiKey();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API ${res.status}: ${body}`);
  }

  const data = await res.json() as { id: string };
  return data;
};

// ── Main export ──────────────────────────────────────────────────────────────

const FROM_ADDRESS = 'Velocity AEO <digest@velocityaeo.com>';

export async function sendDigest(
  to:      string,
  report:  DigestReport,
  _testDeps?: Partial<SendDeps>,
): Promise<SendResult> {
  const deps: SendDeps = {
    resendSend: realResendSend,
    ..._testDeps,
  };

  const subject = digestSubject(report);
  const html    = renderDigestEmail(report);

  try {
    const result = await deps.resendSend({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    });
    return { ok: true, id: result.id };
  } catch (err) {
    return {
      ok:    false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
