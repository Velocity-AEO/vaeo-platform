/**
 * tools/debug/debug_logger.ts
 *
 * Debug event logger for the VAEO apply pipeline.
 * Captures decisions, fix results, confidence checks,
 * and learning writes into a structured session.
 *
 * Pure — no I/O. Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DebugEvent {
  id:               string;
  timestamp:        string;
  session_id:       string;
  site_id:          string;
  event_type:       'decision' | 'fix_applied' | 'fix_failed'
                  | 'confidence_check' | 'sandbox_run'
                  | 'learning_write' | 'approval_gate';
  issue_type:       string;
  url:              string;
  reasoning:        string;
  input_snapshot?:  Record<string, unknown>;
  output_snapshot?: Record<string, unknown>;
  before_html?:     string;
  after_html?:      string;
  confidence_score?: number;
  health_delta?:    number;
  duration_ms?:     number;
  metadata?:        Record<string, unknown>;
}

export interface DebugSession {
  session_id:     string;
  site_id:        string;
  started_at:     string;
  events:         DebugEvent[];
  fix_count:      number;
  failure_count:  number;
  learning_writes: number;
}

// ── UUID helper ───────────────────────────────────────────────────────────────

function uuid(): string {
  // crypto.randomUUID is available in Node ≥ 14.17 / modern browsers
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: pseudo-random hex (tests/SSR environments)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Session factory ───────────────────────────────────────────────────────────

export function createDebugSession(site_id: string): DebugSession {
  try {
    return {
      session_id:     uuid(),
      site_id,
      started_at:     new Date().toISOString(),
      events:         [],
      fix_count:      0,
      failure_count:  0,
      learning_writes: 0,
    };
  } catch {
    return {
      session_id:     'fallback-session',
      site_id:        site_id ?? '',
      started_at:     new Date().toISOString(),
      events:         [],
      fix_count:      0,
      failure_count:  0,
      learning_writes: 0,
    };
  }
}

// ── Event logger ──────────────────────────────────────────────────────────────

export function logDebugEvent(
  session: DebugSession,
  event:   Omit<DebugEvent, 'id' | 'timestamp' | 'session_id'>,
): DebugEvent {
  try {
    const completed: DebugEvent = {
      ...event,
      id:         uuid(),
      timestamp:  new Date().toISOString(),
      session_id: session.session_id,
    };

    session.events.push(completed);

    if (completed.event_type === 'fix_applied')    session.fix_count++;
    if (completed.event_type === 'fix_failed')     session.failure_count++;
    if (completed.event_type === 'learning_write') session.learning_writes++;

    return completed;
  } catch {
    // Return a minimal safe event without mutating session
    return {
      id:         'error',
      timestamp:  new Date().toISOString(),
      session_id: session?.session_id ?? '',
      site_id:    event?.site_id ?? '',
      event_type: event?.event_type ?? 'decision',
      issue_type: event?.issue_type ?? '',
      url:        event?.url ?? '',
      reasoning:  event?.reasoning ?? '',
    };
  }
}

// ── Session export ────────────────────────────────────────────────────────────

export function exportDebugSession(session: DebugSession): string {
  try {
    return JSON.stringify(session, null, 2);
  } catch {
    return '{}';
  }
}
