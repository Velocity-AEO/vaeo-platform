/**
 * packages/validators/src/visual-diff.test.ts
 *
 * Tests for the visual-diff validator.
 * All external deps (pngjs, pixelmatch, R2) are injected via _testOps.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  runVisualDiff,
  applyMaskRegions,
  urlSlug,
  DEFAULT_THRESHOLD,
  type VisualDiffRequest,
  type VisualDiffOps,
  type DecodedImage,
  type PixelRegion,
} from './visual-diff.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Creates a minimal RGBA buffer for a w×h image, all pixels set to `fill`. */
function makePixels(w: number, h: number, fill: number[] = [0, 0, 0, 255]): Uint8Array {
  const buf = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4]     = fill[0]!;
    buf[i * 4 + 1] = fill[1]!;
    buf[i * 4 + 2] = fill[2]!;
    buf[i * 4 + 3] = fill[3]!;
  }
  return buf;
}

/** Creates a `DecodedImage` for w×h filled with `fill` colour. */
function makeImage(w: number, h: number, fill?: number[]): DecodedImage {
  return { data: makePixels(w, h, fill), width: w, height: h };
}

/** Minimal ops: instant decode (returns the provided images in order), sync pixelmatch. */
function makeOps(
  images:     [DecodedImage, DecodedImage],
  diffPixels: number,
  opts?: {
    r2Put?: (key: string, body: Buffer) => Promise<{ url: string }>;
    encodeErr?: boolean;
  },
): Partial<VisualDiffOps> {
  let callCount = 0;
  return {
    decodePng: async (_buf) => images[callCount++ % 2]!,
    encodePng: opts?.encodeErr
      ? async () => { throw new Error('encode failed'); }
      : async () => Buffer.from('fake-png'),
    pixelmatch: (_a, _b, _out, _w, _h, _o) => diffPixels,
    r2: opts?.r2Put
      ? { put: async (key, body, _opts) => opts.r2Put!(key, body) }
      : null,
  };
}

/** Base request fixture. */
function baseReq(overrides: Partial<VisualDiffRequest> = {}): VisualDiffRequest {
  return {
    run_id:            'run-1',
    tenant_id:         'tenant-1',
    site_id:           'site-1',
    url:               'https://example.com/page',
    before_screenshot: Buffer.from('before'),
    after_screenshot:  Buffer.from('after'),
    ...overrides,
  };
}

// ── urlSlug ───────────────────────────────────────────────────────────────────

describe('urlSlug', () => {
  it('replaces non-alphanumeric chars with hyphens', () => {
    assert.equal(urlSlug('https://example.com/page?q=1'), 'https-example-com-page-q-1');
  });

  it('collapses consecutive hyphens', () => {
    assert.equal(urlSlug('a::b'), 'a-b');
  });

  it('strips leading and trailing hyphens', () => {
    assert.equal(urlSlug('!hello!'), 'hello');
  });

  it('leaves alphanumeric chars intact', () => {
    assert.equal(urlSlug('abc123XYZ'), 'abc123XYZ');
  });
});

// ── applyMaskRegions ──────────────────────────────────────────────────────────

describe('applyMaskRegions', () => {
  it('zeroes pixels within the region', () => {
    const data = makePixels(4, 4, [255, 128, 64, 255]);
    // Mask top-left 2×2
    const masked = applyMaskRegions(data, 4, 4, [{ x: 0, y: 0, width: 2, height: 2 }]);
    assert.equal(masked, 4); // 2×2 = 4 pixels
    // First pixel should be zero'd
    assert.equal(data[0], 0);
    assert.equal(data[1], 0);
    assert.equal(data[2], 0);
    assert.equal(data[3], 0);
    // Pixel at (3,3) should still be 255
    const idx = (3 * 4 + 3) * 4;
    assert.equal(data[idx], 255);
  });

  it('returns 0 for empty regions array', () => {
    const data = makePixels(2, 2, [1, 2, 3, 4]);
    assert.equal(applyMaskRegions(data, 2, 2, []), 0);
    // Data unchanged
    assert.equal(data[0], 1);
  });

  it('clamps regions that exceed image bounds', () => {
    const data = makePixels(2, 2, [255, 255, 255, 255]);
    // Region extends beyond image
    const masked = applyMaskRegions(data, 2, 2, [{ x: 1, y: 1, width: 100, height: 100 }]);
    assert.equal(masked, 1); // only pixel (1,1)
  });

  it('accumulates masked count across multiple regions', () => {
    const data = makePixels(4, 4, [255, 0, 0, 255]);
    const masked = applyMaskRegions(data, 4, 4, [
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 3, y: 3, width: 1, height: 1 },
    ]);
    assert.equal(masked, 2);
  });
});

