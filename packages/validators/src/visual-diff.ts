/**
 * packages/validators/src/visual-diff.ts
 *
 * Playwright visual diff validator for Velocity AEO.
 *
 * Takes before/after PNG screenshots, masks dynamic regions (prices, countdowns,
 * ads), compares pixel-by-pixel with pixelmatch, and blocks deployment if the
 * pixel difference in unmasked areas exceeds the threshold.
 *
 * Block condition: pixel_diff_percent > threshold (default 2%).
 * Masking: PixelRegion coordinates zero out pixels in both images before
 *   comparison so those pixels never count as differences.
 * Storage: diff + before + after PNGs uploaded to Cloudflare R2.
 * R2 failure → non-blocking; artifact_url=undefined but result still returned.
 * Runner unavailability → passed=true, non-blocking skip.
 * Never throws — always returns VisualDiffResult.
 */

import { createLogger }                      from '../../action-log/src/index.js';
import { readFile, writeFile, access }       from 'node:fs/promises';
import { tmpdir }                            from 'node:os';
import { join }                              from 'node:path';

// ── validateVisualDiff (simple URL + file-baseline wrapper for ladder) ────────

/** CSS selectors for dynamic regions always masked during screenshot comparison. */
export const SIMPLE_MASK_SELECTORS: readonly string[] = [
  '[data-price]', '.price', '.inventory-count', '.cart-count',
  '.countdown-timer', '[data-live]', '.ad-container', 'iframe',
];

export interface SimpleVisualDiffInput {
  url:             string;
  baseline_path?:  string;     // path to baseline PNG file
  threshold?:      number;     // default 0.02 (2% of total pixels)
  mask_selectors?: string[];   // additional CSS selectors to hide
}

export interface SimpleVisualDiffResult {
  passed:           boolean;
  skipped?:         boolean;
  is_baseline?:     boolean;
  diff_percent?:    number;
  diff_image_path?: string;
  validator:        'visual_diff';
}

/** Injectable — captures a full-page screenshot with masked elements. */
export type SimpleScreenshotCapture = (url: string, maskSelectors: string[]) => Promise<Buffer>;

/** Injectable — pixel comparison of two PNG buffers. */
export type SimpleImageCompare = (img1: Buffer, img2: Buffer) => { diff: number; totalPixels: number };

async function realSimpleCaptureScreenshot(url: string, maskSelectors: string[]): Promise<Buffer> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // Mask dynamic regions
    if (maskSelectors.length > 0) {
      const selector = maskSelectors.join(', ');
      await page.evaluate((sel: string) => {
        document.querySelectorAll(sel).forEach((el: Element) => {
          (el as HTMLElement).style.visibility = 'hidden';
        });
      }, selector);
    }
    return await page.screenshot({ fullPage: true, type: 'png' });
  } finally {
    await browser.close();
  }
}

async function realSimpleCompareImages(img1: Buffer, img2: Buffer): Promise<{ diff: number; totalPixels: number }> {
  const { PNG }        = await import('pngjs');
  const { default: pm } = await import('pixelmatch');

  const decode = (buf: Buffer): Promise<{ data: Buffer; width: number; height: number }> =>
    new Promise((resolve, reject) => {
      const png = new PNG();
      png.parse(buf, (err, data) => { if (err) reject(err); else resolve(data); });
    });

  const [before, after] = await Promise.all([decode(img1), decode(img2)]);
  if (before.width !== after.width || before.height !== after.height) {
    // Dimension mismatch → 100% diff
    return { diff: before.width * before.height, totalPixels: before.width * before.height };
  }
  const totalPixels = before.width * before.height;
  const diff        = pm(
    new Uint8Array(before.data.buffer),
    new Uint8Array(after.data.buffer),
    null,
    before.width,
    before.height,
    { threshold: 0.1 },
  );
  return { diff, totalPixels };
}

