/**
 * apps/dashboard/lib/canonical_conflict_display.ts
 *
 * Display logic for canonical conflicts and link limit violations.
 * All functions never throw.
 */

// ── Types (inlined for bundler) ──────────────────────────────────────────────

export type CanonicalConflictType =
  | 'links_to_non_canonical'
  | 'canonical_chain'
  | 'self_canonical_mismatch'
  | 'missing_canonical_on_target';

export type FixAction =
  | 'update_link_to_canonical'
  | 'add_canonical_to_target'
  | 'investigate';

export type LinkLimitSeverity = 'critical' | 'high' | 'medium';

// ── Conflict type labels ─────────────────────────────────────────────────────

const CONFLICT_TYPE_LABELS: Record<CanonicalConflictType, string> = {
  links_to_non_canonical: 'Links to Non-Canonical URL',
  canonical_chain: 'Canonical Chain Detected',
  self_canonical_mismatch: 'Self-Canonical Mismatch',
  missing_canonical_on_target: 'Missing Canonical on Target',
};

export function getConflictTypeLabel(type: CanonicalConflictType): string {
  try {
    return CONFLICT_TYPE_LABELS[type] ?? 'Unknown Conflict';
  } catch {
    return 'Unknown Conflict';
  }
}

// ── Fix action labels ────────────────────────────────────────────────────────

const FIX_ACTION_LABELS: Record<FixAction, string> = {
  update_link_to_canonical: 'Update Link',
  add_canonical_to_target: 'Add Canonical',
  investigate: 'Review',
};

export function getConflictFixLabel(action: FixAction): string {
  try {
    return FIX_ACTION_LABELS[action] ?? 'Review';
  } catch {
    return 'Review';
  }
}

// ── Auto-fixable check ───────────────────────────────────────────────────────

export function isAutoFixable(action: FixAction): boolean {
  try {
    return action === 'update_link_to_canonical';
  } catch {
    return false;
  }
}

// ── Link limit severity colors ───────────────────────────────────────────────

const SEVERITY_COLORS: Record<LinkLimitSeverity, string> = {
  critical: 'text-red-600',
  high: 'text-orange-600',
  medium: 'text-yellow-600',
};

export function getLinkLimitSeverityColor(severity: LinkLimitSeverity): string {
  try {
    return SEVERITY_COLORS[severity] ?? 'text-slate-600';
  } catch {
    return 'text-slate-600';
  }
}