// ── DEFAULT_THRESHOLD ─────────────────────────────────────────────────────────

describe('DEFAULT_THRESHOLD', () => {
  it('is 0.02', () => {
    assert.equal(DEFAULT_THRESHOLD, 0.02);
  });
});

// ── runVisualDiff — identical images ─────────────────────────────────────────

describe('runVisualDiff — identical images (diff=0)', () => {
  it('returns passed=true with pixel_diff_percent=0', async () => {
    const img = makeImage(10, 10);
    const ops = makeOps([img, img], 0);
    const result = await runVisualDiff(baseReq(), ops);
    assert.equal(result.passed, true);
    assert.equal(result.pixel_diff_percent, 0);
    assert.equal(result.diff_pixel_count, 0);
  });

  it('unmasked_pixel_count equals total when no mask regions', async () => {
    const img = makeImage(5, 5);
    const result = await runVisualDiff(baseReq(), makeOps([img, img], 0));
    assert.equal(result.total_pixel_count, 25);
    assert.equal(result.unmasked_pixel_count, 25);
    assert.equal(result.masked_pixel_count, 0);
  });
});

// ── runVisualDiff — large diff blocks ─────────────────────────────────────────

describe('runVisualDiff — large diff exceeds threshold', () => {
  it('returns passed=false when pixel_diff_percent > threshold', async () => {
    // 100 pixels, 5 diffs → 5% > 2% threshold
    const img = makeImage(10, 10);
    const result = await runVisualDiff(baseReq(), makeOps([img, img], 5));
    assert.equal(result.passed, false);
    assert.ok(result.pixel_diff_percent > DEFAULT_THRESHOLD);
  });

  it('includes correct numeric fields', async () => {
    const img = makeImage(10, 10);
    // 47 diffs out of 100 total → 47% diff
    const result = await runVisualDiff(baseReq(), makeOps([img, img], 47));
    assert.equal(result.total_pixel_count, 100);
    assert.equal(result.diff_pixel_count, 47);
    assert.ok(Math.abs(result.pixel_diff_percent - 0.47) < 1e-10);
  });
});

// ── runVisualDiff — within threshold passes ───────────────────────────────────

describe('runVisualDiff — diff within threshold', () => {
  it('passes when diff_percent <= threshold', async () => {
    // 100 pixels, 1 diff → 1% < 2% threshold
    const img = makeImage(10, 10);
    const result = await runVisualDiff(baseReq(), makeOps([img, img], 1));
    assert.equal(result.passed, true);
    assert.ok(result.pixel_diff_percent <= DEFAULT_THRESHOLD);
  });

  it('passes when diff_percent exactly equals threshold', async () => {
    // 100 pixels, 2 diffs → exactly 2%
    const img = makeImage(10, 10);
    const result = await runVisualDiff(baseReq(), makeOps([img, img], 2));
    assert.equal(result.passed, true);
    assert.ok(Math.abs(result.pixel_diff_percent - 0.02) < 1e-10);
  });

  it('respects custom threshold in request', async () => {
    // 100 pixels, 3 diffs → 3%; custom threshold 0.05 → passes
    const img = makeImage(10, 10);
    const result = await runVisualDiff(
      baseReq({ threshold: 0.05 }),
      makeOps([img, img], 3),
    );
    assert.equal(result.passed, true);
    assert.equal(result.threshold, 0.05);
  });
});

// ── runVisualDiff — dimension mismatch ────────────────────────────────────────

