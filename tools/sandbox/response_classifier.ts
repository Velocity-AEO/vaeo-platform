/**
 * tools/sandbox/response_classifier.ts
 *
 * Classifies HTTP responses into precise diagnostic categories.
 * Distinguishes timeout, redirect, 404, non-HTML, and genuine content failures
 * so sandbox failures get actionable diagnostic data instead of generic reasons.
 *
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type ResponseType =
  | 'success'
  | 'timeout'
  | 'redirect'
  | 'not_found'
  | 'server_error'
  | 'non_html'
  | 'empty_body'
  | 'auth_required'
  | 'rate_limited'
  | 'network_error'
  | 'unknown';

export type SandboxAction =
  | 'proceed'
  | 'retry'
  | 'skip'
  | 'alert';

export interface ResponseClassification {
  response_type:      ResponseType;
  status_code:        number;
  content_type:       string;
  diagnostic_message: string;
  sandbox_action:     SandboxAction;
  is_retriable:       boolean;
  body_length:        number;
}

export interface ClassificationSummary {
  total:          number;
  by_type:        Record<ResponseType, number>;
  retriable:      number;
  actionable:     number;
  top_diagnostic: string;
}

// ── Diagnostic messages ──────────────────────────────────────────────────────

export const RESPONSE_DIAGNOSTIC_MESSAGES: Record<ResponseType, string> = {
  success:        'Page loaded successfully',
  timeout:        'Request timed out — server did not respond within deadline',
  redirect:       'Page returned a redirect — verify target URL is correct',
  not_found:      'Page returned 404 — URL may have changed or been deleted',
  server_error:   'Server returned 5xx error — site may be down or misconfigured',
  non_html:       'Response is not HTML — content-type indicates non-page resource',
  empty_body:     'Response body is empty — server returned no content',
  auth_required:  'Authentication required — credentials may be invalid or expired',
  rate_limited:   'Rate limited by server — too many requests in window',
  network_error:  'Network error — DNS failure, connection refused, or TLS error',
  unknown:        'Unclassified response — manual inspection needed',
};

// ── classifyStatusCode ───────────────────────────────────────────────────────

export function classifyStatusCode(status: number): ResponseType {
  try {
    if (typeof status !== 'number' || isNaN(status)) return 'unknown';
    if (status === 0) return 'network_error';
    if (status >= 200 && status < 300) return 'success';
    if (status === 301 || status === 302 || status === 307 || status === 308) return 'redirect';
    if (status === 401 || status === 403) return 'auth_required';
    if (status === 404 || status === 410) return 'not_found';
    if (status === 429) return 'rate_limited';
    if (status >= 500 && status < 600) return 'server_error';
    if (status >= 300 && status < 400) return 'redirect';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── classifyContentType ──────────────────────────────────────────────────────

export function classifyContentType(contentType: string): 'html' | 'non_html' | 'unknown' {
  try {
    if (!contentType || typeof contentType !== 'string') return 'unknown';
    const lower = contentType.toLowerCase();
    if (lower.includes('text/html') || lower.includes('application/xhtml')) return 'html';
    return 'non_html';
  } catch {
    return 'unknown';
  }
}

// ── determineSandboxAction ───────────────────────────────────────────────────

export function determineSandboxAction(responseType: ResponseType): SandboxAction {
  try {
    switch (responseType) {
      case 'success':       return 'proceed';
      case 'timeout':       return 'retry';
      case 'network_error': return 'retry';
      case 'rate_limited':  return 'retry';
      case 'server_error':  return 'retry';
      case 'redirect':      return 'skip';
      case 'not_found':     return 'skip';
      case 'non_html':      return 'skip';
      case 'empty_body':    return 'skip';
      case 'auth_required': return 'alert';
      default:              return 'skip';
    }
  } catch {
    return 'skip';
  }
}

// ── classifyResponse ─────────────────────────────────────────────────────────

export function classifyResponse(
  status_code:  number,
  content_type: string,
  body_length:  number,
  error?:       string,
): ResponseClassification {
  try {
    const safeStatus  = typeof status_code === 'number' ? status_code : 0;
    const safeCT      = typeof content_type === 'string' ? content_type : '';
    const safeLen     = typeof body_length === 'number' ? body_length : 0;
    const safeErr     = typeof error === 'string' ? error.toLowerCase() : '';

    // Timeout detection from error string
    if (safeErr.includes('timeout') || safeErr.includes('timed out') || safeErr.includes('aborterror')) {
      return buildClassification('timeout', safeStatus, safeCT, safeLen);
    }

    // Network error detection
    if (safeStatus === 0 && safeErr) {
      return buildClassification('network_error', safeStatus, safeCT, safeLen);
    }

    // Status-based classification
    const statusType = classifyStatusCode(safeStatus);
    if (statusType !== 'success') {
      return buildClassification(statusType, safeStatus, safeCT, safeLen);
    }

    // Success but empty body
    if (safeLen === 0) {
      return buildClassification('empty_body', safeStatus, safeCT, safeLen);
    }

    // Success but non-HTML content
    const ctType = classifyContentType(safeCT);
    if (ctType === 'non_html') {
      return buildClassification('non_html', safeStatus, safeCT, safeLen);
    }

    return buildClassification('success', safeStatus, safeCT, safeLen);
  } catch {
    return buildClassification('unknown', 0, '', 0);
  }
}

function buildClassification(
  response_type: ResponseType,
  status_code:   number,
  content_type:  string,
  body_length:   number,
): ResponseClassification {
  return {
    response_type,
    status_code,
    content_type,
    diagnostic_message: RESPONSE_DIAGNOSTIC_MESSAGES[response_type] ?? RESPONSE_DIAGNOSTIC_MESSAGES.unknown,
    sandbox_action:     determineSandboxAction(response_type),
    is_retriable:       determineSandboxAction(response_type) === 'retry',
    body_length,
  };
}

// ── buildClassificationSummary ───────────────────────────────────────────────

export function buildClassificationSummary(
  classifications: ResponseClassification[],
): ClassificationSummary {
  try {
    const arr = Array.isArray(classifications) ? classifications : [];
    const by_type: Record<string, number> = {};
    let retriable = 0;
    let actionable = 0;
    const diag_counts: Record<string, number> = {};

    for (const c of arr) {
      const rt = c?.response_type ?? 'unknown';
      by_type[rt] = (by_type[rt] ?? 0) + 1;
      if (c?.is_retriable) retriable++;
      if (c?.sandbox_action === 'alert') actionable++;
      const dm = c?.diagnostic_message ?? 'Unknown';
      diag_counts[dm] = (diag_counts[dm] ?? 0) + 1;
    }

    let top_diagnostic = '';
    let top_count = 0;
    for (const [msg, count] of Object.entries(diag_counts)) {
      if (count > top_count) {
        top_count = count;
        top_diagnostic = msg;
      }
    }

    return {
      total: arr.length,
      by_type: by_type as Record<ResponseType, number>,
      retriable,
      actionable,
      top_diagnostic,
    };
  } catch {
    return {
      total: 0,
      by_type: {} as Record<ResponseType, number>,
      retriable: 0,
      actionable: 0,
      top_diagnostic: '',
    };
  }
}
