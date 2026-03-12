/**
 * apps/dashboard/lib/fix_expand_logic.ts
 *
 * Pure logic for expand/collapse of fix rows. Never throws.
 */

// ── getExpandedFixId ─────────────────────────────────────────────────────────

export function getExpandedFixId(
  expanded_id: string | null,
  clicked_id: string,
): string | null {
  try {
    if (expanded_id === clicked_id) return null;
    return clicked_id;
  } catch {
    return null;
  }
}

// ── isFixExpanded ────────────────────────────────────────────────────────────

export function isFixExpanded(
  expanded_id: string | null,
  fix_id: string,
): boolean {
  try {
    return expanded_id === fix_id;
  } catch {
    return false;
  }
}
