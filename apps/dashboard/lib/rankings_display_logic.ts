/**
 * apps/dashboard/lib/rankings_display_logic.ts
 *
 * Pure display helpers for rankings table.
 * Never throws.
 */

// ── formatPosition ────────────────────────────────────────────────────────────

export function formatPosition(position: number): string {
  try {
    if (position == null || isNaN(position)) return '—';
    return position.toFixed(1);
  } catch {
    return '—';
  }
}

// ── getPositionChange ─────────────────────────────────────────────────────────

export function getPositionChange(
  current: number,
  previous: number | null,
): { delta: number; direction: 'up' | 'down' | 'same' } {
  try {
    if (previous == null || isNaN(current) || isNaN(previous)) {
      return { delta: 0, direction: 'same' };
    }
    const delta = previous - current; // lower position = better = up
    if (delta > 0) return { delta, direction: 'up' };
    if (delta < 0) return { delta: Math.abs(delta), direction: 'down' };
    return { delta: 0, direction: 'same' };
  } catch {
    return { delta: 0, direction: 'same' };
  }
}

// ── getPositionChangeClasses ──────────────────────────────────────────────────

export function getPositionChangeClasses(
  direction: 'up' | 'down' | 'same',
): string {
  try {
    switch (direction) {
      case 'up':   return 'text-green-600';
      case 'down': return 'text-red-600';
      case 'same': return 'text-gray-400';
      default:     return 'text-gray-400';
    }
  } catch {
    return 'text-gray-400';
  }
}

// ── sortRankingsByPosition ────────────────────────────────────────────────────

export function sortRankingsByPosition<T extends { position: number }>(
  rankings: T[],
): T[] {
  try {
    if (!Array.isArray(rankings)) return [];
    return [...rankings].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  } catch {
    return [];
  }
}

// ── truncateKeyword ───────────────────────────────────────────────────────────

export function truncateKeyword(keyword: string, max_length: number): string {
  try {
    if (!keyword) return '';
    if (keyword.length <= max_length) return keyword;
    return keyword.slice(0, max_length) + '…';
  } catch {
    return '';
  }
}
