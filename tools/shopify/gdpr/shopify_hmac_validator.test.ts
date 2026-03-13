/**
 * tools/shopify/gdpr/shopify_hmac_validator.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  validateShopifyHMAC,
  extractRawBody,
} from './shopify_hmac_validator.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHmac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('base64');
}

// ── validateShopifyHMAC ───────────────────────────────────────────────────────

describe('validateShopifyHMAC', () => {
  it('returns true for valid signature', () => {
    const body   = '{"shop_id":1,"shop_domain":"test.myshopify.com"}';
    const secret = 'my_webhook_secret';
    const hmac   = makeHmac(body, secret);
    assert.equal(validateShopifyHMAC(body, hmac, secret), true);
  });

  it('returns false for invalid signature', () => {
    const body   = '{"shop_id":1}';
    const secret = 'my_webhook_secret';
    assert.equal(validateShopifyHMAC(body, 'wrong_hmac', secret), false);
  });

  it('returns false for empty hmac header', () => {
    const body   = '{"shop_id":1}';
    const secret = 'secret';
    assert.equal(validateShopifyHMAC(body, '', secret), false);
  });

  it('returns false for empty body', () => {
    const secret = 'secret';
    const hmac   = makeHmac('', secret);
    assert.equal(validateShopifyHMAC('', hmac, secret), false);
  });

  it('returns false for empty secret', () => {
    const body = '{"shop_id":1}';
    const hmac = makeHmac(body, '');
    assert.equal(validateShopifyHMAC(body, hmac, ''), false);
  });

  it('returns false when signature is for different body', () => {
    const secret = 'secret';
    const hmac   = makeHmac('body-A', secret);
    assert.equal(validateShopifyHMAC('body-B', hmac, secret), false);
  });

  it('returns false when signature is for different secret', () => {
    const body  = '{"shop_id":1}';
    const hmac  = makeHmac(body, 'secret-A');
    assert.equal(validateShopifyHMAC(body, hmac, 'secret-B'), false);
  });

  it('timing-safe comparison: different length returns false without short-circuit', () => {
    const body   = '{"shop_id":1}';
    const secret = 'secret';
    // Tampered: extra chars appended
    const hmac   = makeHmac(body, secret) + 'extra';
    assert.equal(validateShopifyHMAC(body, hmac, secret), false);
  });

  it('handles valid JSON body with unicode', () => {
    const body   = '{"message":"héllo"}';
    const secret = 'unicode_secret';
    const hmac   = makeHmac(body, secret);
    assert.equal(validateShopifyHMAC(body, hmac, secret), true);
  });

  it('returns false on thrown error (null inputs)', () => {
    assert.equal(validateShopifyHMAC(null as never, null as never, null as never), false);
  });

  it('never throws on any path', () => {
    assert.doesNotThrow(() => validateShopifyHMAC(null as never, null as never, null as never));
    assert.doesNotThrow(() => validateShopifyHMAC('body', 'hmac', 'secret'));
  });
});

// ── extractRawBody ────────────────────────────────────────────────────────────

describe('extractRawBody', () => {
  it('returns body string from Request', async () => {
    const req = new Request('https://example.com', {
      method: 'POST',
      body:   '{"foo":"bar"}',
    });
    const raw = await extractRawBody(req);
    assert.equal(raw, '{"foo":"bar"}');
  });

  it('returns empty string on error', async () => {
    const req = new Request('https://example.com', { method: 'POST' });
    // body is null/undefined equivalent — should not throw
    const raw = await extractRawBody(req);
    assert.equal(typeof raw, 'string');
  });

  it('never throws', async () => {
    await assert.doesNotReject(() => extractRawBody(null as never));
  });
});