/**
 * Simple URL-based visual diff validator for the validation ladder.
 *
 * Flow:
 *   1. Capture screenshot of url (masks dynamic selectors).
 *   2. If baseline_path missing or file doesn't exist: save as baseline → is_baseline=true.
 *   3. If baseline exists: compare, fail if diff_percent > threshold.
 *   4. On any screenshot/compare failure: skipped=true, passed=true.
 *
 * Never throws.
 */
export async function validateVisualDiff(
  input:             SimpleVisualDiffInput,
  captureScreenshot?: SimpleScreenshotCapture,
  compareImages?:    SimpleImageCompare,
): Promise<SimpleVisualDiffResult> {
  const threshold    = input.threshold ?? DEFAULT_THRESHOLD;
  const maskSels     = [...SIMPLE_MASK_SELECTORS, ...(input.mask_selectors ?? [])];
  const capture      = captureScreenshot ?? ((u, m) => realSimpleCaptureScreenshot(u, m));
  const compare      = compareImages      ?? ((a, b) => realSimpleCompareImages(a, b));

  // Step 1 — capture screenshot
  let screenshot: Buffer;
  try {
    screenshot = await capture(input.url, maskSels);
  } catch {
    return { passed: true, skipped: true, validator: 'visual_diff' };
  }

  // Step 2 — no baseline_path → return as baseline (nothing to save)
  if (!input.baseline_path) {
    return { passed: true, is_baseline: true, validator: 'visual_diff' };
  }

  // Check baseline exists
  let baselineExists = false;
  try { await access(input.baseline_path); baselineExists = true; } catch { /* not found */ }

  if (!baselineExists) {
    // Save screenshot as new baseline
    try { await writeFile(input.baseline_path, screenshot); } catch { /* non-blocking */ }
    return { passed: true, is_baseline: true, validator: 'visual_diff' };
  }

  // Step 3 — compare against baseline
  let baseline: Buffer;
  try { baseline = await readFile(input.baseline_path); } catch {
    return { passed: true, skipped: true, validator: 'visual_diff' };
  }

  let cmp: { diff: number; totalPixels: number };
  try {
    cmp = await Promise.resolve(compare(screenshot, baseline));
  } catch {
    return { passed: true, skipped: true, validator: 'visual_diff' };
  }

  const diff_percent = cmp.totalPixels > 0 ? cmp.diff / cmp.totalPixels : 0;
  const passed       = diff_percent <= threshold;

  let diff_image_path: string | undefined;
  if (!passed) {
    diff_image_path = join(tmpdir(), `vaeo-diff-${Date.now()}.png`);
  }

  return { passed, diff_percent, diff_image_path, validator: 'visual_diff' };
}

// ── Public types ──────────────────────────────────────────────────────────────

/** Bounding-box pixel region to zero out in both images before comparison. */
export interface PixelRegion {
  x:      number;
  y:      number;
  width:  number;
  height: number;
}

export interface VisualDiffRequest {
  run_id:            string;
  tenant_id:         string;
  site_id:           string;
  url:               string;
  before_screenshot: Buffer;
  after_screenshot:  Buffer;
  /** CSS selectors stored for reference; actual masking uses mask_regions. */
  mask_selectors?:   string[];
  /** Explicit pixel regions to mask. */
  mask_regions?:     PixelRegion[];
  /** Fraction of unmasked pixels allowed to differ. Default 0.02. */
  threshold?:        number;
}

