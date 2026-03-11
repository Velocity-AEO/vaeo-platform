/**
 * tools/sandbox/html_fetcher.test.ts
 *
 * Tests for fetchHtml and FetchError.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchHtml, FetchError, _injectFetch, _resetInjections } from './html_fetcher.js';

afterEach(() => _resetInjections());

function mockResponse(status: number, body: string): Response {
  return {
    ok:     status >= 200 && status < 300,
    status,
    text:   async () => body,
    json:   async () => JSON.parse(body),
  } as unknown as Response;
}

describe('fetchHtml', () => {
  it('returns HTML on 200', async () => {
    _injectFetch(async () => mockResponse(200, '<html><body>Hello</body></html>'));
    const html = await fetchHtml('https://example.com');
    assert.equal(html, '<html><body>Hello</body></html>');
  });

  it('throws FetchError on 404', async () => {
    _injectFetch(async () => mockResponse(404, 'Not Found'));
    await assert.rejects(
      () => fetchHtml('https://example.com/missing'),
      (err: unknown) => {
        assert.ok(err instanceof FetchError);
        assert.equal(err.statusCode, 404);
        assert.equal(err.url, 'https://example.com/missing');
        return true;
      },
    );
  });

  it('throws FetchError on 403', async () => {
    _injectFetch(async () => mockResponse(403, 'Forbidden'));
    await assert.rejects(
      () => fetchHtml('https://example.com/secret'),
      (err: unknown) => {
        assert.ok(err instanceof FetchError);
        assert.equal(err.statusCode, 403);
        return true;
      },
    );
  });

  it('does not retry on 4xx', async () => {
    let callCount = 0;
    _injectFetch(async () => {
      callCount++;
      return mockResponse(404, 'Not Found');
    });
    await assert.rejects(() => fetchHtml('https://example.com'));
    assert.equal(callCount, 1, '4xx should not be retried');
  });

  it('retries on 5xx and succeeds on second attempt', async () => {
    let callCount = 0;
    _injectFetch(async () => {
      callCount++;
      if (callCount === 1) return mockResponse(502, 'Bad Gateway');
      return mockResponse(200, '<html>OK</html>');
    });
    const html = await fetchHtml('https://example.com');
    assert.equal(html, '<html>OK</html>');
    assert.equal(callCount, 2);
  });

  it('throws after max retries on persistent 5xx', async () => {
    let callCount = 0;
    _injectFetch(async () => {
      callCount++;
      return mockResponse(503, 'Service Unavailable');
    });
    await assert.rejects(
      () => fetchHtml('https://example.com'),
      (err: unknown) => {
        assert.ok(err instanceof FetchError);
        assert.equal(err.statusCode, 503);
        return true;
      },
    );
    assert.equal(callCount, 3, 'should attempt 1 + 2 retries = 3 total');
  });

  it('throws FetchError with statusCode=0 on network error', async () => {
    _injectFetch(async () => { throw new Error('ECONNREFUSED'); });
    await assert.rejects(
      () => fetchHtml('https://example.com'),
      (err: unknown) => {
        assert.ok(err instanceof FetchError);
        assert.equal(err.statusCode, 0);
        assert.ok(err.message.includes('ECONNREFUSED'));
        return true;
      },
    );
  });

  it('throws FetchError on timeout (abort)', async () => {
    _injectFetch(async (_url, init) => {
      // Simulate a slow response that gets aborted
      const signal = init?.signal;
      if (signal?.aborted) throw new Error('AbortError');
      await new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('AbortError')), 200);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('AbortError'));
        });
      });
      return mockResponse(200, '');
    });
    await assert.rejects(
      () => fetchHtml('https://example.com', 50),
      (err: unknown) => {
        assert.ok(err instanceof FetchError);
        assert.equal(err.statusCode, 0);
        return true;
      },
    );
  });

  it('uses default timeout when not specified', async () => {
    _injectFetch(async () => mockResponse(200, '<html></html>'));
    const html = await fetchHtml('https://example.com');
    assert.equal(html, '<html></html>');
  });
});

describe('FetchError', () => {
  it('has correct name, url, and statusCode', () => {
    const err = new FetchError('https://example.com', 500, 'Server error');
    assert.equal(err.name, 'FetchError');
    assert.equal(err.url, 'https://example.com');
    assert.equal(err.statusCode, 500);
    assert.equal(err.message, 'Server error');
  });

  it('generates default message when none provided', () => {
    const err = new FetchError('https://example.com/page', 404);
    assert.ok(err.message.includes('404'));
    assert.ok(err.message.includes('https://example.com/page'));
  });
});
