/**
 * tools/viewport/screenshot_storage.ts
 *
 * Injectable storage backend for viewport screenshots.
 * Supports supabase and local filesystem backends via injectable deps.
 * Never throws.
 */

import type { ViewportScreenshot } from './viewport_capture.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type UploadFn   = (key: string, data: Buffer) => Promise<{ url: string }>;
export type GetUrlFn   = (key: string) => Promise<string | null>;
export type ListFn     = (prefix: string) => Promise<string[]>;

export interface StorageDeps {
  upload?: UploadFn;
  getUrl?: GetUrlFn;
  list?:   ListFn;
}

export interface StoreScreenshotResult {
  key:     string;
  url:     string;
  ok:      boolean;
  error?:  string;
}

export interface StoredScreenshotMeta {
  key:         string;
  url:         string;
  fix_id:      string;
  site_id:     string;
  viewport:    string;
  stage:       'before' | 'after';
  stored_at:   string;
}

// ── Injection ────────────────────────────────────────────────────────────────

let _deps: StorageDeps = {};

export function _injectStorageDeps(deps: StorageDeps): void {
  _deps = { ..._deps, ...deps };
}

export function _resetStorageDeps(): void {
  _deps = {};
}

// ── No-op defaults (safe for test/offline environments) ──────────────────────

async function defaultUpload(_key: string, _data: Buffer): Promise<{ url: string }> {
  return { url: '' };
}

async function defaultGetUrl(_key: string): Promise<string | null> {
  return null;
}

async function defaultList(_prefix: string): Promise<string[]> {
  return [];
}

// ── storeScreenshot ───────────────────────────────────────────────────────────

/**
 * Uploads a screenshot buffer to storage under the screenshot's key.
 * Returns the public URL. Non-fatal on error.
 */
export async function storeScreenshot(
  shot:  ViewportScreenshot,
  data:  Buffer,
  deps?: StorageDeps,
): Promise<StoreScreenshotResult> {
  try {
    const upload = deps?.upload ?? _deps.upload ?? defaultUpload;
    const { url } = await upload(shot.key, data);
    return { key: shot.key, url, ok: true };
  } catch (err) {
    return {
      key:   shot.key,
      url:   '',
      ok:    false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── getScreenshotUrl ──────────────────────────────────────────────────────────

/**
 * Returns the public URL for a stored screenshot by key.
 * Returns null when not found or on error.
 */
export async function getScreenshotUrl(
  key:   string,
  deps?: StorageDeps,
): Promise<string | null> {
  try {
    const getUrl = deps?.getUrl ?? _deps.getUrl ?? defaultGetUrl;
    return await getUrl(key);
  } catch {
    return null;
  }
}

// ── listScreenshotsForFix ─────────────────────────────────────────────────────

/**
 * Lists all screenshot keys stored under a {site_id}/{fix_id}/ prefix.
 * Returns empty array on error.
 */
export async function listScreenshotsForFix(
  site_id: string,
  fix_id:  string,
  deps?:   StorageDeps,
): Promise<string[]> {
  try {
    const list  = deps?.list ?? _deps.list ?? defaultList;
    const prefix = `${site_id}/${fix_id}/`;
    return await list(prefix);
  } catch {
    return [];
  }
}
