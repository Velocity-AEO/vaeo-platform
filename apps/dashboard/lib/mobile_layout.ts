/**
 * apps/dashboard/lib/mobile_layout.ts
 *
 * Testable layout utilities for mobile-responsive design.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type BreakpointClass = 'mobile' | 'tablet' | 'desktop';

// ── getBreakpointClass ────────────────────────────────────────────────────────

export function getBreakpointClass(width: number): BreakpointClass {
  try {
    const w = width ?? 0;
    if (w < 768) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  } catch {
    return 'mobile';
  }
}

// ── isMobile ──────────────────────────────────────────────────────────────────

export function isMobile(width: number): boolean {
  try {
    return (width ?? 0) < 768;
  } catch {
    return true;
  }
}

// ── getTruncatedText ──────────────────────────────────────────────────────────

export function getTruncatedText(
  text: string,
  max_chars: number,
  mobile: boolean,
): string {
  try {
    const t = text ?? '';
    const limit = mobile ? Math.min(max_chars ?? 40, 40) : (max_chars ?? 100);
    if (t.length <= limit) return t;
    return t.slice(0, limit) + '...';
  } catch {
    return text ?? '';
  }
}

// ── getColumnCount ────────────────────────────────────────────────────────────

export function getColumnCount(mobile: boolean, tablet: boolean): number {
  try {
    if (mobile) return 1;
    if (tablet) return 2;
    return 4;
  } catch {
    return 1;
  }
}

// ── shouldStackLayout ─────────────────────────────────────────────────────────

export function shouldStackLayout(mobile: boolean): boolean {
  try {
    return !!mobile;
  } catch {
    return true;
  }
}
