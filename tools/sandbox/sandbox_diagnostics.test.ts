/**
 * tools/sandbox/sandbox_diagnostics.test.ts
 *
 * Tests for sandbox diagnostics loader.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSiteDiagnostics,
  type SandboxDiagnosticRecord,
} from './sandbox_diagnostics.js';
import type { ResponseClassification } from './response_classifier.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeClassification(overrides?: Partial<ResponseClassification>): ResponseClassification {
  return {
    response_type: 'success',
    status_code: 200,
    content_type: 'text/html',
    diagnostic_message: 'Page loaded successfully',
    sandbox_action: 'proceed',
    is_retriable: false,
    body_length: 5000,
    ...overrides,
  };
}

function makeRecord(overrides?: Partial<SandboxDiagnosticRecord>): SandboxDiagnosticRecord {
  return {
    fix_id: 'fix-1',
    url: 'https://example.com/page',
    run_date: '2026-03-10T00:00:00Z',
    response_classifications: [makeClassification()],
    ...overrides,
  };
}

// ── loadSiteDiagnostics ──────────────────────────────────────────────────────

describe('loadSiteDiagnostics', () => {
  it('returns report with correct site_id', async () => {
    const report = await loadSiteDiagnostics('site-1', 7, {
      loadRunsFn: async () => [makeRecord()],
    });
    assert.equal(report.site_id, 'site-1');
  });

  it('returns correct total_runs', async () => {
    const report = await loadSiteDiagnostics('site-1', 7, {
      loadRunsFn: async () => [makeRecord(), makeRecord()],
    });
    assert.equal(report.total_runs, 2);
  });

  it('builds classification summary', async () => {
    const report = await loadSiteDiagnostics('site-1', 7, {
      loadRunsFn: async () => [
        makeRecord({ response_classifications: [
          makeClassification({ response_type: 'success' }),
          makeClassification({ response_type: 'timeout' }),
        ]}),
      ],
    });
    assert.equal(report.classification_summary.total, 2);
    assert.equal(report.classification_summary.by_type.success, 1);
    assert.equal(report.classification_summary.by_type.timeout, 1);
  });

  it('collects recent failures', async () => {
    const report = await loadSiteDiagnostics('site-1', 7, {
      loadRunsFn: async () => [
        makeRecord({ response_classifications: [
          makeClassification({ response_type: 'not_found', diagnostic_message: '404 error', sandbox_action: 'skip' }),
        ]}),
      ],
    });
    assert.equal(report.recent_failures.length, 1);
    assert.equal(report.recent_failures[0].response_type, 'not_found');
  });

  it('excludes successes from recent_failures', async () => {
    const report = await loadSiteDiagnostics('site-1', 7, {
      loadRunsFn: async () => [
        makeRecord({ response_classifications: [makeClassification({ response_type: 'success' })] }),
      ],
    });
    assert.equal(report.recent_failures.length, 0);
  });

  it('limits recent_failures to 20', async () => {
    const records: SandboxDiagnosticRecord[] = [];
    for (let i = 0; i < 25; i++) {
      records.push(makeRecord({
        fix_id: `fix-${i}`,
        response_classifications: [
          makeClassification({ response_type: 'timeout' }),
        ],
      }));
    }
    const report = await loadSiteDiagnostics('site-1', 7, {
      loadRunsFn: async () => records,
    });
    assert.equal(report.recent_failures.length, 20);
  });

  it('returns empty for empty site_id', async () => {
    const report = await loadSiteDiagnostics('', 7);
    assert.equal(report.total_runs, 0);
  });

  it('returns empty with default deps', async () => {
    const report = await loadSiteDiagnostics('site-1', 7);
    assert.equal(report.total_runs, 0);
  });

  it('returns empty on error', async () => {
    const report = await loadSiteDiagnostics('site-1', 7, {
      loadRunsFn: async () => { throw new Error('db down'); },
    });
    assert.equal(report.total_runs, 0);
  });

  it('all deps injectable', async () => {
    let called = false;
    await loadSiteDiagnostics('site-1', 7, {
      loadRunsFn: async () => { called = true; return []; },
    });
    assert.equal(called, true);
  });

  it('never throws on any path', async () => {
    await assert.doesNotReject(() => loadSiteDiagnostics(null as any, null as any, null as any));
  });
});
