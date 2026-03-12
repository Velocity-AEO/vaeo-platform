/**
 * tools/gsc/gsc_property_manager.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPropertyUrl,
  generateVerificationTag,
  buildVerificationMetaTag,
  addPropertyToGSC,
  checkVerificationStatus,
} from './gsc_property_manager.ts';

// ── buildPropertyUrl ──────────────────────────────────────────────────────────

describe('buildPropertyUrl', () => {
  it('returns sc-domain: format', () => {
    assert.equal(buildPropertyUrl('example.com'), 'sc-domain:example.com');
  });

  it('strips https:// prefix', () => {
    assert.equal(buildPropertyUrl('https://example.com'), 'sc-domain:example.com');
  });

  it('strips http:// prefix', () => {
    assert.equal(buildPropertyUrl('http://example.com'), 'sc-domain:example.com');
  });

  it('strips trailing slash', () => {
    assert.equal(buildPropertyUrl('example.com/'), 'sc-domain:example.com');
  });

  it('never throws on empty string', () => {
    assert.doesNotThrow(() => buildPropertyUrl(''));
  });

  it('never throws on null', () => {
    assert.doesNotThrow(() => buildPropertyUrl(null as never));
  });
});

// ── generateVerificationTag ───────────────────────────────────────────────────

describe('generateVerificationTag', () => {
  it('includes site_id', () => {
    const tag = generateVerificationTag('site_1', 'acct_1');
    assert.ok(tag.includes('site_1'));
  });

  it('includes account_id', () => {
    const tag = generateVerificationTag('site_1', 'acct_1');
    assert.ok(tag.includes('acct_1'));
  });

  it('starts with vaeo-gsc-verify', () => {
    const tag = generateVerificationTag('s', 'a');
    assert.ok(tag.startsWith('vaeo-gsc-verify'));
  });

  it('is at most 64 characters', () => {
    const tag = generateVerificationTag(
      'a_very_long_site_id_that_exceeds_limits',
      'a_very_long_account_id_that_exceeds_limits',
    );
    assert.ok(tag.length <= 64);
  });

  it('short inputs produce exact deterministic output', () => {
    const tag = generateVerificationTag('s1', 'a1');
    assert.equal(tag, 'vaeo-gsc-verify-s1-a1');
  });

  it('never throws on empty strings', () => {
    assert.doesNotThrow(() => generateVerificationTag('', ''));
  });
});

// ── buildVerificationMetaTag ──────────────────────────────────────────────────

describe('buildVerificationMetaTag', () => {
  it('returns valid HTML meta tag', () => {
    const html = buildVerificationMetaTag('my-token');
    assert.ok(html.startsWith('<meta'));
    assert.ok(html.endsWith('/>'));
  });

  it('includes google-site-verification name', () => {
    const html = buildVerificationMetaTag('my-token');
    assert.ok(html.includes('google-site-verification'));
  });

  it('includes token as content', () => {
    const html = buildVerificationMetaTag('my-token-123');
    assert.ok(html.includes('my-token-123'));
  });

  it('never throws on empty token', () => {
    assert.doesNotThrow(() => buildVerificationMetaTag(''));
  });
});

// ── addPropertyToGSC ─────────────────────────────────────────────────────────

describe('addPropertyToGSC', () => {
  it('calls fetchFn with correct GSC API URL', async () => {
    const calls: string[] = [];
    await addPropertyToGSC('example.com', 'acct_1', 'tok', {
      fetchFn: async (url) => {
        calls.push(url as string);
        return { ok: true, text: async () => '' } as Response;
      },
    });
    assert.ok(calls[0]?.includes('searchconsole.googleapis.com'));
    assert.ok(calls[0]?.includes('sc-domain'));
  });

  it('calls fetchFn with PUT method', async () => {
    const methods: string[] = [];
    await addPropertyToGSC('example.com', 'acct_1', 'tok', {
      fetchFn: async (_url, opts) => {
        methods.push((opts as RequestInit)?.method ?? '');
        return { ok: true, text: async () => '' } as Response;
      },
    });
    assert.equal(methods[0], 'PUT');
  });

  it('returns success=true on 200', async () => {
    const result = await addPropertyToGSC('example.com', 'acct_1', 'tok', {
      fetchFn: async () => ({ ok: true, text: async () => '' } as Response),
    });
    assert.equal(result.success, true);
  });

  it('returns success=false on non-OK response', async () => {
    const result = await addPropertyToGSC('example.com', 'acct_1', 'tok', {
      fetchFn: async () => ({ ok: false, status: 403, text: async () => 'Forbidden' } as Response),
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('403'));
  });

  it('returns success=false when fetchFn throws', async () => {
    const result = await addPropertyToGSC('example.com', 'acct_1', 'tok', {
      fetchFn: async () => { throw new Error('network error'); },
    });
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('network error'));
  });

  it('never throws even when fetchFn throws', async () => {
    await assert.doesNotReject(() =>
      addPropertyToGSC('x.com', 'a', 't', { fetchFn: async () => { throw new Error('X'); } }),
    );
  });
});

// ── checkVerificationStatus ───────────────────────────────────────────────────

describe('checkVerificationStatus', () => {
  it('returns verified=true when permissionLevel is set', async () => {
    const result = await checkVerificationStatus('sc-domain:x.com', 'tok', {
      fetchFn: async () => ({
        ok:   true,
        status: 200,
        json: async () => ({ permissionLevel: 'siteOwner' }),
        text: async () => '',
      } as Response),
    });
    assert.equal(result.verified, true);
  });

  it('returns verified=false when permissionLevel is siteUnverifiedUser', async () => {
    const result = await checkVerificationStatus('sc-domain:x.com', 'tok', {
      fetchFn: async () => ({
        ok:   true,
        status: 200,
        json: async () => ({ permissionLevel: 'siteUnverifiedUser' }),
        text: async () => '',
      } as Response),
    });
    assert.equal(result.verified, false);
  });

  it('returns verified=false on 404', async () => {
    const result = await checkVerificationStatus('sc-domain:x.com', 'tok', {
      fetchFn: async () => ({ ok: false, status: 404, text: async () => '' } as Response),
    });
    assert.equal(result.verified, false);
  });

  it('returns verified=false when fetchFn throws', async () => {
    const result = await checkVerificationStatus('sc-domain:x.com', 'tok', {
      fetchFn: async () => { throw new Error('timeout'); },
    });
    assert.equal(result.verified, false);
    assert.ok(result.error?.includes('timeout'));
  });

  it('never throws when fetchFn throws', async () => {
    await assert.doesNotReject(() =>
      checkVerificationStatus('sc-domain:x.com', 't', { fetchFn: async () => { throw new Error('X'); } }),
    );
  });
});
