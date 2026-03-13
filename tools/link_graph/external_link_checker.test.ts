/**
 * tools/link_graph/external_link_checker.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDomainReputation,
  checkExternalLink,
  checkAllExternalLinks,
  summarizeExternalAudit,
  LOW_VALUE_TLDS,
  TRUSTED_DOMAINS,
  type ExternalLinkCheckResult,
} from './external_link_checker.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(status: number, finalUrl?: string): (url: string, init?: any) => Promise<Response> {
  return async (url: string) => ({
    status,
    ok: status < 400,
    url: finalUrl ?? url,
    text: async () => '',
    json: async () => ({}),
  } as unknown as Response);
}

function makeResult(overrides: Partial<ExternalLinkCheckResult> = {}): ExternalLinkCheckResult {
  return {
    url:                'https://example.com/page',
    destination_url:    'https://target.com/resource',
    destination_domain: 'target.com',
    status_code:        200,
    is_broken:          false,
    is_redirect:        false,
    final_url:          null,
    redirect_hops:      0,
    response_time_ms:   100,
    is_nofollow:        false,
    domain_reputation:  'unknown',
    check_error:        null,
    checked_at:         new Date().toISOString(),
    ...overrides,
  };
}

// ── classifyDomainReputation ──────────────────────────────────────────────────

describe('classifyDomainReputation', () => {
  it('returns trusted for google.com', () => {
    assert.equal(classifyDomainReputation('google.com'), 'trusted');
  });

  it('returns trusted for subdomain of google.com', () => {
    assert.equal(classifyDomainReputation('news.google.com'), 'trusted');
  });

  it('returns trusted for .gov domain', () => {
    assert.equal(classifyDomainReputation('whitehouse.gov'), 'trusted');
  });

  it('returns trusted for .edu domain', () => {
    assert.equal(classifyDomainReputation('mit.edu'), 'trusted');
  });

  it('returns trusted for wikipedia.org', () => {
    assert.equal(classifyDomainReputation('wikipedia.org'), 'trusted');
  });

  it('returns trusted for github.com', () => {
    assert.equal(classifyDomainReputation('github.com'), 'trusted');
  });

  it('returns low_value for .xyz domain', () => {
    assert.equal(classifyDomainReputation('spamsite.xyz'), 'low_value');
  });

  it('returns low_value for .tk domain', () => {
    assert.equal(classifyDomainReputation('free.tk'), 'low_value');
  });

  it('returns low_value for .biz domain', () => {
    assert.equal(classifyDomainReputation('site.biz'), 'low_value');
  });

  it('returns low_value for .info domain', () => {
    assert.equal(classifyDomainReputation('info-site.info'), 'low_value');
  });

  it('returns unknown by default for normal domain', () => {
    assert.equal(classifyDomainReputation('somestore.com'), 'unknown');
  });

  it('returns unknown for empty string', () => {
    assert.equal(classifyDomainReputation(''), 'unknown');
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => classifyDomainReputation(null as any));
  });
});

// ── checkExternalLink ─────────────────────────────────────────────────────────

describe('checkExternalLink', () => {
  it('returns is_broken=false for 200', async () => {
    const result = await checkExternalLink('https://src.com/', 'https://target.com/', {
      fetchFn: mockFetch(200),
    });
    assert.equal(result.is_broken, false);
  });

  it('returns is_broken=true for 404', async () => {
    const result = await checkExternalLink('https://src.com/', 'https://target.com/missing', {
      fetchFn: mockFetch(404),
    });
    assert.equal(result.is_broken, true);
  });

  it('records status_code', async () => {
    const result = await checkExternalLink('https://src.com/', 'https://target.com/', {
      fetchFn: mockFetch(200),
    });
    assert.equal(result.status_code, 200);
  });

  it('records response_time_ms as non-negative number', async () => {
    const result = await checkExternalLink('https://src.com/', 'https://target.com/', {
      fetchFn: mockFetch(200),
    });
    assert.ok(result.response_time_ms >= 0);
  });

  it('detects redirect when final_url differs', async () => {
    const result = await checkExternalLink('https://src.com/', 'https://old.com/', {
      fetchFn: mockFetch(200, 'https://new.com/'),
    });
    assert.equal(result.is_redirect, true);
    assert.equal(result.final_url, 'https://new.com/');
  });

  it('sets is_broken=true and check_error on network failure', async () => {
    const result = await checkExternalLink('https://src.com/', 'https://target.com/', {
      fetchFn: async () => { throw new Error('ECONNREFUSED'); },
    });
    assert.equal(result.is_broken, true);
    assert.ok(result.check_error !== null);
  });

  it('classifies domain_reputation for destination', async () => {
    const result = await checkExternalLink('https://src.com/', 'https://spamsite.xyz/page', {
      fetchFn: mockFetch(200),
    });
    assert.equal(result.domain_reputation, 'low_value');
  });

  it('sets checked_at ISO timestamp', async () => {
    const result = await checkExternalLink('https://src.com/', 'https://target.com/', {
      fetchFn: mockFetch(200),
    });
    assert.ok(result.checked_at.includes('T'));
  });

  it('never throws on empty destination_url', async () => {
    await assert.doesNotReject(() => checkExternalLink('https://src.com/', ''));
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() => checkExternalLink(null as any, null as any));
  });
});

// ── checkAllExternalLinks ─────────────────────────────────────────────────────

describe('checkAllExternalLinks', () => {
  it('deduplicates by destination_url (checks each destination once)', async () => {
    const checked: string[] = [];
    const links = [
      { source_url: 'https://src.com/a', destination_url: 'https://target.com/', destination_domain: 'target.com', anchor_text: null, is_nofollow: false, status_code: null, is_broken: false, discovered_at: '' },
      { source_url: 'https://src.com/b', destination_url: 'https://target.com/', destination_domain: 'target.com', anchor_text: null, is_nofollow: false, status_code: null, is_broken: false, discovered_at: '' },
    ];
    const results = await checkAllExternalLinks('site_1', links, {
      checkFn: async (src, dest) => {
        checked.push(dest);
        return makeResult({ destination_url: dest });
      },
    });
    assert.equal(checked.length, 1, 'Should only check each unique destination once');
    assert.equal(results.length, 1);
  });

  it('processes multiple unique destinations', async () => {
    const links = [
      { source_url: 'https://src.com/', destination_url: 'https://a.com/', destination_domain: 'a.com', anchor_text: null, is_nofollow: false, status_code: null, is_broken: false, discovered_at: '' },
      { source_url: 'https://src.com/', destination_url: 'https://b.com/', destination_domain: 'b.com', anchor_text: null, is_nofollow: false, status_code: null, is_broken: false, discovered_at: '' },
    ];
    const results = await checkAllExternalLinks('site_1', links, {
      checkFn: async (src, dest) => makeResult({ destination_url: dest }),
    });
    assert.equal(results.length, 2);
  });

  it('calls saveFn with results', async () => {
    let saved = false;
    const links = [
      { source_url: 'https://src.com/', destination_url: 'https://a.com/', destination_domain: 'a.com', anchor_text: null, is_nofollow: false, status_code: null, is_broken: false, discovered_at: '' },
    ];
    await checkAllExternalLinks('site_1', links, {
      checkFn: async () => makeResult(),
      saveFn: async () => { saved = true; return true; },
    });
    assert.equal(saved, true);
  });

  it('returns empty array for empty links', async () => {
    const results = await checkAllExternalLinks('site_1', []);
    assert.deepEqual(results, []);
  });

  it('all deps injectable', async () => {
    let checkCalled = false;
    const links = [{ source_url: 's', destination_url: 'https://d.com/', destination_domain: 'd.com', anchor_text: null, is_nofollow: false, status_code: null, is_broken: false, discovered_at: '' }];
    await checkAllExternalLinks('site_1', links, {
      checkFn: async () => { checkCalled = true; return makeResult(); },
    });
    assert.equal(checkCalled, true);
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(() => checkAllExternalLinks(null as any, null as any));
  });
});

// ── summarizeExternalAudit ────────────────────────────────────────────────────

describe('summarizeExternalAudit', () => {
  it('counts broken links correctly', () => {
    const results = [makeResult({ is_broken: true }), makeResult(), makeResult()];
    assert.equal(summarizeExternalAudit(results).broken_count, 1);
  });

  it('counts redirect links correctly', () => {
    const results = [makeResult({ is_redirect: true }), makeResult()];
    assert.equal(summarizeExternalAudit(results).redirect_count, 1);
  });

  it('counts low_value domains correctly', () => {
    const results = [
      makeResult({ domain_reputation: 'low_value' }),
      makeResult({ domain_reputation: 'trusted' }),
    ];
    assert.equal(summarizeExternalAudit(results).low_value_domain_count, 1);
  });

  it('counts trusted domains correctly', () => {
    const results = [
      makeResult({ domain_reputation: 'trusted' }),
      makeResult({ domain_reputation: 'unknown' }),
    ];
    assert.equal(summarizeExternalAudit(results).trusted_domain_count, 1);
  });

  it('calculates avg response time', () => {
    const results = [
      makeResult({ response_time_ms: 100 }),
      makeResult({ response_time_ms: 200 }),
    ];
    assert.equal(summarizeExternalAudit(results).avg_response_time_ms, 150);
  });

  it('returns null avg when no results', () => {
    assert.equal(summarizeExternalAudit([]).avg_response_time_ms, null);
  });

  it('finds slowest domain', () => {
    const results = [
      makeResult({ destination_domain: 'fast.com', response_time_ms: 50 }),
      makeResult({ destination_domain: 'slow.com', response_time_ms: 3000 }),
    ];
    assert.equal(summarizeExternalAudit(results).slowest_domain, 'slow.com');
  });

  it('groups domains by link count', () => {
    const results = [
      makeResult({ destination_domain: 'popular.com' }),
      makeResult({ destination_domain: 'popular.com' }),
      makeResult({ destination_domain: 'rare.com' }),
    ];
    const summary = summarizeExternalAudit(results);
    assert.equal(summary.domains_by_link_count[0]?.domain, 'popular.com');
    assert.equal(summary.domains_by_link_count[0]?.count, 2);
  });

  it('returns total_checked correctly', () => {
    const results = [makeResult(), makeResult(), makeResult()];
    assert.equal(summarizeExternalAudit(results).total_checked, 3);
  });

  it('never throws on empty array', () => {
    assert.doesNotThrow(() => summarizeExternalAudit([]));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => summarizeExternalAudit(null as any));
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('LOW_VALUE_TLDS contains .xyz', () => {
    assert.ok(LOW_VALUE_TLDS.includes('.xyz'));
  });

  it('LOW_VALUE_TLDS contains .tk', () => {
    assert.ok(LOW_VALUE_TLDS.includes('.tk'));
  });

  it('TRUSTED_DOMAINS contains google.com', () => {
    assert.ok(TRUSTED_DOMAINS.includes('google.com'));
  });

  it('TRUSTED_DOMAINS contains github.com', () => {
    assert.ok(TRUSTED_DOMAINS.includes('github.com'));
  });
});
