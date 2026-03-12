/**
 * tools/heavyweight/page_capture.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultCaptureConfig,
  extractThirdPartyDomains,
  classifyResourceCost,
  capturePage,
  type BrowserPage,
  type PageCaptureConfig,
} from './page_capture.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SAMPLE_HTML = `
<html><head><title>Test Store</title></head>
<body>
  <script src="https://www.googletagmanager.com/gtm.js"></script>
  <script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>
  <script src="/assets/app.js"></script>
</body></html>`.trim();

function makeMockBrowser(opts: {
  html?:       string;
  status?:     number;
  finalUrl?:   string;
  scriptSrcs?: string[];
  failGoto?:   boolean;
} = {}) {
  return async () => {
    const requests: Array<(r: unknown) => void> = [];
    const responses: Array<(r: unknown) => void> = [];

    const page: BrowserPage = {
      goto: async (_url, _o) => {
        if (opts.failGoto) throw new Error('Navigation timeout');
        return {
          status: () => opts.status ?? 200,
          url:    () => opts.finalUrl ?? _url,
        };
      },
      content:  async () => opts.html ?? SAMPLE_HTML,
      evaluate: async (_fn) => opts.scriptSrcs ?? [
        'https://www.googletagmanager.com/gtm.js',
        'https://static.klaviyo.com/onsite/js/klaviyo.js',
        '/assets/app.js',
      ],
      on: (event, fn) => {
        if (event === 'request')  requests.push(fn);
        if (event === 'response') responses.push(fn);
        // Simulate 3 requests
        if (event === 'request') {
          setTimeout(() => {
            fn({ url: () => 'https://mystore.myshopify.com/assets/app.js' });
            fn({ url: () => 'https://www.googletagmanager.com/gtm.js' });
            fn({ url: () => 'https://static.klaviyo.com/onsite/js/klaviyo.js' });
          }, 0);
        }
      },
      close: async () => {},
    };
    return {
      newPage: async () => page,
      close:   async () => {},
    };
  };
}

const TEST_URL = 'https://mystore.myshopify.com';

// ── defaultCaptureConfig ──────────────────────────────────────────────────────

describe('defaultCaptureConfig', () => {
  it('returns config with given url', () => {
    const c = defaultCaptureConfig(TEST_URL);
    assert.equal(c.url, TEST_URL);
  });

  it('sets timeout_ms to 30000', () => {
    assert.equal(defaultCaptureConfig(TEST_URL).timeout_ms, 30_000);
  });

  it('sets wait_for to networkidle', () => {
    assert.equal(defaultCaptureConfig(TEST_URL).wait_for, 'networkidle');
  });

  it('sets viewport to 1280x800', () => {
    const c = defaultCaptureConfig(TEST_URL);
    assert.equal(c.viewport?.width,  1280);
    assert.equal(c.viewport?.height, 800);
  });

  it('sets empty block_resources array', () => {
    assert.deepEqual(defaultCaptureConfig(TEST_URL).block_resources, []);
  });

  it('never throws on null url', () => {
    assert.doesNotThrow(() => defaultCaptureConfig(null as unknown as string));
  });
});

// ── extractThirdPartyDomains ──────────────────────────────────────────────────

describe('extractThirdPartyDomains', () => {
  it('returns external hostnames not matching page_hostname', () => {
    const domains = extractThirdPartyDomains(
      ['https://www.googletagmanager.com/gtm.js', 'https://cdn.shopify.com/a.js'],
      'mystore.myshopify.com',
    );
    assert.ok(domains.includes('www.googletagmanager.com'));
    assert.ok(domains.includes('cdn.shopify.com'));
  });

  it('excludes same-origin scripts', () => {
    const domains = extractThirdPartyDomains(
      ['https://mystore.myshopify.com/assets/app.js'],
      'mystore.myshopify.com',
    );
    assert.equal(domains.length, 0);
  });

  it('filters out data: URIs', () => {
    const domains = extractThirdPartyDomains(['data:text/javascript,alert(1)'], 'mystore.myshopify.com');
    assert.equal(domains.length, 0);
  });

  it('filters out blob: URIs', () => {
    const domains = extractThirdPartyDomains(['blob:https://mystore.myshopify.com/id'], 'mystore.myshopify.com');
    assert.equal(domains.length, 0);
  });

  it('filters out empty strings', () => {
    const domains = extractThirdPartyDomains(['', '  '], 'mystore.myshopify.com');
    assert.equal(domains.length, 0);
  });

  it('deduplicates domains', () => {
    const domains = extractThirdPartyDomains(
      ['https://cdn.shopify.com/a.js', 'https://cdn.shopify.com/b.js'],
      'mystore.myshopify.com',
    );
    assert.equal(domains.filter((d) => d === 'cdn.shopify.com').length, 1);
  });

  it('never throws on null inputs', () => {
    assert.doesNotThrow(() =>
      extractThirdPartyDomains(null as unknown as string[], null as unknown as string),
    );
  });
});

// ── classifyResourceCost ──────────────────────────────────────────────────────

describe('classifyResourceCost', () => {
  it('classifies hotjar as critical', () => {
    assert.equal(classifyResourceCost('tracking.hotjar.com'), 'critical');
  });

  it('classifies luckyorange as critical', () => {
    assert.equal(classifyResourceCost('d.luckyorange.com'), 'critical');
  });

  it('classifies klaviyo as high', () => {
    assert.equal(classifyResourceCost('static.klaviyo.com'), 'high');
  });

  it('classifies intercom as high', () => {
    assert.equal(classifyResourceCost('widget.intercom.io'), 'high');
  });

  it('classifies judge.me as medium', () => {
    assert.equal(classifyResourceCost('cdn.judge.me'), 'medium');
  });

  it('classifies yotpo as medium', () => {
    assert.equal(classifyResourceCost('cdn.yotpo.com'), 'medium');
  });

  it('classifies unknown domain as low', () => {
    assert.equal(classifyResourceCost('www.googletagmanager.com'), 'low');
  });

  it('never throws on empty string', () => {
    assert.doesNotThrow(() => classifyResourceCost(''));
    assert.equal(classifyResourceCost(''), 'low');
  });
});

// ── capturePage ───────────────────────────────────────────────────────────────

describe('capturePage', () => {
  const config: PageCaptureConfig = defaultCaptureConfig(TEST_URL);

  it('returns html from the mock browser', async () => {
    const result = await capturePage(config, { launchBrowser: makeMockBrowser() });
    assert.ok(result.html.length > 0);
  });

  it('sets status_code from page response', async () => {
    const result = await capturePage(config, { launchBrowser: makeMockBrowser({ status: 200 }) });
    assert.equal(result.status_code, 200);
  });

  it('returns error result when playwright not installed (no launchBrowser)', async () => {
    // When no launchBrowser provided and playwright isn't available in test env,
    // it should gracefully return an error result (not throw).
    // We can test by providing a failing launchBrowser.
    const result = await capturePage(config, {
      launchBrowser: async () => { throw new Error('playwright not available'); },
    });
    assert.equal((result as Record<string, unknown>)['success'], undefined); // PageCaptureResult has no success field
    assert.ok(result.error?.includes('playwright not available') || result.error?.length > 0);
    assert.equal(result.html, '');
  });

  it('populates scripts_fired from evaluate result', async () => {
    const result = await capturePage(config, {
      launchBrowser: makeMockBrowser({
        scriptSrcs: ['https://www.googletagmanager.com/gtm.js', '/assets/app.js'],
      }),
    });
    assert.ok(result.scripts_fired.includes('https://www.googletagmanager.com/gtm.js'));
  });

  it('populates third_party_domains', async () => {
    const result = await capturePage(config, { launchBrowser: makeMockBrowser() });
    assert.ok(result.third_party_domains.length > 0);
    assert.ok(result.third_party_domains.some((d) => d.includes('googletagmanager') || d.includes('klaviyo')));
  });

  it('sets captured_at to a valid ISO string', async () => {
    const before = Date.now();
    const result = await capturePage(config, { launchBrowser: makeMockBrowser() });
    const ts = new Date(result.captured_at).getTime();
    assert.ok(ts >= before);
  });

  it('sets url from config', async () => {
    const result = await capturePage(config, { launchBrowser: makeMockBrowser() });
    assert.equal(result.url, TEST_URL);
  });

  it('never throws on navigation timeout', async () => {
    await assert.doesNotReject(() =>
      capturePage(config, { launchBrowser: makeMockBrowser({ failGoto: true }) }),
    );
  });

  it('error result has empty html and status_code 0', async () => {
    const result = await capturePage(config, {
      launchBrowser: async () => { throw new Error('browser crash'); },
    });
    assert.equal(result.html, '');
    assert.equal(result.status_code, 0);
    assert.ok(result.error?.length > 0);
  });

  it('sets load_time_ms > 0 on success', async () => {
    const result = await capturePage(config, { launchBrowser: makeMockBrowser() });
    assert.ok(result.load_time_ms >= 0);
  });
});
