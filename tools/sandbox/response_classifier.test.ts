/**
 * tools/sandbox/response_classifier.test.ts
 *
 * Tests for response type classifier.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyStatusCode,
  classifyContentType,
  determineSandboxAction,
  classifyResponse,
  buildClassificationSummary,
  RESPONSE_DIAGNOSTIC_MESSAGES,
  type ResponseClassification,
} from './response_classifier.js';

// ── classifyStatusCode ───────────────────────────────────────────────────────

describe('classifyStatusCode', () => {
  it('returns success for 200', () => {
    assert.equal(classifyStatusCode(200), 'success');
  });

  it('returns success for 201', () => {
    assert.equal(classifyStatusCode(201), 'success');
  });

  it('returns redirect for 301', () => {
    assert.equal(classifyStatusCode(301), 'redirect');
  });

  it('returns redirect for 302', () => {
    assert.equal(classifyStatusCode(302), 'redirect');
  });

  it('returns redirect for 307', () => {
    assert.equal(classifyStatusCode(307), 'redirect');
  });

  it('returns redirect for 308', () => {
    assert.equal(classifyStatusCode(308), 'redirect');
  });

  it('returns not_found for 404', () => {
    assert.equal(classifyStatusCode(404), 'not_found');
  });

  it('returns not_found for 410', () => {
    assert.equal(classifyStatusCode(410), 'not_found');
  });

  it('returns auth_required for 401', () => {
    assert.equal(classifyStatusCode(401), 'auth_required');
  });

  it('returns auth_required for 403', () => {
    assert.equal(classifyStatusCode(403), 'auth_required');
  });

  it('returns rate_limited for 429', () => {
    assert.equal(classifyStatusCode(429), 'rate_limited');
  });

  it('returns server_error for 500', () => {
    assert.equal(classifyStatusCode(500), 'server_error');
  });

  it('returns server_error for 503', () => {
    assert.equal(classifyStatusCode(503), 'server_error');
  });

  it('returns network_error for 0', () => {
    assert.equal(classifyStatusCode(0), 'network_error');
  });

  it('returns unknown for NaN', () => {
    assert.equal(classifyStatusCode(NaN), 'unknown');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => classifyStatusCode(null as any));
  });
});

// ── classifyContentType ──────────────────────────────────────────────────────

describe('classifyContentType', () => {
  it('returns html for text/html', () => {
    assert.equal(classifyContentType('text/html'), 'html');
  });

  it('returns html for text/html; charset=utf-8', () => {
    assert.equal(classifyContentType('text/html; charset=utf-8'), 'html');
  });

  it('returns html for application/xhtml+xml', () => {
    assert.equal(classifyContentType('application/xhtml+xml'), 'html');
  });

  it('returns non_html for application/json', () => {
    assert.equal(classifyContentType('application/json'), 'non_html');
  });

  it('returns non_html for image/png', () => {
    assert.equal(classifyContentType('image/png'), 'non_html');
  });

  it('returns unknown for empty string', () => {
    assert.equal(classifyContentType(''), 'unknown');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => classifyContentType(null as any));
  });
});

// ── determineSandboxAction ───────────────────────────────────────────────────

describe('determineSandboxAction', () => {
  it('returns proceed for success', () => {
    assert.equal(determineSandboxAction('success'), 'proceed');
  });

  it('returns retry for timeout', () => {
    assert.equal(determineSandboxAction('timeout'), 'retry');
  });

  it('returns retry for network_error', () => {
    assert.equal(determineSandboxAction('network_error'), 'retry');
  });

  it('returns retry for rate_limited', () => {
    assert.equal(determineSandboxAction('rate_limited'), 'retry');
  });

  it('returns retry for server_error', () => {
    assert.equal(determineSandboxAction('server_error'), 'retry');
  });

  it('returns skip for redirect', () => {
    assert.equal(determineSandboxAction('redirect'), 'skip');
  });

  it('returns skip for not_found', () => {
    assert.equal(determineSandboxAction('not_found'), 'skip');
  });

  it('returns skip for non_html', () => {
    assert.equal(determineSandboxAction('non_html'), 'skip');
  });

  it('returns alert for auth_required', () => {
    assert.equal(determineSandboxAction('auth_required'), 'alert');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => determineSandboxAction(null as any));
  });
});

// ── classifyResponse ─────────────────────────────────────────────────────────

describe('classifyResponse', () => {
  it('classifies successful HTML response', () => {
    const c = classifyResponse(200, 'text/html', 5000);
    assert.equal(c.response_type, 'success');
    assert.equal(c.sandbox_action, 'proceed');
    assert.equal(c.is_retriable, false);
  });

  it('classifies timeout from error', () => {
    const c = classifyResponse(0, '', 0, 'Request timed out');
    assert.equal(c.response_type, 'timeout');
    assert.equal(c.sandbox_action, 'retry');
    assert.equal(c.is_retriable, true);
  });

  it('classifies AbortError as timeout', () => {
    const c = classifyResponse(0, '', 0, 'AbortError: The operation was aborted');
    assert.equal(c.response_type, 'timeout');
  });

  it('classifies 404 response', () => {
    const c = classifyResponse(404, 'text/html', 100);
    assert.equal(c.response_type, 'not_found');
    assert.equal(c.sandbox_action, 'skip');
  });

  it('classifies 301 redirect', () => {
    const c = classifyResponse(301, '', 0);
    assert.equal(c.response_type, 'redirect');
    assert.equal(c.sandbox_action, 'skip');
  });

  it('classifies 500 server error', () => {
    const c = classifyResponse(500, 'text/html', 200);
    assert.equal(c.response_type, 'server_error');
    assert.equal(c.is_retriable, true);
  });

  it('classifies empty body on 200', () => {
    const c = classifyResponse(200, 'text/html', 0);
    assert.equal(c.response_type, 'empty_body');
    assert.equal(c.sandbox_action, 'skip');
  });

  it('classifies non-HTML content on 200', () => {
    const c = classifyResponse(200, 'application/json', 500);
    assert.equal(c.response_type, 'non_html');
    assert.equal(c.sandbox_action, 'skip');
  });

  it('classifies 401 as auth_required', () => {
    const c = classifyResponse(401, '', 0);
    assert.equal(c.response_type, 'auth_required');
    assert.equal(c.sandbox_action, 'alert');
  });

  it('classifies 429 as rate_limited', () => {
    const c = classifyResponse(429, '', 0);
    assert.equal(c.response_type, 'rate_limited');
    assert.equal(c.is_retriable, true);
  });

  it('classifies network error (status 0 with error)', () => {
    const c = classifyResponse(0, '', 0, 'ECONNREFUSED');
    assert.equal(c.response_type, 'network_error');
    assert.equal(c.is_retriable, true);
  });

  it('has correct diagnostic message', () => {
    const c = classifyResponse(404, 'text/html', 100);
    assert.equal(c.diagnostic_message, RESPONSE_DIAGNOSTIC_MESSAGES.not_found);
  });

  it('includes body_length', () => {
    const c = classifyResponse(200, 'text/html', 12345);
    assert.equal(c.body_length, 12345);
  });

  it('never throws on all nulls', () => {
    assert.doesNotThrow(() => classifyResponse(null as any, null as any, null as any, null as any));
  });
});

// ── buildClassificationSummary ───────────────────────────────────────────────

describe('buildClassificationSummary', () => {
  function makeC(overrides?: Partial<ResponseClassification>): ResponseClassification {
    return {
      response_type: 'success',
      status_code: 200,
      content_type: 'text/html',
      diagnostic_message: 'Page loaded successfully',
      sandbox_action: 'proceed',
      is_retriable: false,
      body_length: 1000,
      ...overrides,
    };
  }

  it('counts total correctly', () => {
    const s = buildClassificationSummary([makeC(), makeC(), makeC()]);
    assert.equal(s.total, 3);
  });

  it('groups by type', () => {
    const s = buildClassificationSummary([
      makeC({ response_type: 'success' }),
      makeC({ response_type: 'timeout' }),
      makeC({ response_type: 'timeout' }),
    ]);
    assert.equal(s.by_type.success, 1);
    assert.equal(s.by_type.timeout, 2);
  });

  it('counts retriable', () => {
    const s = buildClassificationSummary([
      makeC({ is_retriable: true }),
      makeC({ is_retriable: false }),
      makeC({ is_retriable: true }),
    ]);
    assert.equal(s.retriable, 2);
  });

  it('counts actionable (alert)', () => {
    const s = buildClassificationSummary([
      makeC({ sandbox_action: 'alert' }),
      makeC({ sandbox_action: 'proceed' }),
    ]);
    assert.equal(s.actionable, 1);
  });

  it('finds top diagnostic message', () => {
    const s = buildClassificationSummary([
      makeC({ diagnostic_message: 'A' }),
      makeC({ diagnostic_message: 'B' }),
      makeC({ diagnostic_message: 'B' }),
    ]);
    assert.equal(s.top_diagnostic, 'B');
  });

  it('returns empty for empty array', () => {
    const s = buildClassificationSummary([]);
    assert.equal(s.total, 0);
    assert.equal(s.top_diagnostic, '');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildClassificationSummary(null as any));
  });
});
