import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runMonitor, MonitorCommandOps, DeployedItem, MonitorRequest } from './monitor.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RUN_ID    = 'run-001';
const TENANT_ID = 'tenant-001';
const SITE_ID   = 'site-001';

function makeItem(overrides: Partial<DeployedItem> = {}): DeployedItem {
  return {
    id:          'action-001',
    url:         'https://example.com/page',
    run_id:      RUN_ID,
    tenant_id:   TENANT_ID,
    site_id:     SITE_ID,
    issue_type:  'META_TITLE_MISSING',
    deployed_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeOps(overrides: Partial<MonitorCommandOps> = {}): MonitorCommandOps {
  return {
    loadDeployedItems: async () => [],
    checkHttpStatus:   async () => ({ status: 200 }),
    checkLighthouse:   async () => null,
    checkGscIndexing:  async () => null,
    loadBaseline:      async () => null,
    saveRegressions:   async () => {},
    flagForRollback:   async () => {},
    ...overrides,
  };
}

function makeReq(overrides: Partial<MonitorRequest> = {}): MonitorRequest {
  return { run_id: RUN_ID, tenant_id: TENANT_ID, site_id: SITE_ID, check_type: 'http_status', ...overrides };
}

// ── http_status ───────────────────────────────────────────────────────────────

describe('http_status check', () => {
  it('URL returns 404 (was 200) → critical regression, passed=false', async () => {
    const item = makeItem({ url: 'https://example.com/gone' });
    const ops  = makeOps({
      loadDeployedItems: async () => [item],
      checkHttpStatus:   async () => ({ status: 404 }),
      loadBaseline:      async () => ({ http_status: 200 }),
    });

    const result = await runMonitor(makeReq({ check_type: 'http_status' }), ops);

    assert.equal(result.regressions.length, 1);
    assert.equal(result.regressions[0]!.severity, 'critical');
    assert.ok(result.regressions[0]!.issue.includes('404'));
    assert.equal(result.passed, false);
  });

  it('URL returns 200 (was 200) → no regression, passed=true', async () => {
    const ops = makeOps({
      loadDeployedItems: async () => [makeItem()],
      checkHttpStatus:   async () => ({ status: 200 }),
      loadBaseline:      async () => ({ http_status: 200 }),
    });

    const result = await runMonitor(makeReq({ check_type: 'http_status' }), ops);

    assert.equal(result.regressions.length, 0);
    assert.equal(result.passed, true);
    assert.equal(result.flagged_for_rollback, false);
  });

  it('3 URLs return 404 → flagged_for_rollback=true', async () => {
    const items = [
      makeItem({ id: 'a1', url: 'https://example.com/p1' }),
      makeItem({ id: 'a2', url: 'https://example.com/p2' }),
      makeItem({ id: 'a3', url: 'https://example.com/p3' }),
    ];
    let flagged = false;
    const ops = makeOps({
      loadDeployedItems: async () => items,
      checkHttpStatus:   async () => ({ status: 503 }),
      loadBaseline:      async () => ({ http_status: 200 }),
      flagForRollback:   async () => { flagged = true; },
    });

    const result = await runMonitor(makeReq({ check_type: 'http_status' }), ops);

    assert.equal(result.regressions.length, 3);
    assert.equal(result.flagged_for_rollback, true);
    assert.equal(flagged, true);
  });

  it('2 URLs return 404 → NOT flagged (threshold is 3)', async () => {
    const items = [
      makeItem({ id: 'a1', url: 'https://example.com/p1' }),
      makeItem({ id: 'a2', url: 'https://example.com/p2' }),
    ];
    let flagged = false;
    const ops = makeOps({
      loadDeployedItems: async () => items,
      checkHttpStatus:   async () => ({ status: 404 }),
      loadBaseline:      async () => ({ http_status: 200 }),
      flagForRollback:   async () => { flagged = true; },
    });

    const result = await runMonitor(makeReq({ check_type: 'http_status' }), ops);

    assert.equal(result.regressions.length, 2);
    assert.equal(result.flagged_for_rollback, false);
    assert.equal(flagged, false);
  });
});

// ── lighthouse ────────────────────────────────────────────────────────────────

describe('lighthouse check', () => {
  it('LCP increases 25% → warning regression, flagged_for_rollback=true', async () => {
    const ops = makeOps({
      loadDeployedItems: async () => [makeItem()],
      checkLighthouse:   async () => ({ lcp_ms: 3750, score: 65 }),
      loadBaseline:      async () => ({ lcp_ms: 3000 }),  // +25%
    });

    const result = await runMonitor(makeReq({ check_type: 'lighthouse' }), ops);

    assert.equal(result.regressions.length, 1);
    assert.equal(result.regressions[0]!.severity, 'warning');
    assert.ok(result.regressions[0]!.issue.includes('LCP'));
    assert.ok(result.regressions[0]!.issue.includes('25%'));
    assert.equal(result.flagged_for_rollback, true);
    assert.equal(result.passed, true);   // LCP regressions are warnings, not critical
  });

  it('LCP increases 15% → no regression (under 20% threshold)', async () => {
    const ops = makeOps({
      loadDeployedItems: async () => [makeItem()],
      checkLighthouse:   async () => ({ lcp_ms: 3450, score: 70 }),
      loadBaseline:      async () => ({ lcp_ms: 3000 }),  // +15%
    });

    const result = await runMonitor(makeReq({ check_type: 'lighthouse' }), ops);

    assert.equal(result.regressions.length, 0);
    assert.equal(result.flagged_for_rollback, false);
  });

  it('no baseline available → no regression (graceful skip)', async () => {
    const ops = makeOps({
      loadDeployedItems: async () => [makeItem()],
      checkLighthouse:   async () => ({ lcp_ms: 9999, score: 20 }),
      loadBaseline:      async () => null,   // no baseline
    });

    const result = await runMonitor(makeReq({ check_type: 'lighthouse' }), ops);

    assert.equal(result.regressions.length, 0);
    assert.equal(result.flagged_for_rollback, false);
  });

  it('checkLighthouse returns null (no API key) → passed, skipped', async () => {
    const ops = makeOps({
      loadDeployedItems: async () => [makeItem()],
      checkLighthouse:   async () => null,
      loadBaseline:      async () => ({ lcp_ms: 2000 }),
    });

    const result = await runMonitor(makeReq({ check_type: 'lighthouse' }), ops);

    assert.equal(result.urls_checked, 1);
    assert.equal(result.regressions.length, 0);
    assert.equal(result.passed, true);
  });
});

// ── gsc_indexing ──────────────────────────────────────────────────────────────

describe('gsc_indexing check', () => {
  it('was indexed, now not → warning regression', async () => {
    const ops = makeOps({
      loadDeployedItems: async () => [makeItem()],
      checkGscIndexing:  async () => ({ indexed: false }),
      loadBaseline:      async () => null,   // no baseline → assume was indexed
    });

    const result = await runMonitor(makeReq({ check_type: 'gsc_indexing' }), ops);

    assert.equal(result.regressions.length, 1);
    assert.equal(result.regressions[0]!.severity, 'warning');
    assert.ok(result.regressions[0]!.issue.includes('GSC'));
  });

  it('3 deindexed URLs → flagged_for_rollback=true', async () => {
    const items = [
      makeItem({ id: 'a1', url: 'https://example.com/p1' }),
      makeItem({ id: 'a2', url: 'https://example.com/p2' }),
      makeItem({ id: 'a3', url: 'https://example.com/p3' }),
    ];
    let flagged = false;
    const ops = makeOps({
      loadDeployedItems: async () => items,
      checkGscIndexing:  async () => ({ indexed: false }),
      loadBaseline:      async () => null,
      flagForRollback:   async () => { flagged = true; },
    });

    const result = await runMonitor(makeReq({ check_type: 'gsc_indexing' }), ops);

    assert.equal(result.regressions.length, 3);
    assert.equal(result.flagged_for_rollback, true);
    assert.equal(flagged, true);
  });

  it('checkGscIndexing returns null → passed, skipped (urls_checked=0)', async () => {
    const ops = makeOps({
      loadDeployedItems: async () => [makeItem()],
      checkGscIndexing:  async () => null,
    });

    const result = await runMonitor(makeReq({ check_type: 'gsc_indexing' }), ops);

    assert.equal(result.regressions.length, 0);
    assert.equal(result.passed, true);
    assert.equal(result.urls_checked, 0);
  });
});

// ── playwright stub ───────────────────────────────────────────────────────────

describe('playwright stub', () => {
  it('always returns passed=true with 0 regressions', async () => {
    const result = await runMonitor(makeReq({ check_type: 'playwright' }), makeOps());

    assert.equal(result.check_type, 'playwright');
    assert.equal(result.passed, true);
    assert.equal(result.regressions.length, 0);
    assert.equal(result.flagged_for_rollback, false);
  });
});

// ── edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('no deployed items → passed=true, 0 regressions', async () => {
    const ops = makeOps({ loadDeployedItems: async () => [] });
    const result = await runMonitor(makeReq({ check_type: 'http_status' }), ops);

    assert.equal(result.urls_checked, 0);
    assert.equal(result.regressions.length, 0);
    assert.equal(result.passed, true);
    assert.equal(result.flagged_for_rollback, false);
  });
});
