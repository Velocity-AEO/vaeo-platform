/**
 * apps/dashboard/lib/screenshot_strip_logic.ts
 *
 * Pure logic for the viewport screenshot strip. Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ViewportStripItem {
  name:       string;
  width:      number;
  before_url: string | null;
  after_url:  string | null;
  clean:      boolean;
  label:      string;
}

interface ScreenshotEntry {
  viewport: { name: string; width: number };
  screenshot_key: string;
  success: boolean;
}

interface CapturePairInput {
  before:               ScreenshotEntry[];
  after:                ScreenshotEntry[];
  all_viewports_clean:  boolean;
}

// ── Label map ────────────────────────────────────────────────────────────────

const LABEL_MAP: Record<string, string> = {
  mobile: 'Mobile',
  tablet: 'Tablet',
  laptop: 'Laptop',
  wide:   'Wide',
};

// ── getViewportLabel ─────────────────────────────────────────────────────────

export function getViewportLabel(name: string, width: number): string {
  try {
    const base = LABEL_MAP[name] ?? name;
    return `${base} (${width}px)`;
  } catch {
    return `${name} (${width}px)`;
  }
}

// ── buildStripItems ──────────────────────────────────────────────────────────

export function buildStripItems(
  pair:    CapturePairInput,
  get_url: (key: string) => string | null,
): ViewportStripItem[] {
  try {
    const before_map = new Map<string, ScreenshotEntry>();
    for (const entry of (pair.before ?? [])) {
      before_map.set(entry.viewport.name, entry);
    }

    const after_map = new Map<string, ScreenshotEntry>();
    for (const entry of (pair.after ?? [])) {
      after_map.set(entry.viewport.name, entry);
    }

    // Collect all viewport names in order
    const seen = new Set<string>();
    const names: string[] = [];
    for (const entry of [...(pair.before ?? []), ...(pair.after ?? [])]) {
      if (!seen.has(entry.viewport.name)) {
        seen.add(entry.viewport.name);
        names.push(entry.viewport.name);
      }
    }

    return names.map((name): ViewportStripItem => {
      const b = before_map.get(name);
      const a = after_map.get(name);
      const width = b?.viewport.width ?? a?.viewport.width ?? 0;
      const before_ok = b?.success ?? false;
      const after_ok  = a?.success ?? false;

      return {
        name,
        width,
        before_url: before_ok ? get_url(b!.screenshot_key) : null,
        after_url:  after_ok  ? get_url(a!.screenshot_key) : null,
        clean:      before_ok && after_ok,
        label:      getViewportLabel(name, width),
      };
    });
  } catch {
    return [];
  }
}

// ── getActiveViewport ────────────────────────────────────────────────────────

export function getActiveViewport(
  items:         ViewportStripItem[],
  selected_name: string,
): ViewportStripItem | null {
  try {
    if (!items || items.length === 0) return null;
    const found = items.find((i) => i.name === selected_name);
    return found ?? items[0];
  } catch {
    return null;
  }
}