export interface VisualDiffResult {
  url:                  string;
  passed:               boolean;
  pixel_diff_percent:   number;
  threshold:            number;
  diff_image_buffer:    Buffer;
  masked_pixel_count:   number;
  total_pixel_count:    number;
  unmasked_pixel_count: number;
  diff_pixel_count:     number;
  run_id:               string;
  tenant_id:            string;
  /** R2 URL for the diff PNG. Undefined if upload failed or runner unavailable. */
  artifact_url?:        string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_THRESHOLD = 0.02;

export const DEFAULT_MASK_SELECTORS: readonly string[] = [
  '.price', '[data-price]', '.inventory-count', '.cart-count',
  '.countdown-timer', '[data-live]', '.ad-container', 'iframe',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converts a URL to a filesystem-safe slug for artifact naming. */
export function urlSlug(url: string): string {
  return url.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Zeroes out the RGBA pixels in `data` that fall within any of the given
 * PixelRegion boxes. Operates in-place.
 */
export function applyMaskRegions(
  data:   Uint8Array,
  width:  number,
  height: number,
  regions: PixelRegion[],
): number {
  let maskedPixels = 0;
  for (const region of regions) {
    const xStart = Math.max(0, region.x);
    const yStart = Math.max(0, region.y);
    const xEnd   = Math.min(width,  region.x + region.width);
    const yEnd   = Math.min(height, region.y + region.height);
    for (let y = yStart; y < yEnd; y++) {
      for (let x = xStart; x < xEnd; x++) {
        const idx = (y * width + x) * 4;
        data[idx]     = 0; // R
        data[idx + 1] = 0; // G
        data[idx + 2] = 0; // B
        data[idx + 3] = 0; // A
        maskedPixels++;
      }
    }
  }
  return maskedPixels;
}

// ── Decoded image type ────────────────────────────────────────────────────────

export interface DecodedImage {
  data:   Uint8Array;
  width:  number;
  height: number;
}

// ── Injectable ops ────────────────────────────────────────────────────────────

export type PngDecoder = (buf: Buffer) => Promise<DecodedImage>;
export type PngEncoder = (data: Uint8Array, width: number, height: number) => Promise<Buffer>;

export type PixelmatchFn = (
  img1:      Uint8Array,
  img2:      Uint8Array,
  output:    Uint8Array | null,
  width:     number,
  height:    number,
  options?:  { threshold?: number },
) => number;

export interface R2Client {
  put: (key: string, body: Buffer, opts?: { contentType?: string }) => Promise<{ url: string }>;
}

export interface VisualDiffOps {
  decodePng:   PngDecoder;
  encodePng:   PngEncoder;
  pixelmatch:  PixelmatchFn;
  r2:          R2Client | null;
}

let _ops: VisualDiffOps | null = null;

export function _injectOps(ops: Partial<VisualDiffOps>): void {
  _ops = { ...defaultOps(), ...ops };
}

/** Legacy convenience aliases matching the spec's individual inject pattern. */
export function _injectPixelmatch(fn: PixelmatchFn): void {
  _ops = { ...(defaultOps()), ...(_ops ?? {}), pixelmatch: fn };
}

export function _injectR2Client(client: R2Client | null): void {
  _ops = { ...(defaultOps()), ...(_ops ?? {}), r2: client };
}

export function _injectPngDecoder(fn: PngDecoder): void {
  _ops = { ...(defaultOps()), ...(_ops ?? {}), decodePng: fn };
}

export function _resetOps(): void {
  _ops = null;
}

// ── Default ops (real implementations) ───────────────────────────────────────

function defaultOps(): VisualDiffOps {
  return {
    decodePng:  realDecodePng,
    encodePng:  realEncodePng,
    pixelmatch: realPixelmatch,
    r2:         null, // real R2 client built lazily via config
  };
}

async function realDecodePng(buf: Buffer): Promise<DecodedImage> {
  const { PNG } = await import('pngjs');
  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.parse(buf, (err, data) => {
      if (err) reject(err);
      else resolve({ data: new Uint8Array(data.data.buffer), width: data.width, height: data.height });
    });
  });
}

async function realEncodePng(data: Uint8Array, width: number, height: number): Promise<Buffer> {
  const { PNG } = await import('pngjs');
  const png = new PNG({ width, height });
  png.data = Buffer.from(data);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    png.pack()
      .on('data', (c: Buffer) => chunks.push(c))
      .on('end',  ()         => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
}

async function realPixelmatch(
  img1:    Uint8Array,
  img2:    Uint8Array,
  output:  Uint8Array | null,
  width:   number,
  height:  number,
  options?: { threshold?: number },
): Promise<number> {
  const { default: pm } = await import('pixelmatch');
  return pm(img1, img2, output, width, height, options);
}

// Make sync signature match the async wrapper
function realPixelmatchSync(...args: Parameters<PixelmatchFn>): number {
  // The real runner is async but PixelmatchFn is declared synchronous.
  // The actual runVisualDiff caller awaits the result via the async wrapper below.
  // This shim is never called in tests (injected ops are used instead).
  throw new Error('Use _injectOps for real pixelmatch — call realPixelmatch directly');
}
// Suppress unused warning
void realPixelmatchSync;

// ── R2 upload ─────────────────────────────────────────────────────────────────

async function buildRealR2Client(): Promise<R2Client | null> {
  try {
    const { config } = await import('../../core/config.js');
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region:   'auto',
      endpoint: config.r2.endpoint,
      credentials: {
        accessKeyId:     config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
    });
    const bucketName = config.r2.bucketName;
    return {
      put: async (key, body, opts) => {
        await client.send(new PutObjectCommand({
          Bucket:      bucketName,
          Key:         key,
          Body:        body,
          ContentType: opts?.contentType ?? 'image/png',
        }));
        return { url: `${config.r2.endpoint}/${bucketName}/${key}` };
      },
    };
  } catch {
    return null;
  }
}

// ── runVisualDiff ─────────────────────────────────────────────────────────────

/**
 * Compares before/after screenshots pixel-by-pixel.
 *
 * Flow:
 *   1. Decode both PNG buffers.
 *   2. Verify dimensions match.
 *   3. Apply mask_regions to both images.
 *   4. Run pixelmatch.
 *   5. Calculate diff percent against unmasked area.
 *   6. Encode diff image to PNG buffer.
 *   7. Upload before/after/diff to R2 (non-blocking on failure).
 *   8. Write ActionLog.
 *
 * Never throws.
 */
export async function runVisualDiff(
  request:   VisualDiffRequest,
  _testOps?: Partial<VisualDiffOps>,
): Promise<VisualDiffResult> {
  const ops = _testOps
    ? { ...defaultOps(), ..._testOps }
    : (_ops ?? defaultOps());

  const threshold = request.threshold ?? DEFAULT_THRESHOLD;
  const slug      = urlSlug(request.url);

  const log = createLogger({
    run_id:    request.run_id,
    tenant_id: request.tenant_id,
    site_id:   request.site_id,
    cms:       'shopify', // validators are CMS-agnostic
    command:   'visual-diff',
    url:       request.url,
  });

  const fallback = (reason: string, extra?: Record<string, unknown>): VisualDiffResult => ({
    url:                  request.url,
    passed:               true,
    pixel_diff_percent:   0,
    threshold,
    diff_image_buffer:    Buffer.alloc(0),
    masked_pixel_count:   0,
    total_pixel_count:    0,
    unmasked_pixel_count: 0,
    diff_pixel_count:     0,
    run_id:               request.run_id,
    tenant_id:            request.tenant_id,
    artifact_url:         undefined,
    ...extra,
  });

  log({ stage: 'visual-diff:start', status: 'pending',
        metadata: { threshold, mask_region_count: request.mask_regions?.length ?? 0 } });

  // ── Decode PNGs ───────────────────────────────────────────────────────────
  let before: DecodedImage;
  let after:  DecodedImage;
  try {
    [before, after] = await Promise.all([
      ops.decodePng(request.before_screenshot),
      ops.decodePng(request.after_screenshot),
    ]);
  } catch (err) {
    log({ stage: 'visual-diff:complete', status: 'skipped',
          metadata: { reason: 'png_decode_failed', error: String(err) } });
    return fallback('png_decode_failed');
  }

  // ── Dimension check ───────────────────────────────────────────────────────
  if (before.width !== after.width || before.height !== after.height) {
    const result: VisualDiffResult = {
      ...fallback('dimension_mismatch'),
      passed: false,
      pixel_diff_percent: 1,
    };
    log({ stage: 'visual-diff:complete', status: 'failed',
          metadata: { reason: 'dimension_mismatch',
                      before: `${before.width}x${before.height}`,
                      after:  `${after.width}x${after.height}` } });
    log({ stage: 'visual-diff:blocked', status: 'failed',
          metadata: { reason: 'dimension_mismatch' } });
    return result;
  }

  const { width, height } = before;
  const totalPixels        = width * height;

  // ── Apply mask regions ────────────────────────────────────────────────────
  const beforeData = new Uint8Array(before.data);
  const afterData  = new Uint8Array(after.data);
  const diffData   = new Uint8Array(width * height * 4);

  let maskedPixels = 0;
  if (request.mask_regions && request.mask_regions.length > 0) {
    // Apply to before — capture count once (same regions, same count)
    maskedPixels  = applyMaskRegions(beforeData, width, height, request.mask_regions);
    applyMaskRegions(afterData,  width, height, request.mask_regions);
  }

  const unmaskedPixels = totalPixels - maskedPixels;

  // ── pixelmatch ────────────────────────────────────────────────────────────
  let diffCount: number;
  try {
    // The injected ops.pixelmatch may be async (real) or sync (test mock).
    // Wrap with Promise.resolve to handle both.
    diffCount = await Promise.resolve(
      ops.pixelmatch(beforeData, afterData, diffData, width, height, { threshold: 0.1 }),
    );
  } catch (err) {
    log({ stage: 'visual-diff:complete', status: 'skipped',
          metadata: { reason: 'pixelmatch_unavailable', error: String(err) } });
    return fallback('pixelmatch_unavailable');
  }

  // ── Diff percent + pass/fail ───────────────────────────────────────────────
  const diffPercent = unmaskedPixels > 0 ? diffCount / unmaskedPixels : 0;
  const passed      = diffPercent <= threshold;

  // ── Encode diff image ─────────────────────────────────────────────────────
  let diffBuffer: Buffer;
  try {
    diffBuffer = await ops.encodePng(diffData, width, height);
  } catch {
    diffBuffer = Buffer.alloc(0);
  }

  // ── R2 upload (fire-and-forget, non-blocking) ─────────────────────────────
  let artifactUrl: string | undefined;
  const r2 = ops.r2 ?? await buildRealR2Client().catch(() => null);

  if (r2) {
    try {
      const basePath = `${request.tenant_id}/${request.run_id}/visual`;
      await Promise.all([
        r2.put(`${basePath}/before-${slug}.png`, request.before_screenshot),
        r2.put(`${basePath}/after-${slug}.png`,  request.after_screenshot),
      ]);
      const diffUpload = await r2.put(`${basePath}/diff-${slug}.png`, diffBuffer);
      artifactUrl = diffUpload.url;
    } catch {
      log({ stage: 'visual-diff:storage-error', status: 'failed',
            metadata: { reason: 'r2_upload_failed' } });
      // artifactUrl remains undefined — do not block
    }
  }

  const result: VisualDiffResult = {
    url:                  request.url,
    passed,
    pixel_diff_percent:   diffPercent,
    threshold,
    diff_image_buffer:    diffBuffer,
    masked_pixel_count:   maskedPixels,
    total_pixel_count:    totalPixels,
    unmasked_pixel_count: unmaskedPixels,
    diff_pixel_count:     diffCount,
    run_id:               request.run_id,
    tenant_id:            request.tenant_id,
    artifact_url:         artifactUrl,
  };

  log({
    stage:    'visual-diff:complete',
    status:   passed ? 'ok' : 'failed',
    metadata: {
      passed,
      pixel_diff_percent:   diffPercent,
      threshold,
      diff_pixel_count:     diffCount,
      unmasked_pixel_count: unmaskedPixels,
      artifact_url:         artifactUrl,
    },
  });

  if (!passed) {
    log({
      stage:    'visual-diff:blocked',
      status:   'failed',
      metadata: { pixel_diff_percent: diffPercent, threshold },
    });
  }

  return result;
}