describe('runVisualDiff — dimension mismatch', () => {
  it('returns passed=false without throwing', async () => {
    const imgA = makeImage(10, 10);
    const imgB = makeImage(20, 20);
    let decodeCount = 0;
    const ops: Partial<VisualDiffOps> = {
      decodePng: async () => (decodeCount++ === 0 ? imgA : imgB),
      encodePng: async () => Buffer.alloc(0),
      pixelmatch: () => { throw new Error('should not be called'); },
      r2: null,
    };
    const result = await runVisualDiff(baseReq(), ops);
    assert.equal(result.passed, false);
    assert.equal(result.pixel_diff_percent, 1);
  });

  it('does not call pixelmatch on dimension mismatch', async () => {
    const imgA = makeImage(8, 8);
    const imgB = makeImage(16, 8);
    let pixelCalled = false;
    let decodeCount = 0;
    const ops: Partial<VisualDiffOps> = {
      decodePng: async () => (decodeCount++ === 0 ? imgA : imgB),
      encodePng: async () => Buffer.alloc(0),
      pixelmatch: (..._args) => { pixelCalled = true; return 0; },
      r2: null,
    };
    await runVisualDiff(baseReq(), ops);
    assert.equal(pixelCalled, false);
  });
});

// ── runVisualDiff — masked regions ────────────────────────────────────────────

describe('runVisualDiff — masked regions do not count toward diff', () => {
  it('reduces unmasked_pixel_count by masked area', async () => {
    const img = makeImage(10, 10); // 100 pixels
    const result = await runVisualDiff(
      baseReq({ mask_regions: [{ x: 0, y: 0, width: 5, height: 2 }] }), // 10 masked
      makeOps([img, img], 0),
    );
    assert.equal(result.masked_pixel_count, 10);
    assert.equal(result.unmasked_pixel_count, 90);
    assert.equal(result.total_pixel_count, 100);
  });

  it('pixel_diff_percent is relative to unmasked area only', async () => {
    // 100 total, 50 masked → 50 unmasked; 1 diff pixel → 2% of 50 = 2%
    const img = makeImage(10, 10);
    const result = await runVisualDiff(
      baseReq({ mask_regions: [{ x: 0, y: 0, width: 10, height: 5 }] }), // 50 masked
      makeOps([img, img], 1),
    );
    assert.equal(result.unmasked_pixel_count, 50);
    assert.ok(Math.abs(result.pixel_diff_percent - 0.02) < 1e-10);
  });

  it('zero unmasked pixels → diff_percent=0 (no division by zero)', async () => {
    // Mask the entire image
    const img = makeImage(4, 4);
    const result = await runVisualDiff(
      baseReq({ mask_regions: [{ x: 0, y: 0, width: 4, height: 4 }] }),
      makeOps([img, img], 5),
    );
    assert.equal(result.pixel_diff_percent, 0);
    assert.equal(result.passed, true);
  });

  it('multiple mask regions accumulate correctly', async () => {
    const img = makeImage(10, 10); // 100 pixels
    const result = await runVisualDiff(
      baseReq({
        mask_regions: [
          { x: 0, y: 0, width: 2, height: 2 }, // 4 pixels
          { x: 5, y: 5, width: 3, height: 3 }, // 9 pixels
        ],
      }),
      makeOps([img, img], 0),
    );
    assert.equal(result.masked_pixel_count, 13);
    assert.equal(result.unmasked_pixel_count, 87);
  });
});

// ── runVisualDiff — R2 upload failure ─────────────────────────────────────────

describe('runVisualDiff — R2 upload failure is non-blocking', () => {
  it('returns result with artifact_url=undefined when R2 throws', async () => {
    const img = makeImage(5, 5);
    const ops: Partial<VisualDiffOps> = {
      decodePng: async () => img,
      encodePng: async () => Buffer.from('fake-png'),
      pixelmatch: () => 0,
      r2: {
        put: async () => { throw new Error('R2 connection refused'); },
      },
    };
    const result = await runVisualDiff(baseReq(), ops);
    assert.equal(result.artifact_url, undefined);
    assert.equal(result.passed, true); // R2 failure must not affect pass/fail
  });

  it('populates artifact_url when R2 succeeds', async () => {
    const img = makeImage(5, 5);
    const result = await runVisualDiff(
      baseReq(),
      makeOps([img, img], 0, {
        r2Put: async (key) => ({ url: `https://r2.example.com/${key}` }),
      }),
    );
    assert.ok(result.artifact_url?.startsWith('https://r2.example.com/'));
    assert.ok(result.artifact_url?.includes('diff-'));
  });
});

