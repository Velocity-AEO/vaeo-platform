import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkGraphIntegrity,
  batchCheckIntegrity,
  STALE_HOURS_THRESHOLD,
} from './graph_integrity_checker.js';

// ── STALE_HOURS_THRESHOLD ───────────────────────────────────────────────────

describe('STALE_HOURS_THRESHOLD', () => {
  it('equals 48', () => {
    assert.equal(STALE_HOURS_THRESHOLD, 48);
  });
});

// ── checkGraphIntegrity ─────────────────────────────────────────────────────

describe('checkGraphIntegrity', () => {
  it('detects empty graph', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadPageUrlsFn: async () => [],
      loadLinksFn: async () => [],
      loadCanonicalsFn: async () => [],
      getLastBuiltAtFn: async () => null,
    });
    assert.ok(result.issues.some((i) => i.type === 'empty_graph'));
  });

  it('detects dangling links', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadPageUrlsFn: async () => ['https://a.com/'],
      loadLinksFn: async () => [{ source_url: 'https://a.com/', destination_url: 'https://a.com/missing' }],
      loadCanonicalsFn: async () => [],
      getLastBuiltAtFn: async () => new Date().toISOString(),
    });
    assert.ok(result.issues.some((i) => i.type === 'dangling_link'));
  });

  it('detects orphaned nodes', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadPageUrlsFn: async () => ['https://a.com/', 'https://a.com/orphan'],
      loadLinksFn: async () => [{ source_url: 'https://a.com/', destination_url: 'https://a.com/' }],
      loadCanonicalsFn: async () => [],
      getLastBuiltAtFn: async () => new Date().toISOString(),
    });
    assert.ok(result.issues.some((i) => i.type === 'orphaned_node'));
  });

  it('detects duplicate edges', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadPageUrlsFn: async () => ['https://a.com/', 'https://a.com/p'],
      loadLinksFn: async () => [
        { source_url: 'https://a.com/', destination_url: 'https://a.com/p' },
        { source_url: 'https://a.com/', destination_url: 'https://a.com/p' },
      ],
      loadCanonicalsFn: async () => [],
      getLastBuiltAtFn: async () => new Date().toISOString(),
    });
    assert.ok(result.issues.some((i) => i.type === 'duplicate_edge'));
  });

  it('detects self loops', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadPageUrlsFn: async () => ['https://a.com/'],
      loadLinksFn: async () => [{ source_url: 'https://a.com/', destination_url: 'https://a.com/' }],
      loadCanonicalsFn: async () => [],
      getLastBuiltAtFn: async () => new Date().toISOString(),
    });
    assert.ok(result.issues.some((i) => i.type === 'self_loop'));
  });

  it('detects missing canonical references', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadPageUrlsFn: async () => ['https://a.com/'],
      loadLinksFn: async () => [],
      loadCanonicalsFn: async () => [{ url: 'https://a.com/', canonical_url: 'https://a.com/missing' }],
      getLastBuiltAtFn: async () => new Date().toISOString(),
    });
    assert.ok(result.issues.some((i) => i.type === 'missing_canonical_ref'));
  });

  it('detects stale data', async () => {
    const old = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const result = await checkGraphIntegrity('s1', {
      loadPageUrlsFn: async () => ['https://a.com/'],
      loadLinksFn: async () => [{ source_url: 'https://a.com/', destination_url: 'https://a.com/' }],
      loadCanonicalsFn: async () => [],
      getLastBuiltAtFn: async () => old,
    });
    assert.ok(result.issues.some((i) => i.type === 'stale_data'));
  });

  it('is_healthy when no critical or warning issues', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadPageUrlsFn: async () => ['https://a.com/', 'https://a.com/p'],
      loadLinksFn: async () => [{ source_url: 'https://a.com/', destination_url: 'https://a.com/p' }],
      loadCanonicalsFn: async () => [],
      getLastBuiltAtFn: async () => new Date().toISOString(),
    });
    assert.equal(result.is_healthy, true);
  });

  it('counts severities correctly', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadPageUrlsFn: async () => [],
      loadLinksFn: async () => [],
      loadCanonicalsFn: async () => [],
      getLastBuiltAtFn: async () => null,
    });
    assert.ok(result.critical_count >= 1);
  });

  it('returns error result for missing site_id', async () => {
    const result = await checkGraphIntegrity('', {});
    assert.equal(result.is_healthy, false);
    assert.ok(result.issues.length > 0);
  });

  it('all deps injectable', async () => {
    let calledSite = '';
    await checkGraphIntegrity('test_site', {
      loadPageUrlsFn: async (s) => { calledSite = s; return []; },
      loadLinksFn: async () => [],
      loadCanonicalsFn: async () => [],
      getLastBuiltAtFn: async () => null,
    });
    assert.equal(calledSite, 'test_site');
  });

  it('returns on error', async () => {
    const result = await checkGraphIntegrity('s1', {
      loadPageUrlsFn: async () => { throw new Error('fail'); },
    });
    assert.equal(result.is_healthy, false);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => checkGraphIntegrity(null as any, null as any));
  });
});

// ── batchCheckIntegrity ─────────────────────────────────────────────────────

describe('batchCheckIntegrity', () => {
  it('checks multiple sites', async () => {
    const results = await batchCheckIntegrity(['s1', 's2'], {
      loadPageUrlsFn: async () => ['https://a.com/'],
      loadLinksFn: async () => [],
      loadCanonicalsFn: async () => [],
      getLastBuiltAtFn: async () => new Date().toISOString(),
    });
    assert.equal(results.length, 2);
  });

  it('never throws on null', async () => {
    await assert.doesNotReject(() => batchCheckIntegrity(null as any, null as any));
  });
});
