/**
 * tools/apps/environment_learning_writer.test.ts
 *
 * Tests for environment learning writer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeEnvironmentScanToLearning } from './environment_learning_writer.js';
import { scanEnvironment } from './environment_scanner.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function htmlWith(...snippets: string[]): string {
  return `<html><head>${snippets.join('\n')}</head><body></body></html>`;
}

const KLAVIYO  = '<script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>';
const INTERCOM = '<script src="https://widget.intercom.io/widget/abc"></script><div id="intercom-container"></div>';

function makeScan(snippets: string[]) {
  return scanEnvironment('s1', '/', htmlWith(...snippets));
}

// ── Basic writing ────────────────────────────────────────────────────────────

describe('writeEnvironmentScanToLearning — basic', () => {
  it('writes scan to site metadata', async () => {
    let capturedKey = '';
    let capturedValue: unknown = null;
    const result = await writeEnvironmentScanToLearning(makeScan([KLAVIYO]), {
      upsertSiteMeta: async (_siteId, key, value) => {
        capturedKey = key;
        capturedValue = value;
      },
    });
    assert.equal(result.written, true);
    assert.equal(capturedKey, 'environment_scan');
    assert.ok(capturedValue);
  });

  it('returns app count', async () => {
    const result = await writeEnvironmentScanToLearning(makeScan([KLAVIYO, INTERCOM]), {
      upsertSiteMeta: async () => {},
    });
    assert.ok(result.app_count >= 2);
  });

  it('includes app details in written data', async () => {
    let capturedValue: Record<string, unknown> = {};
    await writeEnvironmentScanToLearning(makeScan([KLAVIYO]), {
      upsertSiteMeta: async (_s, _k, value) => { capturedValue = value as Record<string, unknown>; },
    });
    const apps = capturedValue['detected_apps'] as Array<{ app_id: string }>;
    assert.ok(apps.length > 0);
    assert.ok(apps[0]!.app_id);
  });

  it('includes scanned_at in written data', async () => {
    let capturedValue: Record<string, unknown> = {};
    await writeEnvironmentScanToLearning(makeScan([KLAVIYO]), {
      upsertSiteMeta: async (_s, _k, value) => { capturedValue = value as Record<string, unknown>; },
    });
    assert.ok(typeof capturedValue['scanned_at'] === 'string');
  });

  it('includes total_spend and vaeo_savings', async () => {
    let capturedValue: Record<string, unknown> = {};
    await writeEnvironmentScanToLearning(makeScan([KLAVIYO]), {
      upsertSiteMeta: async (_s, _k, value) => { capturedValue = value as Record<string, unknown>; },
    });
    assert.ok('total_spend' in capturedValue);
    assert.ok('vaeo_savings' in capturedValue);
  });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe('writeEnvironmentScanToLearning — errors', () => {
  it('returns written=false when no deps', async () => {
    const result = await writeEnvironmentScanToLearning(makeScan([KLAVIYO]));
    assert.equal(result.written, false);
  });

  it('returns written=false when upsertSiteMeta is undefined', async () => {
    const result = await writeEnvironmentScanToLearning(makeScan([KLAVIYO]), {});
    assert.equal(result.written, false);
  });

  it('returns written=false on upsert error', async () => {
    const result = await writeEnvironmentScanToLearning(makeScan([KLAVIYO]), {
      upsertSiteMeta: async () => { throw new Error('DB error'); },
    });
    assert.equal(result.written, false);
  });

  it('handles null scan gracefully', async () => {
    const result = await writeEnvironmentScanToLearning(
      null as unknown as ReturnType<typeof scanEnvironment>,
      { upsertSiteMeta: async () => {} },
    );
    assert.equal(result.written, false);
  });

  it('returns app_count=0 on failure', async () => {
    const result = await writeEnvironmentScanToLearning(makeScan([KLAVIYO]), {
      upsertSiteMeta: async () => { throw new Error('fail'); },
    });
    assert.equal(result.app_count, 0);
  });
});