// ── runVisualDiff — runner unavailable (decode failure) ───────────────────────

describe('runVisualDiff — decode failure returns non-blocking pass', () => {
  it('returns passed=true when decodePng throws', async () => {
    const ops: Partial<VisualDiffOps> = {
      decodePng: async () => { throw new Error('pngjs not found'); },
      encodePng: async () => Buffer.alloc(0),
      pixelmatch: () => 0,
      r2: null,
    };
    const result = await runVisualDiff(baseReq(), ops);
    assert.equal(result.passed, true);
    assert.equal(result.pixel_diff_percent, 0);
    assert.equal(result.diff_pixel_count, 0);
  });

  it('returns passed=true when pixelmatch throws', async () => {
    const img = makeImage(5, 5);
    const ops: Partial<VisualDiffOps> = {
      decodePng: async () => img,
      encodePng: async () => Buffer.alloc(0),
      pixelmatch: () => { throw new Error('pixelmatch unavailable'); },
      r2: null,
    };
    const result = await runVisualDiff(baseReq(), ops);
    assert.equal(result.passed, true);
  });
});

// ── runVisualDiff — diff_image_buffer ────────────────────────────────────────

describe('runVisualDiff — diff_image_buffer', () => {
  it('is a non-empty Buffer on success', async () => {
    const img = makeImage(4, 4);
    const result = await runVisualDiff(baseReq(), makeOps([img, img], 0));
    assert.ok(Buffer.isBuffer(result.diff_image_buffer));
    assert.ok(result.diff_image_buffer.length > 0);
  });

  it('is an empty Buffer when encodePng fails', async () => {
    const img = makeImage(4, 4);
    const result = await runVisualDiff(baseReq(), makeOps([img, img], 0, { encodeErr: true }));
    assert.ok(Buffer.isBuffer(result.diff_image_buffer));
    assert.equal(result.diff_image_buffer.length, 0);
    // Encode failure must not affect pass/fail
    assert.equal(result.passed, true);
  });
});

// ── runVisualDiff — result shape ─────────────────────────────────────────────

describe('runVisualDiff — result shape', () => {
  it('includes all required fields with correct types', async () => {
    const img = makeImage(3, 3);
    const result = await runVisualDiff(baseReq(), makeOps([img, img], 0));
    assert.equal(typeof result.url,                  'string');
    assert.equal(typeof result.passed,               'boolean');
    assert.equal(typeof result.pixel_diff_percent,   'number');
    assert.equal(typeof result.threshold,            'number');
    assert.equal(typeof result.masked_pixel_count,   'number');
    assert.equal(typeof result.total_pixel_count,    'number');
    assert.equal(typeof result.unmasked_pixel_count, 'number');
    assert.equal(typeof result.diff_pixel_count,     'number');
    assert.equal(typeof result.run_id,               'string');
    assert.equal(typeof result.tenant_id,            'string');
    assert.ok(Buffer.isBuffer(result.diff_image_buffer));
  });

  it('echoes url, run_id, tenant_id from request', async () => {
    const img = makeImage(2, 2);
    const req = baseReq({
      url: 'https://shop.example.com/products/widget',
      run_id: 'my-run-99',
      tenant_id: 'acme-corp',
    });
    const result = await runVisualDiff(req, makeOps([img, img], 0));
    assert.equal(result.url,       req.url);
    assert.equal(result.run_id,    req.run_id);
    assert.equal(result.tenant_id, req.tenant_id);
  });
});

// ── runVisualDiff — never throws ──────────────────────────────────────────────

describe('runVisualDiff — never throws', () => {
  it('does not throw even when all ops fail', async () => {
    const ops: Partial<VisualDiffOps> = {
      decodePng: async () => { throw new Error('fatal decode'); },
      encodePng: async () => { throw new Error('fatal encode'); },
      pixelmatch: () => { throw new Error('fatal pixelmatch'); },
      r2: { put: async () => { throw new Error('fatal r2'); } },
    };
    await assert.doesNotReject(() => runVisualDiff(baseReq(), ops));
  });
});
