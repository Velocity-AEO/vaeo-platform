/**
 * tools/viewport/viewport_capture.ts
 *
 * Viewport capture types, configuration, and pure helper functions.
 * No I/O. Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface Viewport {
  name:   string;
  width:  number;
  height: number;
}

export interface ViewportScreenshot {
  viewport:    Viewport;
  stage:       'before' | 'after';
  url:         string;
  key:         string;   // storage key: {site_id}/{fix_id}/{viewport_name}/{stage}.png
  captured_at: string;
  success:     boolean;
  error?:      string;
}

export interface ViewportCapturePair {
  fix_id:               string;
  site_id:              string;
  url:                  string;
  before:               ViewportScreenshot[];
  after:                ViewportScreenshot[];
  all_viewports_clean:  boolean;   // true only if all 8 screenshots have success=true
  captured_at:          string;
}

// ── Config ───────────────────────────────────────────────────────────────────

export const VIEWPORTS: Viewport[] = [
  { name: 'mobile',  width:  375, height:  812 },
  { name: 'tablet',  width:  768, height: 1024 },
  { name: 'laptop',  width: 1280, height:  800 },
  { name: 'wide',    width: 1920, height: 1080 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a storage key of the form:
 *   {site_id}/{fix_id}/{viewport_name}/{stage}.png
 */
export function buildScreenshotKey(
  site_id:       string,
  fix_id:        string,
  viewport_name: string,
  stage:         'before' | 'after',
): string {
  try {
    return `${site_id}/${fix_id}/${viewport_name}/${stage}.png`;
  } catch {
    return `unknown/unknown/unknown/${stage}.png`;
  }
}

/**
 * Builds a ViewportCapturePair from pre-captured before/after screenshot arrays.
 * all_viewports_clean = true only when every screenshot in both arrays has success=true.
 */
export function buildCapturePair(
  url:     string,
  fix_id:  string,
  site_id: string,
  before:  ViewportScreenshot[],
  after:   ViewportScreenshot[],
): ViewportCapturePair {
  try {
    const all = [...before, ...after];
    const all_viewports_clean = all.length === 8 && all.every((s) => s.success);
    return {
      fix_id,
      site_id,
      url,
      before,
      after,
      all_viewports_clean,
      captured_at: new Date().toISOString(),
    };
  } catch {
    return {
      fix_id,
      site_id,
      url,
      before: [],
      after: [],
      all_viewports_clean: false,
      captured_at: new Date().toISOString(),
    };
  }
}
