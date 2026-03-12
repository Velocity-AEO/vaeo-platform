/**
 * tools/live/live_run_config.ts
 *
 * Configuration and state machine for live production fix runs.
 * Manages run lifecycle through phases with immutable state transitions.
 *
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface LiveRunTarget {
  site_id:               string;
  domain:                string;
  platform:              'shopify' | 'wordpress';
  shopify_store_domain?: string;
  max_pages:             number;
  fix_types:             string[];
  dry_run:               boolean;
  require_approval:      boolean;
  notify_on_complete:    boolean;
}

export type LiveRunPhase =
  | 'idle'
  | 'crawling'
  | 'detecting'
  | 'triaging'
  | 'generating'
  | 'sandboxing'
  | 'applying'
  | 'verifying'
  | 'learning'
  | 'complete'
  | 'failed';

export interface PhaseLogEntry {
  phase:      LiveRunPhase;
  entered_at: string;
  message:    string;
}

export interface LiveRunState {
  run_id:              string;
  target:              LiveRunTarget;
  phase:               LiveRunPhase;
  pages_crawled:       number;
  issues_detected:     number;
  issues_triaged:      number;
  fixes_generated:     number;
  fixes_applied:       number;
  fixes_verified:      number;
  fixes_failed:        number;
  sandbox_passes:      number;
  sandbox_failures:    number;
  health_score_before?: number;
  health_score_after?:  number;
  started_at:          string;
  completed_at?:       string;
  duration_ms?:        number;
  error?:              string;
  phase_log:           PhaseLogEntry[];
  dry_run:             boolean;
}

// ── UUID generator ───────────────────────────────────────────────────────────

function generateUUID(): string {
  return `lr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createLiveRun(target: LiveRunTarget): LiveRunState {
  try {
    return {
      run_id:           generateUUID(),
      target,
      phase:            'idle',
      pages_crawled:    0,
      issues_detected:  0,
      issues_triaged:   0,
      fixes_generated:  0,
      fixes_applied:    0,
      fixes_verified:   0,
      fixes_failed:     0,
      sandbox_passes:   0,
      sandbox_failures: 0,
      started_at:       new Date().toISOString(),
      phase_log:        [],
      dry_run:          target.dry_run,
    };
  } catch {
    return {
      run_id:           'lr_error',
      target,
      phase:            'failed',
      pages_crawled:    0,
      issues_detected:  0,
      issues_triaged:   0,
      fixes_generated:  0,
      fixes_applied:    0,
      fixes_verified:   0,
      fixes_failed:     0,
      sandbox_passes:   0,
      sandbox_failures: 0,
      started_at:       new Date().toISOString(),
      error:            'Failed to create live run',
      phase_log:        [],
      dry_run:          target.dry_run,
    };
  }
}

// ── Phase transition ─────────────────────────────────────────────────────────

export function transitionPhase(
  state: LiveRunState,
  phase: LiveRunPhase,
  message: string,
): LiveRunState {
  try {
    const now = new Date().toISOString();
    const entry: PhaseLogEntry = { phase, entered_at: now, message };

    const newState: LiveRunState = {
      ...state,
      phase,
      phase_log: [...state.phase_log, entry],
    };

    if (phase === 'complete' || phase === 'failed') {
      newState.completed_at = now;
      newState.duration_ms = Date.now() - Date.parse(state.started_at);
    }

    if (phase === 'failed') {
      newState.error = message;
    }

    return newState;
  } catch {
    return {
      ...state,
      phase: 'failed',
      error: 'Phase transition failed',
    };
  }
}

// ── Default target ───────────────────────────────────────────────────────────

export function defaultTarget(
  site_id: string,
  domain: string,
  platform: 'shopify' | 'wordpress',
): LiveRunTarget {
  return {
    site_id,
    domain,
    platform,
    max_pages:          50,
    fix_types:          [
      'title_missing',
      'meta_description_missing',
      'image_alt_missing',
      'schema_missing',
      'canonical_missing',
      'lang_missing',
    ],
    dry_run:            false,
    require_approval:   false,
    notify_on_complete: true,
  };
}
